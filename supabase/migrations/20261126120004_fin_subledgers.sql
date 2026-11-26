-- Finance — banking, AR, AP, recurring templates (payments record-only)

CREATE TABLE IF NOT EXISTS public.fin_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  kind public.fin_bank_kind NOT NULL DEFAULT 'bank',
  label text NOT NULL,
  currency text NOT NULL DEFAULT 'KES',
  gl_account_id uuid REFERENCES public.fin_accounts(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fin_bank_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES public.fin_bank_accounts(id) ON DELETE CASCADE,
  statement_ref text NOT NULL,
  period_start date,
  period_end date,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, bank_account_id, statement_ref)
);

CREATE TABLE IF NOT EXISTS public.fin_bank_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES public.fin_bank_accounts(id) ON DELETE CASCADE,
  statement_id uuid REFERENCES public.fin_bank_statements(id) ON DELETE SET NULL,
  line_date date NOT NULL,
  description text,
  money_in numeric(14,2) NOT NULL DEFAULT 0 CHECK (money_in >= 0),
  money_out numeric(14,2) NOT NULL DEFAULT 0 CHECK (money_out >= 0),
  running_balance numeric(14,2),
  status public.fin_recon_status NOT NULL DEFAULT 'unmatched',
  line_hash text NOT NULL,
  matched_entry_id uuid REFERENCES public.fin_journal_entries(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, line_hash)
);

CREATE INDEX IF NOT EXISTS idx_fin_bank_lines_acct ON public.fin_bank_lines (bank_account_id, line_date);

CREATE TABLE IF NOT EXISTS public.fin_bank_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  name text NOT NULL,
  pattern text NOT NULL,
  account_id uuid REFERENCES public.fin_accounts(id),
  segment public.fin_segment,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.fin_bank_import_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  name text NOT NULL,
  column_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Expected CSV columns documented in column_map: {date, description, debit, credit, balance}
  date_format text DEFAULT 'YYYY-MM-DD',
  UNIQUE (entity_id, name)
);

CREATE TABLE IF NOT EXISTS public.fin_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES public.fin_bank_accounts(id) ON DELETE CASCADE,
  period_end date NOT NULL,
  statement_balance numeric(14,2),
  gl_balance numeric(14,2),
  status text NOT NULL DEFAULT 'in_progress',
  completed_at timestamptz,
  UNIQUE (entity_id, bank_account_id, period_end)
);

-- AR
CREATE TABLE IF NOT EXISTS public.fin_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  code text NOT NULL,
  display_name text NOT NULL DEFAULT 'Customer (generic)',
  sales_customer_id uuid REFERENCES public.sales_customers(id) ON DELETE SET NULL,
  wht_agent boolean NOT NULL DEFAULT false,
  wht_rate numeric(8,4) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (entity_id, code)
);

CREATE TABLE IF NOT EXISTS public.fin_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.fin_customers(id),
  invoice_no text NOT NULL,
  invoice_date date NOT NULL,
  due_date date,
  status public.fin_doc_status NOT NULL DEFAULT 'draft',
  currency text NOT NULL DEFAULT 'KES',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax_total numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  journal_entry_id uuid REFERENCES public.fin_journal_entries(id),
  UNIQUE (entity_id, invoice_no)
);

CREATE TABLE IF NOT EXISTS public.fin_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.fin_invoices(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  description text,
  quantity numeric(14,4) NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  tax_code text REFERENCES public.fin_tax_codes(code),
  amount numeric(14,2) NOT NULL DEFAULT 0,
  UNIQUE (invoice_id, line_no)
);

CREATE TABLE IF NOT EXISTS public.fin_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.fin_customers(id),
  receipt_no text NOT NULL,
  receipt_date date NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  wht_deducted numeric(14,2) NOT NULL DEFAULT 0,
  wht_certificate_ref text,
  status public.fin_doc_status NOT NULL DEFAULT 'draft',
  journal_entry_id uuid REFERENCES public.fin_journal_entries(id),
  UNIQUE (entity_id, receipt_no)
);

CREATE TABLE IF NOT EXISTS public.fin_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  receipt_id uuid NOT NULL REFERENCES public.fin_receipts(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.fin_invoices(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0)
);

CREATE TABLE IF NOT EXISTS public.fin_credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.fin_customers(id),
  credit_no text NOT NULL,
  credit_date date NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  status public.fin_doc_status NOT NULL DEFAULT 'draft',
  journal_entry_id uuid REFERENCES public.fin_journal_entries(id),
  UNIQUE (entity_id, credit_no)
);

-- AP
CREATE TABLE IF NOT EXISTS public.fin_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  code text NOT NULL,
  display_name text NOT NULL DEFAULT 'Vendor (generic)',
  wht_agent boolean NOT NULL DEFAULT false,
  wht_rate numeric(8,4) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (entity_id, code)
);

CREATE TABLE IF NOT EXISTS public.fin_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.fin_vendors(id),
  bill_no text NOT NULL,
  bill_date date NOT NULL,
  due_date date,
  status public.fin_doc_status NOT NULL DEFAULT 'draft',
  currency text NOT NULL DEFAULT 'KES',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax_total numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  journal_entry_id uuid REFERENCES public.fin_journal_entries(id),
  UNIQUE (entity_id, bill_no)
);

CREATE TABLE IF NOT EXISTS public.fin_bill_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  bill_id uuid NOT NULL REFERENCES public.fin_bills(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  description text,
  quantity numeric(14,4) NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  tax_code text REFERENCES public.fin_tax_codes(code),
  amount numeric(14,2) NOT NULL DEFAULT 0,
  UNIQUE (bill_id, line_no)
);

-- Payments: draft | approved | paid — export only; no bank transmission
CREATE TABLE IF NOT EXISTS public.fin_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.fin_vendors(id),
  payment_no text NOT NULL,
  payment_date date NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  status public.fin_payment_status NOT NULL DEFAULT 'draft',
  approved_at timestamptz,
  paid_at timestamptz,
  export_batch_ref text,
  journal_entry_id uuid REFERENCES public.fin_journal_entries(id),
  UNIQUE (entity_id, payment_no)
);

CREATE TABLE IF NOT EXISTS public.fin_recurring_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  name text NOT NULL,
  cadence text NOT NULL DEFAULT 'monthly',
  next_run_on date,
  lines_template jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true
);

CREATE OR REPLACE FUNCTION public.fin_run_recurring(p_as_of date DEFAULT CURRENT_DATE)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.fin_recurring_templates%ROWTYPE;
  v_count integer := 0;
BEGIN
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
$$;

REVOKE ALL ON FUNCTION public.fin_run_recurring(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_run_recurring(date) TO authenticated;

-- Generic bank account shells per entity (labels only)
INSERT INTO public.fin_bank_accounts (entity_id, kind, label)
SELECT e.id, 'bank', CASE e.code WHEN 'PARENT' THEN 'parent bank account' WHEN 'SHOP' THEN 'shop bank account' ELSE 'elimination bank clearing' END
FROM public.fin_entities e
WHERE e.code IN ('PARENT','SHOP','ELIM')
  AND NOT EXISTS (
    SELECT 1 FROM public.fin_bank_accounts b WHERE b.entity_id = e.id AND b.kind = 'bank'
  );

INSERT INTO public.fin_bank_accounts (entity_id, kind, label)
SELECT e.id, 'mpesa', 'shop mobile-money float'
FROM public.fin_entities e WHERE e.code = 'SHOP'
  AND NOT EXISTS (
    SELECT 1 FROM public.fin_bank_accounts b WHERE b.entity_id = e.id AND b.kind = 'mpesa'
  );

INSERT INTO public.fin_bank_accounts (entity_id, kind, label)
SELECT e.id, 'petty_cash', CASE e.code WHEN 'PARENT' THEN 'parent petty cash' ELSE 'shop petty cash' END
FROM public.fin_entities e WHERE e.code IN ('PARENT','SHOP')
  AND NOT EXISTS (
    SELECT 1 FROM public.fin_bank_accounts b WHERE b.entity_id = e.id AND b.kind = 'petty_cash'
  );