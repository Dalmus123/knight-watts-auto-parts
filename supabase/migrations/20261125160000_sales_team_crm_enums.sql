-- Knight Watts Auto Parts — Sales Team CRM (enums only)
-- Must commit before schema migration uses the new enum labels.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'chief_of_sales'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'chief_of_sales';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'sales_rep'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'sales_rep';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'commission_status') THEN
    CREATE TYPE commission_status AS ENUM ('pending', 'approved', 'paid');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'commission_rule_scope') THEN
    CREATE TYPE commission_rule_scope AS ENUM ('default', 'category', 'product');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attribution_source') THEN
    CREATE TYPE attribution_source AS ENUM ('referral_link', 'referral_code', 'manual');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sales_task_status') THEN
    CREATE TYPE sales_task_status AS ENUM ('todo', 'in_progress', 'done', 'cancelled');
  END IF;
END $$;
