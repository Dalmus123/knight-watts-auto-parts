-- Finance — inventory costing, FAR, payroll, audit log

CREATE TABLE IF NOT EXISTS public.fin_product_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  unit_cost numeric(14,4) NOT NULL DEFAULT 0,
  material_cost_per_gram numeric(14,6),
  inventory_account_id uuid REFERENCES public.fin_accounts(id),
  cogs_account_id uuid REFERENCES public.fin_accounts(id),
  segment public.fin_segment DEFAULT 'AUTOPARTS',
  is_manufactured boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, entity_id)
);

CREATE TABLE IF NOT EXISTS public.fin_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  movement_date date NOT NULL DEFAULT CURRENT_DATE,
  qty_delta numeric(14,4) NOT NULL,
  unit_cost numeric(14,4),
  ref_table text,
  ref_id uuid,
  journal_entry_id uuid REFERENCES public.fin_journal_entries(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_stock_movements_product ON public.fin_stock_movements (entity_id, product_id, movement_date);

CREATE TABLE IF NOT EXISTS public.fin_stock_layers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  layer_date date NOT NULL DEFAULT CURRENT_DATE,
  qty_remaining numeric(14,4) NOT NULL CHECK (qty_remaining >= 0),
  unit_cost numeric(14,4) NOT NULL,
  movement_id uuid REFERENCES public.fin_stock_movements(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.fin_fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  asset_code text NOT NULL,
  description text NOT NULL,
  category text NOT NULL REFERENCES public.fin_depreciation_rates(category),
  acquisition_date date NOT NULL,
  cost numeric(14,2) NOT NULL DEFAULT 0,
  residual_value numeric(14,2) NOT NULL DEFAULT 0,
  status public.fin_asset_status NOT NULL DEFAULT 'active',
  asset_account_id uuid REFERENCES public.fin_accounts(id),
  accum_dep_account_id uuid REFERENCES public.fin_accounts(id),
  dep_expense_account_id uuid REFERENCES public.fin_accounts(id),
  UNIQUE (entity_id, asset_code)
);

CREATE TABLE IF NOT EXISTS public.fin_depreciation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  journal_entry_id uuid REFERENCES public.fin_journal_entries(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, period_end)
);

CREATE OR REPLACE FUNCTION public.fin_run_depreciation(p_entity_id uuid, p_period_end date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
  v_rate numeric(8,4);
  v_lines jsonb := '[]'::jsonb;
  a public.fin_fixed_assets%ROWTYPE;
  v_dep numeric(14,2);
BEGIN
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
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '6300', 'debit', v_dep, 'description', 'Depreciation ' || a.asset_code),
      jsonb_build_object('account_code', a.accum_dep_account_id::text, 'credit', v_dep, 'description', 'Accum dep ' || a.asset_code)
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
$$;

REVOKE ALL ON FUNCTION public.fin_run_depreciation(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_run_depreciation(uuid, date) TO authenticated;

CREATE TABLE IF NOT EXISTS public.fin_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  employee_no text NOT NULL,
  display_name text NOT NULL DEFAULT 'Employee (generic)',
  hire_date date,
  is_active boolean NOT NULL DEFAULT true,
  basic_salary numeric(14,2) NOT NULL DEFAULT 0,
  UNIQUE (entity_id, employee_no)
);

CREATE TABLE IF NOT EXISTS public.fin_payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  run_ref text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status public.fin_doc_status NOT NULL DEFAULT 'draft',
  journal_entry_id uuid REFERENCES public.fin_journal_entries(id),
  UNIQUE (entity_id, run_ref)
);

CREATE TABLE IF NOT EXISTS public.fin_payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  payroll_run_id uuid NOT NULL REFERENCES public.fin_payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.fin_employees(id) ON DELETE CASCADE,
  gross_pay numeric(14,2) NOT NULL DEFAULT 0,
  paye numeric(14,2) NOT NULL DEFAULT 0,
  nssf_employee numeric(14,2) NOT NULL DEFAULT 0,
  shif numeric(14,2) NOT NULL DEFAULT 0,
  housing_levy numeric(14,2) NOT NULL DEFAULT 0,
  other_deductions numeric(14,2) NOT NULL DEFAULT 0,
  net_pay numeric(14,2) NOT NULL DEFAULT 0,
  calc_detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (payroll_run_id, employee_id)
);

CREATE OR REPLACE FUNCTION public.fin_calc_payslip(
  p_gross numeric,
  p_as_of date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paye jsonb;
  v_nssf jsonb;
  v_shif jsonb;
  v_housing jsonb;
  v_relief numeric := 2400;
  v_taxable numeric;
  v_paye_amt numeric := 0;
  v_nssf_amt numeric;
  v_shif_amt numeric;
  v_housing_amt numeric;
  v_net numeric;
BEGIN
  SELECT payload INTO v_paye FROM public.fin_statutory_rates
  WHERE rate_key = 'paye_bands' AND effective_from <= p_as_of
  ORDER BY effective_from DESC LIMIT 1;
  SELECT payload INTO v_nssf FROM public.fin_statutory_rates
  WHERE rate_key = 'nssf' AND effective_from <= p_as_of ORDER BY effective_from DESC LIMIT 1;
  SELECT payload INTO v_shif FROM public.fin_statutory_rates
  WHERE rate_key = 'shif' AND effective_from <= p_as_of ORDER BY effective_from DESC LIMIT 1;
  SELECT payload INTO v_housing FROM public.fin_statutory_rates
  WHERE rate_key = 'housing_levy' AND effective_from <= p_as_of ORDER BY effective_from DESC LIMIT 1;

  v_taxable := GREATEST(p_gross - COALESCE((v_paye->>'personal_relief_monthly')::numeric, v_relief), 0);
  v_paye_amt := round(v_taxable * 0.10, 2); -- simplified band placeholder

  v_nssf_amt := round(LEAST(p_gross, COALESCE((v_nssf->>'tier2_limit')::numeric, 36000)) * 0.06, 2);
  v_shif_amt := round(GREATEST(p_gross * COALESCE((v_shif->>'rate_pct')::numeric, 2.75) / 100,
    COALESCE((v_shif->>'minimum_contribution')::numeric, 300)), 2);
  v_housing_amt := round(p_gross * COALESCE((v_housing->>'employee_rate_pct')::numeric, 1.5) / 100, 2);

  v_net := p_gross - v_paye_amt - v_nssf_amt - v_shif_amt - v_housing_amt;

  RETURN jsonb_build_object(
    'gross_pay', p_gross,
    'paye', v_paye_amt,
    'nssf_employee', v_nssf_amt,
    'shif', v_shif_amt,
    'housing_levy', v_housing_amt,
    'net_pay', v_net,
    'rates_as_of', p_as_of
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fin_calc_payslip(numeric, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_calc_payslip(numeric, date) TO authenticated;

CREATE TABLE IF NOT EXISTS public.fin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid REFERENCES public.fin_entities(id),
  actor_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  object_table text,
  object_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_audit_log_entity ON public.fin_audit_log (entity_id, created_at DESC);