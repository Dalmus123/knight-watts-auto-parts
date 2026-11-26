-- Finance module — core journals, CoA template, posting engine
-- Idempotent. Public schema. No live balances or PII.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.fin_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  fy integer NOT NULL,
  period_no smallint NOT NULL CHECK (period_no BETWEEN 1 AND 12),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status public.fin_period_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, fy, period_no)
);

CREATE INDEX IF NOT EXISTS idx_fin_periods_entity_dates
  ON public.fin_periods (entity_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS public.fin_coa_template (
  code text PRIMARY KEY,
  name text NOT NULL,
  account_type public.fin_account_type NOT NULL,
  normal_balance text NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
  fs_statement text NOT NULL,
  fs_line text NOT NULL,
  note_ref text,
  cash_flow_class text,
  is_control boolean NOT NULL DEFAULT false,
  control_type text,
  allow_manual_posting boolean NOT NULL DEFAULT true,
  etims_required_for_deduction boolean NOT NULL DEFAULT false,
  tax_class text,
  segment_default public.fin_segment,
  applies_to text[] NOT NULL DEFAULT ARRAY['all']::text[]
);

CREATE TABLE IF NOT EXISTS public.fin_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  account_type public.fin_account_type NOT NULL,
  normal_balance text NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
  fs_statement text NOT NULL,
  fs_line text NOT NULL,
  note_ref text,
  cash_flow_class text,
  is_control boolean NOT NULL DEFAULT false,
  control_type text,
  allow_manual_posting boolean NOT NULL DEFAULT true,
  etims_required_for_deduction boolean NOT NULL DEFAULT false,
  tax_class text,
  segment_default public.fin_segment,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, code)
);

CREATE INDEX IF NOT EXISTS idx_fin_accounts_entity ON public.fin_accounts (entity_id, code);

CREATE TABLE IF NOT EXISTS public.fin_source_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  source_type public.fin_source_type NOT NULL,
  source_table text,
  source_id uuid,
  doc_number text,
  doc_date date,
  counterparty text,
  amount numeric(14,2),
  currency text NOT NULL DEFAULT 'KES',
  etims_invoice_no text,
  kra_pin text,
  attachment_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_id, source_type)
);

CREATE TABLE IF NOT EXISTS public.fin_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  entry_no bigint NOT NULL,
  entry_date date NOT NULL,
  period_id uuid REFERENCES public.fin_periods(id),
  memo text,
  status public.fin_entry_status NOT NULL DEFAULT 'draft',
  source_document_id uuid REFERENCES public.fin_source_documents(id),
  reverses_entry_id uuid REFERENCES public.fin_journal_entries(id),
  reversed_by_entry_id uuid REFERENCES public.fin_journal_entries(id),
  is_opening boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  ic_link_id uuid,
  posted_by uuid REFERENCES auth.users(id),
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, entry_no)
);

CREATE INDEX IF NOT EXISTS idx_fin_journal_entries_entity_date
  ON public.fin_journal_entries (entity_id, entry_date DESC);

CREATE TABLE IF NOT EXISTS public.fin_journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.fin_journal_entries(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  account_id uuid NOT NULL REFERENCES public.fin_accounts(id),
  debit numeric(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  segment public.fin_segment,
  customer_id uuid,
  vendor_id uuid,
  employee_id uuid,
  asset_id uuid,
  product_id uuid,
  tax_code text,
  etims_backed boolean NOT NULL DEFAULT false,
  currency text NOT NULL DEFAULT 'KES',
  fx_rate numeric(18,8) NOT NULL DEFAULT 1,
  amount_fcy numeric(14,2),
  description text,
  is_intercompany boolean NOT NULL DEFAULT false,
  counter_entity_id uuid REFERENCES public.fin_entities(id),
  CHECK (
    (debit = 0 AND credit > 0) OR (credit = 0 AND debit > 0)
  ),
  CHECK (debit + credit > 0),
  UNIQUE (entry_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_fin_journal_lines_entry ON public.fin_journal_lines (entry_id);
CREATE INDEX IF NOT EXISTS idx_fin_journal_lines_account ON public.fin_journal_lines (account_id, entity_id);

CREATE TABLE IF NOT EXISTS public.fin_depreciation_rates (
  category text PRIMARY KEY,
  book_rate_pct numeric(8,4),
  capital_allowance_class text,
  ca_rate_pct numeric(8,4)
);

INSERT INTO public.fin_depreciation_rates (category, book_rate_pct, capital_allowance_class, ca_rate_pct)
VALUES
  ('plant_machinery', 12.5, 'IV', 12.5),
  ('motor_vehicles', 25, 'II', 25),
  ('computers', 30, 'II', 30),
  ('furniture', NULL, 'IV', 12.5)
ON CONFLICT (category) DO UPDATE SET
  book_rate_pct = EXCLUDED.book_rate_pct,
  capital_allowance_class = EXCLUDED.capital_allowance_class,
  ca_rate_pct = EXCLUDED.ca_rate_pct;


INSERT INTO public.fin_coa_template (code, name, account_type, normal_balance, fs_statement, fs_line, note_ref, cash_flow_class, is_control, control_type, allow_manual_posting, etims_required_for_deduction, tax_class, segment_default, applies_to)
VALUES
  ('1010', 'Bank account 1', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'bank_cash', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1011', 'Bank account 2', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'bank_cash', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1020', 'Mobile-money float', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'bank_cash', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1030', 'Petty cash, location A', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'bank_cash', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1031', 'Petty cash, location B', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'bank_cash', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1040', 'Cash clearing / undeposited receipts', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'bank_cash', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1100', 'Trade receivables, AR control', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'ar', NULL, NULL, true, 'ar', false, false, NULL, NULL, ARRAY['all']::text[]),
  ('1110', 'Allowance for doubtful debts', 'asset'::public.fin_account_type, 'credit', 'balance_sheet', 'ar', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1150', 'Deposits and prepayments', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'prepayments', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1160', 'Advances to suppliers / unmatched supplier payments', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'other_ca', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1170', 'Staff advances', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'other_ca', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1180', 'Other receivables', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'other_ca', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1190', 'VAT input / VAT refundable', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'tax_receivable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1195', 'Withholding tax receivable', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'tax_receivable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1310', 'Inventory, raw materials', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'inventory', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1320', 'Work in progress', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'inventory', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1330', 'Finished goods, manufactured', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'inventory', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1340', 'Merchandise for resale', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'inventory', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1350', 'Project equipment and materials', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'inventory', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1390', 'Goods received not invoiced / stock in transit', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'inventory', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1510', 'Plant and equipment, cost', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'ppe', NULL, 'investing', false, NULL, true, false, 'IV', NULL, ARRAY['all']::text[]),
  ('1511', 'Plant and equipment, accumulated depreciation', 'asset'::public.fin_account_type, 'credit', 'balance_sheet', 'ppe', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1520', 'Motor vehicles, cost', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'ppe', NULL, 'investing', false, NULL, true, false, 'II', NULL, ARRAY['all']::text[]),
  ('1521', 'Motor vehicles, accumulated depreciation', 'asset'::public.fin_account_type, 'credit', 'balance_sheet', 'ppe', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1530', 'Computers and office equipment, cost', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'ppe', NULL, 'investing', false, NULL, true, false, 'II', NULL, ARRAY['all']::text[]),
  ('1531', 'Computers and office equipment, accumulated depreciation', 'asset'::public.fin_account_type, 'credit', 'balance_sheet', 'ppe', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1540', 'Furniture and fittings, cost', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'ppe', NULL, 'investing', false, NULL, true, false, 'IV', NULL, ARRAY['all']::text[]),
  ('1541', 'Furniture and fittings, accumulated depreciation', 'asset'::public.fin_account_type, 'credit', 'balance_sheet', 'ppe', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1590', 'Capital work in progress', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'ppe', NULL, 'investing', false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1600', 'Intangibles', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'intangibles', NULL, 'investing', false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1700', 'Intercompany receivables, trading', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'ic_receivable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1710', 'Investment in subsidiaries, cost method', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'investment_subsidiaries', NULL, 'investing', false, NULL, true, false, NULL, NULL, ARRAY['parent','elimination']::text[]),
  ('1720', 'Intercompany loans receivable', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'ic_loans_receivable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1900', 'Suspense / unidentified bank items', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'suspense', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2010', 'Trade payables, AP control', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'ap', NULL, NULL, true, 'ap', false, false, NULL, NULL, ARRAY['all']::text[]),
  ('2020', 'Accruals', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'accruals', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2030', 'Customer deposits / deferred revenue', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'deferred_rev', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2100', 'VAT output', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'tax_payable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2105', 'VAT control / payable', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'tax_payable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2110', 'PAYE payable', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'tax_payable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2111', 'NSSF payable', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'tax_payable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2112', 'SHIF payable', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'tax_payable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2113', 'Affordable Housing Levy payable', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'tax_payable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2114', 'NITA payable', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'tax_payable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2120', 'Net salaries payable', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'salaries_payable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2130', 'Withholding tax payable (suppliers)', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'tax_payable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2150', 'Sales commissions payable', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'commissions_payable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2200', 'Corporation tax payable', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'tax_payable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2300', 'Bank overdraft', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'overdraft', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2400', 'Directors'' / shareholders'' loans', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'director_loans', NULL, 'financing', false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2500', 'Bank / SACCO loans', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'loans', NULL, 'financing', false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2700', 'Intercompany payables, trading', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'ic_payable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2720', 'Intercompany loans payable', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'ic_loans_payable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('3000', 'Share capital', 'equity'::public.fin_account_type, 'credit', 'balance_sheet', 'share_capital', NULL, 'financing', false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('3100', 'Retained earnings brought forward', 'equity'::public.fin_account_type, 'credit', 'balance_sheet', 'retained_earnings', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('3150', 'Current-year profit (virtual)', 'equity'::public.fin_account_type, 'credit', 'balance_sheet', 'current_year_profit', NULL, NULL, false, NULL, false, false, NULL, NULL, ARRAY['all']::text[]),
  ('3200', 'Drawings', 'equity'::public.fin_account_type, 'debit', 'balance_sheet', 'drawings', NULL, 'financing', false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('3300', 'Dividends', 'equity'::public.fin_account_type, 'debit', 'balance_sheet', 'dividends', NULL, 'financing', false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('3310', 'Dividends received from subsidiaries', 'equity'::public.fin_account_type, 'credit', 'balance_sheet', 'dividends_received', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['parent']::text[]),
  ('3400', 'Other reserves', 'equity'::public.fin_account_type, 'credit', 'balance_sheet', 'other_reserves', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('3900', 'Opening-balance equity', 'equity'::public.fin_account_type, 'credit', 'balance_sheet', 'opening_equity', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('3901', 'Investment / consolidation elimination', 'equity'::public.fin_account_type, 'credit', 'balance_sheet', 'elim_reserve', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['elimination']::text[]),
  ('3902', 'Non-controlling interest', 'equity'::public.fin_account_type, 'credit', 'balance_sheet', 'nci', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['elimination']::text[]),
  ('4010', 'Sales, project supply and installation', 'income'::public.fin_account_type, 'credit', 'income_statement', 'turnover', NULL, 'operating', false, NULL, true, false, NULL, 'ENERGY'::public.fin_segment, ARRAY['all']::text[]),
  ('4020', 'Sales, project equipment', 'income'::public.fin_account_type, 'credit', 'income_statement', 'turnover', NULL, 'operating', false, NULL, true, false, NULL, 'ENERGY'::public.fin_segment, ARRAY['all']::text[]),
  ('4030', 'Maintenance, service and support', 'income'::public.fin_account_type, 'credit', 'income_statement', 'turnover', NULL, 'operating', false, NULL, true, false, NULL, 'ENERGY'::public.fin_segment, ARRAY['all']::text[]),
  ('4040', 'Consultancy and design', 'income'::public.fin_account_type, 'credit', 'income_statement', 'turnover', NULL, 'operating', false, NULL, true, false, NULL, 'ENERGY'::public.fin_segment, ARRAY['all']::text[]),
  ('4100', 'Sales, merchandise (online)', 'income'::public.fin_account_type, 'credit', 'income_statement', 'turnover', NULL, 'operating', false, NULL, true, false, NULL, 'AUTOPARTS'::public.fin_segment, ARRAY['all']::text[]),
  ('4110', 'Sales, merchandise (staff / referral)', 'income'::public.fin_account_type, 'credit', 'income_statement', 'turnover', NULL, 'operating', false, NULL, true, false, NULL, 'AUTOPARTS'::public.fin_segment, ARRAY['all']::text[]),
  ('4120', 'Sales, consumables', 'income'::public.fin_account_type, 'credit', 'income_statement', 'turnover', NULL, 'operating', false, NULL, true, false, NULL, 'AUTOPARTS'::public.fin_segment, ARRAY['all']::text[]),
  ('4130', 'Manufacturing / print services', 'income'::public.fin_account_type, 'credit', 'income_statement', 'turnover', NULL, 'operating', false, NULL, true, false, NULL, 'PRINT3D'::public.fin_segment, ARRAY['all']::text[]),
  ('4140', 'Delivery income', 'income'::public.fin_account_type, 'credit', 'income_statement', 'turnover', NULL, 'operating', false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('4190', 'Sales returns and discounts', 'income'::public.fin_account_type, 'debit', 'income_statement', 'turnover', NULL, 'operating', false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('4500', 'Intercompany income', 'income'::public.fin_account_type, 'credit', 'income_statement', 'ic_income', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('4900', 'Other income, FX gain, disposals', 'income'::public.fin_account_type, 'credit', 'income_statement', 'other_income', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('5010', 'Purchases / COGS, project equipment and materials', 'cogs'::public.fin_account_type, 'debit', 'income_statement', 'cogs', NULL, 'operating', false, NULL, true, true, NULL, 'ENERGY'::public.fin_segment, ARRAY['all']::text[]),
  ('5020', 'Subcontractor / installation labour', 'cogs'::public.fin_account_type, 'debit', 'income_statement', 'cogs', NULL, 'operating', false, NULL, true, true, NULL, 'ENERGY'::public.fin_segment, ARRAY['all']::text[]),
  ('5030', 'Freight, clearing and import duties', 'cogs'::public.fin_account_type, 'debit', 'income_statement', 'cogs', NULL, 'operating', false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('5040', 'Direct project costs', 'cogs'::public.fin_account_type, 'debit', 'income_statement', 'cogs', NULL, 'operating', false, NULL, true, true, NULL, 'ENERGY'::public.fin_segment, ARRAY['all']::text[]),
  ('5100', 'COGS, merchandise', 'cogs'::public.fin_account_type, 'debit', 'income_statement', 'cogs', NULL, 'operating', false, NULL, true, true, NULL, 'AUTOPARTS'::public.fin_segment, ARRAY['all']::text[]),
  ('5110', 'COGS, consumable resale', 'cogs'::public.fin_account_type, 'debit', 'income_statement', 'cogs', NULL, 'operating', false, NULL, true, true, NULL, 'AUTOPARTS'::public.fin_segment, ARRAY['all']::text[]),
  ('5200', 'COGS, manufactured goods', 'cogs'::public.fin_account_type, 'debit', 'income_statement', 'cogs', NULL, 'operating', false, NULL, true, true, NULL, 'PRINT3D'::public.fin_segment, ARRAY['all']::text[]),
  ('5210', 'Production overhead absorbed', 'cogs'::public.fin_account_type, 'debit', 'income_statement', 'cogs', NULL, 'operating', false, NULL, true, true, NULL, 'PRINT3D'::public.fin_segment, ARRAY['all']::text[]),
  ('5290', 'Production variances / scrap', 'cogs'::public.fin_account_type, 'debit', 'income_statement', 'cogs', NULL, 'operating', false, NULL, true, true, NULL, 'PRINT3D'::public.fin_segment, ARRAY['all']::text[]),
  ('5300', 'Inventory adjustments / shrinkage / NRV write-down', 'cogs'::public.fin_account_type, 'debit', 'income_statement', 'cogs', NULL, 'operating', false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('5500', 'Intercompany charges / purchases from group', 'cogs'::public.fin_account_type, 'debit', 'income_statement', 'ic_purchases', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6010', 'Salaries', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, 'operating', false, NULL, true, false, NULL, 'HQ'::public.fin_segment, ARRAY['all']::text[]),
  ('6020', 'Casual wages', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, 'operating', false, NULL, true, false, NULL, 'HQ'::public.fin_segment, ARRAY['all']::text[]),
  ('6030', 'NSSF, employer', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, 'operating', false, NULL, true, false, NULL, 'HQ'::public.fin_segment, ARRAY['all']::text[]),
  ('6040', 'Affordable Housing Levy, employer', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, 'operating', false, NULL, true, false, NULL, 'HQ'::public.fin_segment, ARRAY['all']::text[]),
  ('6050', 'NITA', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, 'operating', false, NULL, true, false, NULL, 'HQ'::public.fin_segment, ARRAY['all']::text[]),
  ('6060', 'Training', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, 'operating', false, NULL, true, false, NULL, 'HQ'::public.fin_segment, ARRAY['all']::text[]),
  ('6070', 'Protective gear', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, 'operating', false, NULL, true, false, NULL, 'HQ'::public.fin_segment, ARRAY['all']::text[]),
  ('6080', 'Medical', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, 'operating', false, NULL, true, false, NULL, 'HQ'::public.fin_segment, ARRAY['all']::text[]),
  ('6090', 'Sales commissions', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, 'operating', false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6110', 'Rent', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, 'operating', false, NULL, true, true, NULL, 'HQ'::public.fin_segment, ARRAY['all']::text[]),
  ('6120', 'Audit and accountancy', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, 'operating', false, NULL, true, true, NULL, 'HQ'::public.fin_segment, ARRAY['all']::text[]),
  ('6130', 'Water and electricity', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, 'operating', false, NULL, true, true, NULL, 'HQ'::public.fin_segment, ARRAY['all']::text[]),
  ('6140', 'Licences, permits and insurance', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, 'operating', false, NULL, true, true, NULL, 'HQ'::public.fin_segment, ARRAY['all']::text[]),
  ('6150', 'Security', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, 'operating', false, NULL, true, true, NULL, 'HQ'::public.fin_segment, ARRAY['all']::text[]),
  ('6160', 'Computer, software and subscriptions', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, 'operating', false, NULL, true, true, NULL, 'HQ'::public.fin_segment, ARRAY['all']::text[]),
  ('6170', 'Stationery and printing', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, 'operating', false, NULL, true, true, NULL, 'HQ'::public.fin_segment, ARRAY['all']::text[]),
  ('6180', 'Repairs and maintenance', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, 'operating', false, NULL, true, true, NULL, 'HQ'::public.fin_segment, ARRAY['all']::text[]),
  ('6190', 'Professional fees', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, 'operating', false, NULL, true, true, NULL, 'HQ'::public.fin_segment, ARRAY['all']::text[]),
  ('6200', 'Advertising and marketing', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, 'operating', false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6210', 'Meetings and entertainment', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, 'operating', false, NULL, true, true, NULL, 'HQ'::public.fin_segment, ARRAY['all']::text[]),
  ('6220', 'Telephone, internet and postage', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, 'operating', false, NULL, true, true, NULL, 'HQ'::public.fin_segment, ARRAY['all']::text[]),
  ('6230', 'Travel, transport and logistics', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, 'operating', false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6240', 'Motor vehicle running and fuel', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, 'operating', false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6250', 'Meals', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, 'operating', false, NULL, true, true, NULL, 'HQ'::public.fin_segment, ARRAY['all']::text[]),
  ('6260', 'Donations / CSR', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, 'operating', false, NULL, true, true, NULL, 'HQ'::public.fin_segment, ARRAY['all']::text[]),
  ('6290', 'Other operating costs', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, 'operating', false, NULL, true, true, NULL, 'HQ'::public.fin_segment, ARRAY['all']::text[]),
  ('6300', 'Bad debts', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, 'operating', false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6400', 'Depreciation and amortisation', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'depreciation', NULL, 'operating', false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('7010', 'Bank charges and excise', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'finance', NULL, 'operating', false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('7020', 'Mobile-money / instant-payment charges', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'finance', NULL, 'operating', false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('7030', 'Interest on loans', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'finance', NULL, 'operating', false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('7040', 'FX loss', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'finance', NULL, 'operating', false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('7050', 'Tax penalties and interest', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'finance', NULL, 'operating', false, NULL, true, false, 'non_deductible', NULL, ARRAY['all']::text[]),
  ('8010', 'Corporation tax expense, current', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'tax_expense', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('8020', 'Deferred tax', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'tax_expense', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[])
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  account_type = EXCLUDED.account_type,
  normal_balance = EXCLUDED.normal_balance,
  fs_statement = EXCLUDED.fs_statement,
  fs_line = EXCLUDED.fs_line,
  note_ref = EXCLUDED.note_ref,
  cash_flow_class = EXCLUDED.cash_flow_class,
  is_control = EXCLUDED.is_control,
  control_type = EXCLUDED.control_type,
  allow_manual_posting = EXCLUDED.allow_manual_posting,
  etims_required_for_deduction = EXCLUDED.etims_required_for_deduction,
  tax_class = EXCLUDED.tax_class,
  segment_default = EXCLUDED.segment_default,
  applies_to = EXCLUDED.applies_to;

-- Remove filler codes not in the brief CoA
DELETE FROM public.fin_coa_template
WHERE code NOT IN ('1010', '1011', '1020', '1030', '1031', '1040', '1100', '1110', '1150', '1160', '1170', '1180', '1190', '1195', '1310', '1320', '1330', '1340', '1350', '1390', '1510', '1511', '1520', '1521', '1530', '1531', '1540', '1541', '1590', '1600', '1700', '1710', '1720', '1900', '2010', '2020', '2030', '2100', '2105', '2110', '2111', '2112', '2113', '2114', '2120', '2130', '2150', '2200', '2300', '2400', '2500', '2700', '2720', '3000', '3100', '3150', '3200', '3300', '3310', '3400', '3900', '3901', '3902', '4010', '4020', '4030', '4040', '4100', '4110', '4120', '4130', '4140', '4190', '4500', '4900', '5010', '5020', '5030', '5040', '5100', '5110', '5200', '5210', '5290', '5300', '5500', '6010', '6020', '6030', '6040', '6050', '6060', '6070', '6080', '6090', '6110', '6120', '6130', '6140', '6150', '6160', '6170', '6180', '6190', '6200', '6210', '6220', '6230', '6240', '6250', '6260', '6290', '6300', '6400', '7010', '7020', '7030', '7040', '7050', '8010', '8020');



-- ---------------------------------------------------------------------------
-- Period / balance helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fin_assert_open_date(p_entity_id uuid, p_date date)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock date;
  v_period public.fin_periods%ROWTYPE;
BEGIN
  SELECT lock_date INTO v_lock FROM public.fin_entity_settings WHERE entity_id = p_entity_id;
  IF v_lock IS NOT NULL AND p_date <= v_lock THEN
    RAISE EXCEPTION 'Date % is on or before entity lock date %', p_date, v_lock;
  END IF;
  SELECT * INTO v_period
  FROM public.fin_periods p
  WHERE p.entity_id = p_entity_id AND p.start_date <= p_date AND p.end_date >= p_date
  LIMIT 1;
  IF FOUND AND v_period.status = 'closed' THEN
    RAISE EXCEPTION 'Period is closed for date %', p_date;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fin_assert_open_date(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_assert_open_date(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_ensure_periods(p_entity_id uuid, p_fy integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_month smallint;
  m integer;
  v_start date;
  v_end date;
BEGIN
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
$$;

REVOKE ALL ON FUNCTION public.fin_ensure_periods(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_ensure_periods(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_next_entry_no(p_entity_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(entry_no), 0) + 1 FROM public.fin_journal_entries WHERE entity_id = p_entity_id;
$$;

REVOKE ALL ON FUNCTION public.fin_next_entry_no(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_next_entry_no(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_resolve_period_id(p_entity_id uuid, p_date date)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.fin_periods
  WHERE entity_id = p_entity_id AND start_date <= p_date AND end_date >= p_date
  ORDER BY period_no
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.fin_resolve_period_id(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_resolve_period_id(uuid, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- Immutability (posted entries/lines)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fin_deny_posted_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status = 'posted' THEN
    RAISE EXCEPTION 'Posted journal entries cannot be deleted; use fin_reverse_entry';
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'posted' THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'reversed' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Posted journal entries are immutable; use fin_reverse_entry';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS fin_journal_entries_immutable ON public.fin_journal_entries;
CREATE TRIGGER fin_journal_entries_immutable
  BEFORE UPDATE OR DELETE ON public.fin_journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.fin_deny_posted_mutation();

CREATE OR REPLACE FUNCTION public.fin_deny_posted_line_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE v_status public.fin_entry_status;
BEGIN
  SELECT status INTO v_status FROM public.fin_journal_entries WHERE id = COALESCE(OLD.entry_id, NEW.entry_id);
  IF v_status = 'posted' THEN
    RAISE EXCEPTION 'Posted journal lines are immutable; reverse the entry first';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS fin_journal_lines_immutable ON public.fin_journal_lines;
CREATE TRIGGER fin_journal_lines_immutable
  BEFORE UPDATE OR DELETE ON public.fin_journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.fin_deny_posted_line_mutation();

-- ---------------------------------------------------------------------------
-- Deferred balance constraint trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fin_check_entry_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status public.fin_entry_status;
  v_debit numeric(14,2);
  v_credit numeric(14,2);
  v_cnt integer;
  v_entry_id uuid;
BEGIN
  v_entry_id := COALESCE(NEW.entry_id, OLD.entry_id);
  SELECT status INTO v_status FROM public.fin_journal_entries WHERE id = v_entry_id;
  IF v_status IS NULL THEN RETURN NULL; END IF;
  IF v_status IN ('posted') OR TG_OP <> 'DELETE' THEN
    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0), COUNT(*)
    INTO v_debit, v_credit, v_cnt
    FROM public.fin_journal_lines WHERE entry_id = v_entry_id;
    IF v_status = 'posted' THEN
      IF v_cnt < 2 THEN
        RAISE EXCEPTION 'Posted entry requires at least two lines';
      END IF;
      IF v_debit <> v_credit THEN
        RAISE EXCEPTION 'Entry is not balanced: debit % credit %', v_debit, v_credit;
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS fin_journal_lines_balance ON public.fin_journal_lines;
CREATE CONSTRAINT TRIGGER fin_journal_lines_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.fin_journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.fin_check_entry_balance();

-- ---------------------------------------------------------------------------
-- Internal posting
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._fin_post_entry_internal(
  p_entity_id uuid,
  p_date date,
  p_memo text,
  p_source jsonb,
  p_lines jsonb,
  p_status public.fin_entry_status,
  p_is_system boolean DEFAULT false,
  p_ic_link_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_src_id uuid;
  v_entry_id uuid;
  v_entry_no bigint;
  v_period_id uuid;
  v_line jsonb;
  v_line_no integer := 0;
  v_acct uuid;
  v_acct_entity uuid;
BEGIN
  PERFORM public.fin_assert_open_date(p_entity_id, p_date);

  IF p_source IS NOT NULL AND p_source ? 'source_table' AND p_source ? 'source_id' AND p_source ? 'source_type' THEN
    SELECT je.id INTO v_existing
    FROM public.fin_journal_entries je
    JOIN public.fin_source_documents sd ON sd.id = je.source_document_id
    WHERE sd.source_table = p_source->>'source_table'
      AND sd.source_id = (p_source->>'source_id')::uuid
      AND sd.source_type = (p_source->>'source_type')::public.fin_source_type
      AND je.status = 'posted'
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;

    INSERT INTO public.fin_source_documents (
      entity_id, source_type, source_table, source_id, doc_number, doc_date,
      counterparty, amount, currency, etims_invoice_no, kra_pin, attachment_path
    )
    VALUES (
      p_entity_id,
      (p_source->>'source_type')::public.fin_source_type,
      p_source->>'source_table',
      (p_source->>'source_id')::uuid,
      p_source->>'doc_number',
      (p_source->>'doc_date')::date,
      p_source->>'counterparty',
      NULLIF(p_source->>'amount','')::numeric(14,2),
      COALESCE(p_source->>'currency','KES'),
      p_source->>'etims_invoice_no',
      p_source->>'kra_pin',
      p_source->>'attachment_path'
    )
    ON CONFLICT (source_table, source_id, source_type)
    DO UPDATE SET doc_date = COALESCE(EXCLUDED.doc_date, fin_source_documents.doc_date)
    RETURNING id INTO v_src_id;
  END IF;

  v_entry_no := public.fin_next_entry_no(p_entity_id);
  v_period_id := public.fin_resolve_period_id(p_entity_id, p_date);

  INSERT INTO public.fin_journal_entries (
    entity_id, entry_no, entry_date, period_id, memo, status,
    source_document_id, is_system, ic_link_id, posted_by, posted_at
  )
  VALUES (
    p_entity_id, v_entry_no, p_date, v_period_id, p_memo, p_status,
    v_src_id, p_is_system, p_ic_link_id,
    CASE WHEN p_status = 'posted' THEN auth.uid() ELSE NULL END,
    CASE WHEN p_status = 'posted' THEN now() ELSE NULL END
  )
  RETURNING id INTO v_entry_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_no := v_line_no + 1;
    SELECT a.id, a.entity_id INTO v_acct, v_acct_entity
    FROM public.fin_accounts a
    WHERE a.id = (v_line->>'account_id')::uuid
       OR (v_line ? 'account_code' AND a.entity_id = p_entity_id AND a.code = v_line->>'account_code');
    IF v_acct IS NULL THEN
      RAISE EXCEPTION 'Account not found for line %', v_line_no;
    END IF;
    IF v_acct_entity <> p_entity_id THEN
      RAISE EXCEPTION 'Account entity mismatch on line %', v_line_no;
    END IF;
    INSERT INTO public.fin_journal_lines (
      entry_id, entity_id, line_no, account_id, debit, credit, segment,
      customer_id, vendor_id, employee_id, asset_id, product_id,
      tax_code, etims_backed, currency, fx_rate, amount_fcy, description,
      is_intercompany, counter_entity_id
    )
    VALUES (
      v_entry_id, p_entity_id, v_line_no, v_acct,
      COALESCE((v_line->>'debit')::numeric(14,2), 0),
      COALESCE((v_line->>'credit')::numeric(14,2), 0),
      NULLIF(v_line->>'segment','')::public.fin_segment,
      NULLIF(v_line->>'customer_id','')::uuid,
      NULLIF(v_line->>'vendor_id','')::uuid,
      NULLIF(v_line->>'employee_id','')::uuid,
      NULLIF(v_line->>'asset_id','')::uuid,
      NULLIF(v_line->>'product_id','')::uuid,
      v_line->>'tax_code',
      COALESCE((v_line->>'etims_backed')::boolean, false),
      COALESCE(v_line->>'currency','KES'),
      COALESCE((v_line->>'fx_rate')::numeric(18,8), 1),
      NULLIF(v_line->>'amount_fcy','')::numeric(14,2),
      v_line->>'description',
      COALESCE((v_line->>'is_intercompany')::boolean, false),
      NULLIF(v_line->>'counter_entity_id','')::uuid
    );
  END LOOP;

  RETURN v_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public._fin_post_entry_internal(uuid, date, text, jsonb, jsonb, public.fin_entry_status, boolean, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_post_entry(
  p_entity_id uuid,
  p_date date,
  p_memo text,
  p_source jsonb,
  p_lines jsonb,
  p_status public.fin_entry_status DEFAULT 'posted'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public._fin_post_entry_internal(p_entity_id, p_date, p_memo, p_source, p_lines, p_status, false, NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.fin_post_entry(uuid, date, text, jsonb, jsonb, public.fin_entry_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_post_entry(uuid, date, text, jsonb, jsonb, public.fin_entry_status) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_post_intercompany(
  p_link_id uuid,
  p_date date,
  p_memo text,
  p_a jsonb,
  p_b jsonb
)
RETURNS TABLE(entry_a uuid, entry_b uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a uuid;
  v_b uuid;
BEGIN
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
$$;

REVOKE ALL ON FUNCTION public.fin_post_intercompany(uuid, date, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_post_intercompany(uuid, date, text, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_post_elimination(
  p_group_id uuid,
  p_date date,
  p_memo text,
  p_lines jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_elim uuid;
BEGIN
  SELECT e.id INTO v_elim FROM public.fin_entities e WHERE e.code = 'ELIM';
  IF v_elim IS NULL THEN RAISE EXCEPTION 'ELIM entity missing'; END IF;
  RETURN public._fin_post_entry_internal(
    v_elim, p_date, p_memo, NULL, p_lines, 'posted', true, NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fin_post_elimination(uuid, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_post_elimination(uuid, date, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_reverse_entry(p_entry_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src public.fin_journal_entries%ROWTYPE;
  v_new_id uuid;
  v_lines jsonb;
BEGIN
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
$$;

REVOKE ALL ON FUNCTION public.fin_reverse_entry(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_reverse_entry(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_repost_source(
  p_source_table text,
  p_source_id uuid,
  p_source_type public.fin_source_type
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old uuid;
BEGIN
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
$$;

REVOKE ALL ON FUNCTION public.fin_repost_source(text, uuid, public.fin_source_type) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_repost_source(text, uuid, public.fin_source_type) TO authenticated;

-- Realtime publication (idempotent)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.fin_journal_entries;
EXCEPTION WHEN duplicate_object THEN NULL;
         WHEN undefined_object THEN NULL;
END $$;
