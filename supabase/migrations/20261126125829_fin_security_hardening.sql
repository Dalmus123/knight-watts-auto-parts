-- Finance security hardening
-- 1) RLS + grants on fin_insight_log
-- 2) fin_can_write() guard on public write RPCs (trigger-depth bypass)
-- 3) Revoke EXECUTE on trigger-only helpers
-- 4) Fix mutable search_path on five functions
-- 5) Revoke EXECUTE from anon on finance functions

ALTER TABLE public.fin_insight_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fin_read ON public.fin_insight_log;
DROP POLICY IF EXISTS fin_write ON public.fin_insight_log;

CREATE POLICY fin_read ON public.fin_insight_log
  FOR SELECT TO authenticated
  USING (public.fin_can_read());

CREATE POLICY fin_write ON public.fin_insight_log
  FOR ALL TO authenticated
  USING (public.fin_can_write())
  WITH CHECK (public.fin_can_write());

REVOKE ALL ON TABLE public.fin_insight_log FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.fin_insight_log FROM authenticated;
GRANT SELECT ON TABLE public.fin_insight_log TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_clone_coa(p_entity_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_type public.fin_entity_type;
  v_entity_code text;
  v_inserted integer := 0;
BEGIN
  IF pg_trigger_depth() = 0 AND NOT public.fin_can_write() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT entity_type, code INTO v_type, v_entity_code
  FROM public.fin_entities WHERE id = p_entity_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown entity %', p_entity_id; END IF;

  INSERT INTO public.fin_accounts (
    entity_id, code, name, account_type, normal_balance, fs_statement, fs_line,
    note_ref, cash_flow_class, is_control, control_type, allow_manual_posting,
    etims_required_for_deduction, tax_class, segment_default, is_active
  )
  SELECT
    p_entity_id, t.code, t.name, t.account_type, t.normal_balance, t.fs_statement, t.fs_line,
    t.note_ref, t.cash_flow_class, t.is_control, t.control_type, t.allow_manual_posting,
    t.etims_required_for_deduction, t.tax_class, t.segment_default, true
  FROM public.fin_coa_template t
  WHERE (
    'all' = ANY (t.applies_to)
    OR (v_type = 'parent' AND 'parent' = ANY (t.applies_to))
    OR (v_type = 'subsidiary' AND 'subsidiary' = ANY (t.applies_to))
    OR (v_type = 'elimination' AND 'elimination' = ANY (t.applies_to))
  )
  AND NOT (
    t.code = '1710' AND v_type NOT IN ('parent', 'elimination')
  )
  ON CONFLICT (entity_id, code) DO UPDATE SET
    name = EXCLUDED.name,
    account_type = EXCLUDED.account_type,
    fs_line = EXCLUDED.fs_line,
    is_active = true;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fin_ensure_periods(p_entity_id uuid, p_fy integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start_month smallint;
  m integer;
  v_start date;
  v_end date;
BEGIN
  IF pg_trigger_depth() = 0 AND NOT public.fin_can_write() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT fy_start_month INTO v_start_month FROM public.fin_entities WHERE id = p_entity_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown entity %', p_entity_id; END IF;
  FOR m IN 1..12 LOOP
  -- calendar year periods starting at fy_start_month
    v_start := make_date(p_fy, v_start_month, 1) + ((m - 1) || ' months')::interval;
    v_end := (v_start + interval '1 month' - interval '1 day')::date;
    INSERT INTO public.fin_periods (entity_id, fy, period_no, start_date, end_date, status)
    VALUES (p_entity_id, p_fy, m, v_start, v_end, 'open')
    ON CONFLICT (entity_id, fy, period_no) DO NOTHING;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fin_post_entry(p_entity_id uuid, p_date date, p_memo text, p_source jsonb, p_lines jsonb, p_status fin_entry_status DEFAULT 'posted'::fin_entry_status)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF pg_trigger_depth() = 0 AND NOT public.fin_can_write() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN public._fin_post_entry_internal(p_entity_id, p_date, p_memo, p_source, p_lines, p_status, false, NULL);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fin_post_intercompany(p_link_id uuid, p_date date, p_memo text, p_a jsonb, p_b jsonb)
 RETURNS TABLE(entry_a uuid, entry_b uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_a uuid;
  v_b uuid;
BEGIN
  IF pg_trigger_depth() = 0 AND NOT public.fin_can_write() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  v_a := public._fin_post_entry_internal(
    (p_a->>'entity_id')::uuid, p_date, p_memo, p_a->'source',
    p_a->'lines', 'posted', true, p_link_id
  );
  v_b := public._fin_post_entry_internal(
    (p_b->>'entity_id')::uuid, p_date, p_memo, p_b->'source',
    p_b->'lines', 'posted', true, p_link_id
  );
  RETURN QUERY SELECT v_a, v_b;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fin_repost_source(p_source_table text, p_source_id uuid, p_source_type fin_source_type)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old uuid;
BEGIN
  IF pg_trigger_depth() = 0 AND NOT public.fin_can_write() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT je.id INTO v_old
  FROM public.fin_journal_entries je
  JOIN public.fin_source_documents sd ON sd.id = je.source_document_id
  WHERE sd.source_table = p_source_table AND sd.source_id = p_source_id AND sd.source_type = p_source_type
  ORDER BY je.created_at DESC LIMIT 1;
  IF v_old IS NOT NULL AND (SELECT status FROM public.fin_journal_entries WHERE id = v_old) = 'posted' THEN
    PERFORM public.fin_reverse_entry(v_old);
  END IF;
  RETURN NULL; -- caller must post anew
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fin_reverse_entry(p_entry_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_src public.fin_journal_entries%ROWTYPE;
  v_new_id uuid;
  v_lines jsonb;
BEGIN
  IF pg_trigger_depth() = 0 AND NOT public.fin_can_write() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT * INTO v_src FROM public.fin_journal_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found'; END IF;
  IF v_src.status <> 'posted' THEN RAISE EXCEPTION 'Only posted entries can be reversed'; END IF;
  IF v_src.reversed_by_entry_id IS NOT NULL THEN RAISE EXCEPTION 'Entry already reversed'; END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'account_id', jl.account_id,
      'debit', jl.credit,
      'credit', jl.debit,
      'description', COALESCE(jl.description,'') || ' (reversal)',
      'segment', jl.segment,
      'is_intercompany', jl.is_intercompany,
      'counter_entity_id', jl.counter_entity_id
    ) ORDER BY jl.line_no
  ) INTO v_lines
  FROM public.fin_journal_lines jl WHERE jl.entry_id = p_entry_id;

  v_new_id := public._fin_post_entry_internal(
    v_src.entity_id, CURRENT_DATE, 'Reversal of entry ' || v_src.entry_no,
  jsonb_build_object('source_type','manual','source_table','fin_journal_entries','source_id',p_entry_id::text),
    v_lines, 'posted', true, v_src.ic_link_id
  );

  -- Allow status transition posted -> reversed (immutability trigger permits this)
  UPDATE public.fin_journal_entries SET status = 'reversed', reversed_by_entry_id = v_new_id WHERE id = p_entry_id;
  UPDATE public.fin_journal_entries SET reverses_entry_id = p_entry_id WHERE id = v_new_id;

  RETURN v_new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fin_run_depreciation(p_entity_id uuid, p_period_end date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run_id uuid;
  v_rate numeric(8,4);
  v_lines jsonb := '[]'::jsonb;
  a public.fin_fixed_assets%ROWTYPE;
  v_dep numeric(14,2);
  v_accum_code text;
BEGIN
  IF pg_trigger_depth() = 0 AND NOT public.fin_can_write() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  INSERT INTO public.fin_depreciation_runs (entity_id, period_end, status)
  VALUES (p_entity_id, p_period_end, 'draft')
  ON CONFLICT (entity_id, period_end) DO UPDATE SET status = 'draft'
  RETURNING id INTO v_run_id;

  FOR a IN SELECT * FROM public.fin_fixed_assets WHERE entity_id = p_entity_id AND status = 'active'
  LOOP
    SELECT book_rate_pct INTO v_rate FROM public.fin_depreciation_rates WHERE category = a.category;
    IF v_rate IS NULL THEN CONTINUE; END IF;
    v_dep := round(a.cost * (v_rate / 100) / 12, 2);
    IF v_dep <= 0 THEN CONTINUE; END IF;
    SELECT code INTO v_accum_code FROM public.fin_accounts WHERE id = a.accum_dep_account_id;
    IF v_accum_code IS NULL THEN CONTINUE; END IF;
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '6400', 'debit', v_dep, 'description', 'Depreciation ' || a.asset_code),
      jsonb_build_object('account_code', v_accum_code, 'credit', v_dep, 'description', 'Accum dep ' || a.asset_code)
    );
  END LOOP;

  IF jsonb_array_length(v_lines) = 0 THEN
    RETURN v_run_id;
  END IF;

  PERFORM public.fin_post_entry(
    p_entity_id, p_period_end, 'Depreciation run ' || p_period_end::text,
    jsonb_build_object('source_type','depreciation','source_table','fin_depreciation_runs','source_id',v_run_id::text),
    v_lines,
    'draft'
  );
  RETURN v_run_id;
END;
$function$
;

-- Trigger-only helpers: not callable via PostgREST
REVOKE ALL ON FUNCTION public._fin_auto_post_cogs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fin_auto_post_commission() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fin_auto_post_inventory_adj() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fin_auto_post_order_ar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fin_auto_post_order_receipt() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fin_auto_post_print_job() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fin_check_entry_balance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fin_deny_posted_line_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fin_deny_posted_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fin_internal_stock_flag() FROM PUBLIC, anon, authenticated;

-- Mutable search_path
ALTER FUNCTION public.fin_check_entry_balance() SET search_path = public, pg_temp;
ALTER FUNCTION public.fin_deny_posted_line_mutation() SET search_path = public, pg_temp;
ALTER FUNCTION public.fin_deny_posted_mutation() SET search_path = public, pg_temp;
ALTER FUNCTION public._fin_report_guard() SET search_path = public, pg_temp;
ALTER FUNCTION public.fin_internal_stock_flag() SET search_path = public, pg_temp;

-- Anon has no need to execute any finance function
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND (p.proname LIKE 'fin\_%' OR p.proname LIKE '\_fin\_%')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END
$$;
