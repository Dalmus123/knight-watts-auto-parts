-- Finance — reporting RPCs, insights, consolidation helpers

CREATE TABLE IF NOT EXISTS public.fin_insight_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid REFERENCES public.fin_entities(id),
  group_id uuid REFERENCES public.fin_consolidation_groups(id),
  rule_key text NOT NULL,
  severity public.fin_insight_severity NOT NULL DEFAULT 'info',
  message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public._fin_report_guard()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public.fin_can_read() THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._fin_report_guard() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._fin_resolve_entity_scope(
  p_scope text,
  p_entity_id uuid,
  p_group_id uuid
)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_code text;
BEGIN
  IF p_scope = 'entity' THEN
    IF p_entity_id IS NULL THEN RAISE EXCEPTION 'entity_id required for entity scope'; END IF;
    SELECT code INTO v_code FROM public.fin_entities WHERE id = p_entity_id;
    IF v_code = 'ELIM' THEN
      RAISE EXCEPTION 'ELIM entity is not valid for official entity-scoped reports';
    END IF;
    RETURN ARRAY[p_entity_id];
  ELSIF p_scope = 'consolidated' THEN
    IF p_group_id IS NULL THEN
      SELECT default_group_id INTO p_group_id FROM public.fin_settings WHERE id = 1;
    END IF;
    SELECT COALESCE(array_agg(m.entity_id), '{}')
    INTO v_ids
    FROM public.fin_consolidation_members m
    WHERE m.group_id = p_group_id;
    v_ids := v_ids || COALESCE((SELECT array_agg(id) FROM public.fin_entities WHERE code = 'ELIM'), '{}');
    RETURN v_ids;
  ELSE
    RAISE EXCEPTION 'Unknown scope %', p_scope;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._fin_resolve_entity_scope(text, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._fin_tb_lines(
  p_entity_ids uuid[],
  p_from date,
  p_to date,
  p_segment public.fin_segment DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb)
  FROM (
    SELECT a.code, a.name, a.fs_line,
           COALESCE(SUM(jl.debit),0) AS debit,
           COALESCE(SUM(jl.credit),0) AS credit,
           COALESCE(SUM(jl.debit - jl.credit),0) AS balance
    FROM public.fin_accounts a
    LEFT JOIN public.fin_journal_lines jl ON jl.account_id = a.id
    LEFT JOIN public.fin_journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
      AND je.entry_date BETWEEN p_from AND p_to
    WHERE a.entity_id = ANY (p_entity_ids)
      AND (p_segment IS NULL OR jl.segment IS NULL OR jl.segment = p_segment)
    GROUP BY a.code, a.name, a.fs_line
    ORDER BY a.code
  ) x;
$$;

REVOKE ALL ON FUNCTION public._fin_tb_lines(uuid[], date, date, public.fin_segment) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_report_tb(
  p_scope text,
  p_entity_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_segment public.fin_segment DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  PERFORM public._fin_report_guard();
  v_ids := public._fin_resolve_entity_scope(p_scope, p_entity_id, p_group_id);
  RETURN jsonb_build_object(
    'scope', p_scope,
    'from', p_from,
    'to', p_to,
    'lines', public._fin_tb_lines(v_ids, COALESCE(p_from, '1900-01-01'), COALESCE(p_to, CURRENT_DATE), p_segment)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fin_report_tb(text, uuid, uuid, date, date, public.fin_segment) TO authenticated;
REVOKE ALL ON FUNCTION public.fin_report_tb(text, uuid, uuid, date, date, public.fin_segment) FROM PUBLIC, anon;

-- Thin wrappers sharing TB aggregation
CREATE OR REPLACE FUNCTION public.fin_report_gl(p_scope text, p_entity_id uuid DEFAULT NULL, p_group_id uuid DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_segment public.fin_segment DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public._fin_report_guard();
  RETURN jsonb_build_object('report','gl','detail', public.fin_report_tb(p_scope,p_entity_id,p_group_id,p_from,p_to,p_segment));
END; $$;
GRANT EXECUTE ON FUNCTION public.fin_report_gl(text, uuid, uuid, date, date, public.fin_segment) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_report_sci(p_scope text, p_entity_id uuid DEFAULT NULL, p_group_id uuid DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_segment public.fin_segment DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public._fin_report_guard();
  RETURN jsonb_build_object('report','sci','lines', public._fin_tb_lines(public._fin_resolve_entity_scope(p_scope,p_entity_id,p_group_id), COALESCE(p_from,'1900-01-01'), COALESCE(p_to,CURRENT_DATE), p_segment));
END; $$;
GRANT EXECUTE ON FUNCTION public.fin_report_sci(text, uuid, uuid, date, date, public.fin_segment) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_report_sofp(p_scope text, p_entity_id uuid DEFAULT NULL, p_group_id uuid DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_segment public.fin_segment DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public._fin_report_guard();
  RETURN jsonb_build_object('report','sofp','lines', public._fin_tb_lines(public._fin_resolve_entity_scope(p_scope,p_entity_id,p_group_id), COALESCE(p_from,'1900-01-01'), COALESCE(p_to,CURRENT_DATE), p_segment));
END; $$;
GRANT EXECUTE ON FUNCTION public.fin_report_sofp(text, uuid, uuid, date, date, public.fin_segment) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_report_cf(p_scope text, p_entity_id uuid DEFAULT NULL, p_group_id uuid DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_segment public.fin_segment DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public._fin_report_guard();
  RETURN jsonb_build_object('report','cashflow','lines','[]'::jsonb);
END; $$;
GRANT EXECUTE ON FUNCTION public.fin_report_cf(text, uuid, uuid, date, date, public.fin_segment) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_report_equity(p_scope text, p_entity_id uuid DEFAULT NULL, p_group_id uuid DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_segment public.fin_segment DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public._fin_report_guard();
  RETURN jsonb_build_object('report','equity','lines','[]'::jsonb);
END; $$;
GRANT EXECUTE ON FUNCTION public.fin_report_equity(text, uuid, uuid, date, date, public.fin_segment) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_report_notes(p_scope text, p_entity_id uuid DEFAULT NULL, p_group_id uuid DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_segment public.fin_segment DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public._fin_report_guard();
  RETURN jsonb_build_object('report','notes','sections','[]'::jsonb);
END; $$;
GRANT EXECUTE ON FUNCTION public.fin_report_notes(text, uuid, uuid, date, date, public.fin_segment) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_report_aged_ar(p_scope text, p_entity_id uuid DEFAULT NULL, p_group_id uuid DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_segment public.fin_segment DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public._fin_report_guard();
  RETURN jsonb_build_object('report','aged_ar','buckets','[]'::jsonb);
END; $$;
GRANT EXECUTE ON FUNCTION public.fin_report_aged_ar(text, uuid, uuid, date, date, public.fin_segment) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_report_aged_ap(p_scope text, p_entity_id uuid DEFAULT NULL, p_group_id uuid DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_segment public.fin_segment DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public._fin_report_guard();
  RETURN jsonb_build_object('report','aged_ap','buckets','[]'::jsonb);
END; $$;
GRANT EXECUTE ON FUNCTION public.fin_report_aged_ap(text, uuid, uuid, date, date, public.fin_segment) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_report_worksheet(p_scope text, p_entity_id uuid DEFAULT NULL, p_group_id uuid DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_segment public.fin_segment DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public._fin_report_guard();
  RETURN jsonb_build_object('report','worksheet','rows','[]'::jsonb);
END; $$;
GRANT EXECUTE ON FUNCTION public.fin_report_worksheet(text, uuid, uuid, date, date, public.fin_segment) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_report_ratios(p_scope text, p_entity_id uuid DEFAULT NULL, p_group_id uuid DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_segment public.fin_segment DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public._fin_report_guard();
  RETURN jsonb_build_object('report','ratios','metrics','[]'::jsonb);
END; $$;
GRANT EXECUTE ON FUNCTION public.fin_report_ratios(text, uuid, uuid, date, date, public.fin_segment) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_trace(p_ref text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public._fin_report_guard();
  RETURN jsonb_build_object('ref', p_ref, 'links','[]'::jsonb);
END; $$;
GRANT EXECUTE ON FUNCTION public.fin_trace(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_insights(
  p_scope text DEFAULT 'entity',
  p_entity_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_ids uuid[];
  v_imbalance numeric;
  v_suspense numeric;
  v_unrecon bigint;
BEGIN
  PERFORM public._fin_report_guard();
  v_ids := CASE WHEN p_scope = 'consolidated'
    THEN public._fin_resolve_entity_scope('consolidated', NULL, p_group_id)
    ELSE public._fin_resolve_entity_scope('entity', p_entity_id, NULL)
  END;

  SELECT COALESCE(SUM(jl.debit - jl.credit),0) INTO v_imbalance
  FROM public.fin_journal_lines jl
  JOIN public.fin_journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
  WHERE jl.entity_id = ANY (v_ids);

  IF v_imbalance <> 0 THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object('rule','tb_imbalance','severity','critical','message','Trial balance not zero','delta',v_imbalance));
    INSERT INTO public.fin_insight_log (entity_id, group_id, rule_key, severity, message)
    VALUES (p_entity_id, p_group_id, 'tb_imbalance', 'critical', 'Trial balance not zero');
  END IF;

  SELECT COALESCE(SUM(jl.debit - jl.credit),0) INTO v_suspense
  FROM public.fin_journal_lines jl
  JOIN public.fin_accounts a ON a.id = jl.account_id AND a.code IN ('3900','1900','1195')
  JOIN public.fin_journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
  WHERE jl.entity_id = ANY (v_ids);
  IF v_suspense <> 0 THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object('rule','suspense_balance','severity','warning','message','Suspense accounts have balance'));
  END IF;

  SELECT COUNT(*) INTO v_unrecon FROM public.fin_bank_lines bl
  WHERE bl.entity_id = ANY (v_ids) AND bl.status = 'unmatched';
  IF v_unrecon > 0 THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object('rule','unreconciled_bank','severity','warning','count',v_unrecon));
  END IF;

  RETURN jsonb_build_object('insights', v_out);
END;
$$;
GRANT EXECUTE ON FUNCTION public.fin_insights(text, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_data_health(p_scope text DEFAULT 'entity', p_entity_id uuid DEFAULT NULL, p_group_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public._fin_report_guard();
  RETURN jsonb_build_object('checks', public.fin_insights(p_scope,p_entity_id,p_group_id)->'insights');
END; $$;
GRANT EXECUTE ON FUNCTION public.fin_data_health(text, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_propose_eliminations(p_group_id uuid, p_period_end date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._fin_report_guard();
  IF NOT public.fin_can_write() THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'drafts', '[]'::jsonb,
    'note', 'Proposals only — never auto-posted'
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.fin_propose_eliminations(uuid, date) TO authenticated;