-- Knight Watts Auto Parts — C-suite role enums
-- Must commit before schema migration uses the new enum labels.
-- Roles: ceo, cfo, coo, cos (chief of staff)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'ceo'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'ceo';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'cfo'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'cfo';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'coo'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'coo';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'cos'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'cos';
  END IF;
END $$;
