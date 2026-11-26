-- Finance — clone CoA, tax/statutory defaults, empty expected seed, open periods

CREATE OR REPLACE FUNCTION public.fin_clone_coa(p_entity_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type public.fin_entity_type;
  v_entity_code text;
  v_inserted integer := 0;
BEGIN
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
$$;

REVOKE ALL ON FUNCTION public.fin_clone_coa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_clone_coa(uuid) TO authenticated;

-- Seed entity charts (PARENT, SHOP, ELIM)
DO $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN SELECT id FROM public.fin_entities WHERE code IN ('PARENT', 'SHOP', 'ELIM')
  LOOP
    PERFORM public.fin_clone_coa(v_id);
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.fin_tax_codes (
  code text PRIMARY KEY,
  name text NOT NULL,
  rate_pct numeric(8,4) NOT NULL DEFAULT 0,
  is_deductible boolean NOT NULL DEFAULT false,
  is_withholding boolean NOT NULL DEFAULT false,
  description text
);

INSERT INTO public.fin_tax_codes (code, name, rate_pct, is_deductible, is_withholding, description)
VALUES
  ('NOVAT', 'No VAT', 0, false, false, 'Out of VAT scope'),
  ('VAT16', 'VAT standard', 16, true, false, 'Standard rated supplies'),
  ('VAT0', 'VAT zero', 0, true, false, 'Zero rated'),
  ('EXEMPT', 'VAT exempt', 0, false, false, 'Exempt supplies'),
  ('WHT3', 'WHT 3%', 3, false, true, 'Withholding on eligible payments'),
  ('VAT-WHT', 'VAT less WHT', 16, true, true, 'Combined VAT/WHT treatment flag')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  rate_pct = EXCLUDED.rate_pct,
  is_deductible = EXCLUDED.is_deductible,
  is_withholding = EXCLUDED.is_withholding;

CREATE TABLE IF NOT EXISTS public.fin_statutory_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_key text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  payload jsonb NOT NULL,
  UNIQUE (rate_key, effective_from)
);

INSERT INTO public.fin_statutory_rates (rate_key, effective_from, payload)
VALUES
  (
    'paye_bands',
    '2024-01-01',
    '{"bands":[{"up_to":24000,"rate_pct":10},{"up_to":32333,"rate_pct":25},{"up_to":500000,"rate_pct":30},{"up_to":800000,"rate_pct":32.5},{"up_to":null,"rate_pct":35}],"personal_relief_monthly":2400}'::jsonb
  ),
  ('nssf', '2024-01-01', '{"tier1_limit":7000,"tier1_rate_pct":6,"tier2_limit":36000,"tier2_rate_pct":6}'::jsonb),
  ('shif', '2024-10-01', '{"rate_pct":2.75,"minimum_contribution":300}'::jsonb),
  ('housing_levy', '2024-01-01', '{"employee_rate_pct":1.5,"employer_rate_pct":1.5}'::jsonb),
  ('nita', '2024-01-01', '{"levy_per_employee_monthly":50}'::jsonb),
  ('corp_tax', '2024-01-01', '{"rate_pct":30}'::jsonb),
  ('personal_relief', '2024-01-01', '{"monthly_amount":2400}'::jsonb)
ON CONFLICT (rate_key, effective_from) DO UPDATE SET payload = EXCLUDED.payload;

CREATE TABLE IF NOT EXISTS public.fin_seed_expected (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('entity', 'consolidated')),
  entity_id uuid REFERENCES public.fin_entities(id),
  group_id uuid REFERENCES public.fin_consolidation_groups(id),
  report text NOT NULL,
  line_key text NOT NULL,
  period daterange,
  amount numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.fin_seed_expected IS 'Optional fixture expectations for pgTAP/report diffs — intentionally empty in migrations';

-- Open periods for current calendar year on all active entities (incl. ELIM)
DO $$
DECLARE
  v_year integer := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  v_ent uuid;
BEGIN
  FOR v_ent IN SELECT id FROM public.fin_entities WHERE is_active
  LOOP
    PERFORM public.fin_ensure_periods(v_ent, v_year);
  END LOOP;
END $$;