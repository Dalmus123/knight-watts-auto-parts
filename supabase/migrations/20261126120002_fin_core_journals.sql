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
  ('1010', 'Operating bank account', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'bank_cash', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1011', 'Secondary bank account', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'bank_cash', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1020', 'Petty cash', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'bank_cash', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1030', 'Mobile money float', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'bank_cash', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1031', 'Mobile money clearing', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'bank_cash', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1040', 'Short-term deposits', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'bank_cash', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1100', 'Accounts receivable control', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'ar', NULL, NULL, true, 'ar', false, false, NULL, NULL, ARRAY['all']::text[]),
  ('1110', 'Trade debtors', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'ar', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1150', 'Intercompany receivable', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'ic_receivable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1160', 'Staff advances', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'other_ca', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1170', 'VAT recoverable', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'other_ca', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1180', 'WHT recoverable', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'other_ca', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1190', 'Other receivables', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'other_ca', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1195', 'Receivable suspense', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'other_ca', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1310', 'Raw materials', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'inventory', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1320', 'Work in progress', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'inventory', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1330', 'Finished goods', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'inventory', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1340', 'Consumables', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'inventory', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1350', 'Spare parts inventory', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'inventory', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1390', 'Inventory clearing', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'inventory', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1510', 'Property plant and equipment cost', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'ppe', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1511', 'Accumulated depreciation PPE', 'asset'::public.fin_account_type, 'credit', 'balance_sheet', 'ppe', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1520', 'Motor vehicles cost', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'ppe', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1521', 'Accumulated depreciation vehicles', 'asset'::public.fin_account_type, 'credit', 'balance_sheet', 'ppe', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1530', 'Computer equipment cost', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'ppe', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1531', 'Accumulated depreciation computers', 'asset'::public.fin_account_type, 'credit', 'balance_sheet', 'ppe', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1540', 'Furniture and fittings cost', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'ppe', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1541', 'Accumulated depreciation furniture', 'asset'::public.fin_account_type, 'credit', 'balance_sheet', 'ppe', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1590', 'Capital work in progress', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'ppe', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1600', 'Intangible assets', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'other_ca', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1710', 'Investment in subsidiaries', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'investment_subsidiaries', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['parent','elimination']::text[]),
  ('1720', 'Investment in associates', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'investment_subsidiaries', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['parent']::text[]),
  ('1700', 'Long-term investments other', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'investment_subsidiaries', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('1900', 'Suspense asset', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'other_ca', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2010', 'Accounts payable control', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'ap', NULL, NULL, true, 'ap', false, false, NULL, NULL, ARRAY['all']::text[]),
  ('2020', 'Trade creditors', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'ap', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2030', 'Accrued expenses', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'accruals', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2100', 'VAT payable', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'tax_payable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2105', 'WHT payable', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'tax_payable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2110', 'PAYE payable', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'tax_payable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2111', 'NSSF payable', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'tax_payable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2112', 'SHIF payable', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'tax_payable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2113', 'Housing levy payable', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'tax_payable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2114', 'NITA levy payable', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'tax_payable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2120', 'Corporate tax payable', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'tax_payable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2130', 'Deferred revenue', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'deferred_rev', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2150', 'Intercompany payable', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'ic_payable', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2200', 'Short-term loans', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'loans', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2300', 'Long-term loans', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'loans', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2400', 'Lease liabilities', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'loans', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2500', 'Customer deposits', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'accruals', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2700', 'Provisions', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'accruals', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('2720', 'Pension obligation', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'accruals', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('3000', 'Share capital', 'equity'::public.fin_account_type, 'credit', 'balance_sheet', 'share_capital', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('3100', 'Share premium', 'equity'::public.fin_account_type, 'credit', 'balance_sheet', 'other_reserves', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('3150', 'Treasury shares', 'equity'::public.fin_account_type, 'credit', 'balance_sheet', 'other_reserves', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('3200', 'Retained earnings', 'equity'::public.fin_account_type, 'credit', 'balance_sheet', 'retained_earnings', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('3300', 'Current year earnings', 'equity'::public.fin_account_type, 'credit', 'balance_sheet', 'retained_earnings', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('3310', 'Drawings', 'equity'::public.fin_account_type, 'credit', 'balance_sheet', 'drawings', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('3400', 'Other reserves', 'equity'::public.fin_account_type, 'credit', 'balance_sheet', 'other_reserves', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('3900', 'Suspense equity', 'equity'::public.fin_account_type, 'credit', 'balance_sheet', 'elim_reserve', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('3901', 'Opening balance equity', 'equity'::public.fin_account_type, 'credit', 'balance_sheet', 'other_reserves', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('3902', 'Elimination reserve', 'equity'::public.fin_account_type, 'credit', 'balance_sheet', 'elim_reserve', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('4010', 'Turnover autoparts', 'income'::public.fin_account_type, 'credit', 'income_statement', 'turnover_autoparts', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('4020', 'Turnover energy', 'income'::public.fin_account_type, 'credit', 'income_statement', 'turnover_energy', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('4030', 'Turnover 3D printing', 'income'::public.fin_account_type, 'credit', 'income_statement', 'turnover_3d', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('4040', 'Turnover other', 'income'::public.fin_account_type, 'credit', 'income_statement', 'turnover_other', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('4100', 'Sales returns and allowances', 'income'::public.fin_account_type, 'credit', 'income_statement', 'turnover_autoparts', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('4110', 'Sales discounts', 'income'::public.fin_account_type, 'credit', 'income_statement', 'turnover_autoparts', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('4120', 'Other operating income', 'income'::public.fin_account_type, 'credit', 'income_statement', 'other_income', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('4130', 'Gain on disposal', 'income'::public.fin_account_type, 'credit', 'income_statement', 'other_income', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('4140', 'Rental income', 'income'::public.fin_account_type, 'credit', 'income_statement', 'other_income', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('4190', 'Miscellaneous income', 'income'::public.fin_account_type, 'credit', 'income_statement', 'other_income', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('4500', 'Intercompany income', 'income'::public.fin_account_type, 'credit', 'income_statement', 'ic_income', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('4900', 'Finance income', 'income'::public.fin_account_type, 'credit', 'income_statement', 'other_income', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('5010', 'Cost of goods sold autoparts', 'cogs'::public.fin_account_type, 'debit', 'income_statement', 'cogs_autoparts', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('5020', 'COGS energy', 'cogs'::public.fin_account_type, 'debit', 'income_statement', 'cogs_energy', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('5030', 'COGS 3D printing', 'cogs'::public.fin_account_type, 'debit', 'income_statement', 'cogs_3d', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('5040', 'COGS other', 'cogs'::public.fin_account_type, 'debit', 'income_statement', 'cogs_other', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('5100', 'Freight in', 'cogs'::public.fin_account_type, 'debit', 'income_statement', 'cogs_other', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('5110', 'Inventory adjustments', 'cogs'::public.fin_account_type, 'debit', 'income_statement', 'cogs_other', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('5200', 'Purchase returns', 'cogs'::public.fin_account_type, 'debit', 'income_statement', 'cogs_other', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('5210', 'Purchase discounts', 'cogs'::public.fin_account_type, 'debit', 'income_statement', 'cogs_other', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('5290', 'Inventory write-down', 'cogs'::public.fin_account_type, 'debit', 'income_statement', 'cogs_other', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('5300', 'Intercompany purchases', 'cogs'::public.fin_account_type, 'debit', 'income_statement', 'ic_purchases', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('5500', 'Manufacturing variance', 'cogs'::public.fin_account_type, 'debit', 'income_statement', 'cogs_other', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6010', 'Staff cost 6010', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6011', 'Staff cost 6011', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6012', 'Staff cost 6012', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6013', 'Staff cost 6013', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6014', 'Staff cost 6014', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6015', 'Staff cost 6015', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6016', 'Staff cost 6016', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6017', 'Staff cost 6017', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6018', 'Staff cost 6018', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6019', 'Staff cost 6019', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6020', 'Staff cost 6020', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6021', 'Staff cost 6021', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6022', 'Staff cost 6022', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6023', 'Staff cost 6023', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6024', 'Staff cost 6024', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6025', 'Staff cost 6025', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6026', 'Staff cost 6026', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6027', 'Staff cost 6027', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6028', 'Staff cost 6028', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6029', 'Staff cost 6029', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6030', 'Staff cost 6030', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6031', 'Staff cost 6031', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6032', 'Staff cost 6032', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6033', 'Staff cost 6033', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6034', 'Staff cost 6034', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6035', 'Staff cost 6035', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6036', 'Staff cost 6036', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6037', 'Staff cost 6037', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6038', 'Staff cost 6038', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6039', 'Staff cost 6039', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6040', 'Staff cost 6040', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6041', 'Staff cost 6041', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6042', 'Staff cost 6042', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6043', 'Staff cost 6043', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6044', 'Staff cost 6044', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6045', 'Staff cost 6045', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6046', 'Staff cost 6046', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6047', 'Staff cost 6047', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6048', 'Staff cost 6048', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6049', 'Staff cost 6049', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6050', 'Staff cost 6050', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6051', 'Staff cost 6051', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6052', 'Staff cost 6052', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6053', 'Staff cost 6053', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6054', 'Staff cost 6054', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6055', 'Staff cost 6055', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6056', 'Staff cost 6056', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6057', 'Staff cost 6057', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6058', 'Staff cost 6058', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6059', 'Staff cost 6059', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6060', 'Staff cost 6060', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6061', 'Staff cost 6061', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6062', 'Staff cost 6062', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6063', 'Staff cost 6063', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6064', 'Staff cost 6064', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6065', 'Staff cost 6065', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6066', 'Staff cost 6066', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6067', 'Staff cost 6067', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6068', 'Staff cost 6068', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6069', 'Staff cost 6069', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6070', 'Staff cost 6070', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6071', 'Staff cost 6071', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6072', 'Staff cost 6072', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6073', 'Staff cost 6073', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6074', 'Staff cost 6074', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6075', 'Staff cost 6075', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6076', 'Staff cost 6076', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6077', 'Staff cost 6077', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6078', 'Staff cost 6078', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6079', 'Staff cost 6079', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6080', 'Staff cost 6080', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6081', 'Staff cost 6081', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6082', 'Staff cost 6082', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6083', 'Staff cost 6083', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6084', 'Staff cost 6084', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6085', 'Staff cost 6085', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6086', 'Staff cost 6086', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6087', 'Staff cost 6087', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6088', 'Staff cost 6088', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6089', 'Staff cost 6089', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6090', 'Staff cost 6090', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6091', 'Staff cost 6091', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6092', 'Staff cost 6092', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6093', 'Staff cost 6093', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6094', 'Staff cost 6094', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6095', 'Staff cost 6095', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6096', 'Staff cost 6096', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6097', 'Staff cost 6097', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6098', 'Staff cost 6098', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6099', 'Staff cost 6099', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'staff', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6110', 'Operating expense 6110', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6111', 'Operating expense 6111', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6112', 'Operating expense 6112', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6113', 'Operating expense 6113', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6114', 'Operating expense 6114', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6115', 'Operating expense 6115', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6116', 'Operating expense 6116', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6117', 'Operating expense 6117', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6118', 'Operating expense 6118', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6119', 'Operating expense 6119', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6120', 'Operating expense 6120', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6121', 'Operating expense 6121', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6122', 'Operating expense 6122', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6123', 'Operating expense 6123', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6124', 'Operating expense 6124', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6125', 'Operating expense 6125', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6126', 'Operating expense 6126', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6127', 'Operating expense 6127', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6128', 'Operating expense 6128', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6129', 'Operating expense 6129', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6130', 'Operating expense 6130', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6131', 'Operating expense 6131', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6132', 'Operating expense 6132', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6133', 'Operating expense 6133', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6134', 'Operating expense 6134', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6135', 'Operating expense 6135', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6136', 'Operating expense 6136', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6137', 'Operating expense 6137', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6138', 'Operating expense 6138', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6139', 'Operating expense 6139', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6140', 'Operating expense 6140', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6141', 'Operating expense 6141', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6142', 'Operating expense 6142', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6143', 'Operating expense 6143', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6144', 'Operating expense 6144', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6145', 'Operating expense 6145', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6146', 'Operating expense 6146', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6147', 'Operating expense 6147', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6148', 'Operating expense 6148', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6149', 'Operating expense 6149', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6150', 'Operating expense 6150', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6151', 'Operating expense 6151', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6152', 'Operating expense 6152', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6153', 'Operating expense 6153', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6154', 'Operating expense 6154', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6155', 'Operating expense 6155', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6156', 'Operating expense 6156', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6157', 'Operating expense 6157', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6158', 'Operating expense 6158', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6159', 'Operating expense 6159', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6160', 'Operating expense 6160', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6161', 'Operating expense 6161', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6162', 'Operating expense 6162', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6163', 'Operating expense 6163', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6164', 'Operating expense 6164', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6165', 'Operating expense 6165', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6166', 'Operating expense 6166', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6167', 'Operating expense 6167', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6168', 'Operating expense 6168', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6169', 'Operating expense 6169', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6170', 'Operating expense 6170', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6171', 'Operating expense 6171', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6172', 'Operating expense 6172', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6173', 'Operating expense 6173', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6174', 'Operating expense 6174', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6175', 'Operating expense 6175', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6176', 'Operating expense 6176', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6177', 'Operating expense 6177', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6178', 'Operating expense 6178', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6179', 'Operating expense 6179', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6180', 'Operating expense 6180', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6181', 'Operating expense 6181', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6182', 'Operating expense 6182', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6183', 'Operating expense 6183', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6184', 'Operating expense 6184', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6185', 'Operating expense 6185', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6186', 'Operating expense 6186', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6187', 'Operating expense 6187', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6188', 'Operating expense 6188', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6189', 'Operating expense 6189', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6190', 'Operating expense 6190', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6191', 'Operating expense 6191', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6192', 'Operating expense 6192', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6193', 'Operating expense 6193', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6194', 'Operating expense 6194', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6195', 'Operating expense 6195', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6196', 'Operating expense 6196', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6197', 'Operating expense 6197', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6198', 'Operating expense 6198', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6199', 'Operating expense 6199', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6200', 'Operating expense 6200', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6201', 'Operating expense 6201', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6202', 'Operating expense 6202', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6203', 'Operating expense 6203', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6204', 'Operating expense 6204', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6205', 'Operating expense 6205', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6206', 'Operating expense 6206', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6207', 'Operating expense 6207', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6208', 'Operating expense 6208', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6209', 'Operating expense 6209', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6210', 'Operating expense 6210', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6211', 'Operating expense 6211', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6212', 'Operating expense 6212', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6213', 'Operating expense 6213', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6214', 'Operating expense 6214', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6215', 'Operating expense 6215', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6216', 'Operating expense 6216', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6217', 'Operating expense 6217', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6218', 'Operating expense 6218', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6219', 'Operating expense 6219', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6220', 'Operating expense 6220', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6221', 'Operating expense 6221', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6222', 'Operating expense 6222', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6223', 'Operating expense 6223', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6224', 'Operating expense 6224', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6225', 'Operating expense 6225', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6226', 'Operating expense 6226', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6227', 'Operating expense 6227', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6228', 'Operating expense 6228', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6229', 'Operating expense 6229', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6230', 'Operating expense 6230', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6231', 'Operating expense 6231', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6232', 'Operating expense 6232', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6233', 'Operating expense 6233', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6234', 'Operating expense 6234', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6235', 'Operating expense 6235', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6236', 'Operating expense 6236', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6237', 'Operating expense 6237', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6238', 'Operating expense 6238', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6239', 'Operating expense 6239', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6240', 'Operating expense 6240', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6241', 'Operating expense 6241', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6242', 'Operating expense 6242', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6243', 'Operating expense 6243', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6244', 'Operating expense 6244', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6245', 'Operating expense 6245', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6246', 'Operating expense 6246', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6247', 'Operating expense 6247', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6248', 'Operating expense 6248', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6249', 'Operating expense 6249', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6250', 'Operating expense 6250', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6251', 'Operating expense 6251', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6252', 'Operating expense 6252', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6253', 'Operating expense 6253', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6254', 'Operating expense 6254', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6255', 'Operating expense 6255', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6256', 'Operating expense 6256', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6257', 'Operating expense 6257', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6258', 'Operating expense 6258', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6259', 'Operating expense 6259', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6260', 'Operating expense 6260', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6290', 'Professional fees', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, true, NULL, NULL, ARRAY['all']::text[]),
  ('6300', 'Depreciation expense', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('6400', 'Tax expense', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'tax_expense', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('7010', 'Foreign exchange loss', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'finance', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('7020', 'Foreign exchange gain', 'income'::public.fin_account_type, 'credit', 'income_statement', 'finance', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('7030', 'Bank charges', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'finance', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('7040', 'Interest expense', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'finance', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('7050', 'Loss on disposal', 'expense'::public.fin_account_type, 'debit', 'income_statement', 'opex', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('8010', 'Clearing account debits', 'asset'::public.fin_account_type, 'debit', 'balance_sheet', 'other_ca', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[]),
  ('8020', 'Clearing account credits', 'liability'::public.fin_account_type, 'credit', 'balance_sheet', 'accruals', NULL, NULL, false, NULL, true, false, NULL, NULL, ARRAY['all']::text[])
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  account_type = EXCLUDED.account_type,
  normal_balance = EXCLUDED.normal_balance,
  fs_statement = EXCLUDED.fs_statement,
  fs_line = EXCLUDED.fs_line,
  is_control = EXCLUDED.is_control,
  control_type = EXCLUDED.control_type,
  allow_manual_posting = EXCLUDED.allow_manual_posting,
  etims_required_for_deduction = EXCLUDED.etims_required_for_deduction,
  applies_to = EXCLUDED.applies_to;



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
