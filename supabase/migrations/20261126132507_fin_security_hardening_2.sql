-- Finance security hardening 2
-- Guard fin_post_elimination and fin_run_recurring;
-- revoke EXECUTE on fin_seed_from_sources from PUBLIC, anon, authenticated;
-- revoke REFERENCES and TRIGGER on fin_insight_log from authenticated.

CREATE OR REPLACE FUNCTION public.fin_post_elimination(p_group_id uuid, p_date date, p_memo text, p_lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_elim uuid;
BEGIN
  IF pg_trigger_depth() = 0 AND NOT public.fin_can_write() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT e.id INTO v_elim FROM public.fin_entities e WHERE e.code = 'ELIM';
  IF v_elim IS NULL THEN RAISE EXCEPTION 'ELIM entity missing'; END IF;
  RETURN public._fin_post_entry_internal(
    v_elim, p_date, p_memo, NULL, p_lines, 'posted', true, NULL
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fin_run_recurring(p_as_of date DEFAULT CURRENT_DATE)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.fin_recurring_templates%ROWTYPE;
  v_count integer := 0;
BEGIN
  IF pg_trigger_depth() = 0 AND NOT public.fin_can_write() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  FOR r IN
    SELECT * FROM public.fin_recurring_templates
    WHERE is_active AND (next_run_on IS NULL OR next_run_on <= p_as_of)
  LOOP
    PERFORM public.fin_post_entry(
      r.entity_id,
      COALESCE(r.next_run_on, p_as_of),
      'Recurring draft: ' || r.name,
      jsonb_build_object(
        'source_type', 'recurring',
        'source_table', 'fin_recurring_templates',
        'source_id', r.id
      ),
      r.lines_template,
      'draft'
    );
    UPDATE public.fin_recurring_templates
    SET next_run_on = COALESCE(r.next_run_on, p_as_of) + interval '1 month'
    WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$
;

REVOKE ALL ON FUNCTION public.fin_seed_from_sources() FROM PUBLIC, anon, authenticated;

REVOKE REFERENCES, TRIGGER ON TABLE public.fin_insight_log FROM authenticated;
