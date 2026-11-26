-- Finance module — enums (idempotent)
-- Knight Watts Auto Parts / multi-entity double-entry core

DO $$ BEGIN
  CREATE TYPE public.fin_account_type AS ENUM (
    'asset', 'liability', 'equity', 'income', 'cogs', 'expense'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.fin_entry_status AS ENUM ('draft', 'posted', 'reversed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.fin_source_type AS ENUM (
    'manual', 'opening', 'bank_line', 'petty_cash', 'invoice', 'receipt',
    'bill', 'payment', 'credit_note', 'order', 'stock_movement', 'print_job',
    'commission', 'depreciation', 'payroll', 'recurring', 'tax', 'fx',
    'year_end', 'intercompany', 'elimination'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.fin_doc_status AS ENUM ('draft', 'approved', 'posted', 'void');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.fin_recon_status AS ENUM (
    'unmatched', 'suggested', 'matched', 'excluded'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.fin_segment AS ENUM (
    'ENERGY', 'AUTOPARTS', 'PRINT3D', 'HQ'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.fin_period_status AS ENUM ('open', 'soft_closed', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.fin_entity_type AS ENUM (
    'parent', 'subsidiary', 'associate', 'elimination', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.fin_bank_kind AS ENUM ('bank', 'mpesa', 'petty_cash');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.fin_payment_status AS ENUM ('draft', 'approved', 'paid');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.fin_asset_status AS ENUM (
    'active', 'disposed', 'fully_depreciated', 'idle'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.fin_consol_method AS ENUM ('cost', 'equity');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.fin_insight_severity AS ENUM (
    'info', 'warning', 'critical'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
