-- Knight Watts Auto Parts — website contact form inbox
-- Apply on merge only (not before). Creates public.contact_messages.
--
-- Access model
--   * anon / authenticated  : INSERT only (column-restricted, length-checked). No SELECT/UPDATE/DELETE.
--   * staff (existing role helpers) : SELECT + UPDATE (status / handled_* only). No DELETE.
--   * service_role (Edge Function contact-notify) : full access, bypasses RLS.
-- Does NOT touch Supabase Auth.
-- Requires role helpers from 20261125190001_csuite_roles_rls.sql.

-- ==============================================
-- 1. TABLE
-- ==============================================

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name         TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  topic        TEXT NOT NULL DEFAULT 'general',
  vehicle      TEXT,
  message      TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'website',
  status       TEXT NOT NULL DEFAULT 'new',
  handled_by   UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  handled_at   TIMESTAMPTZ,
  notified_at  TIMESTAMPTZ,

  CONSTRAINT contact_messages_name_len    CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  CONSTRAINT contact_messages_email_len   CHECK (email IS NULL OR (char_length(email) BETWEEN 5 AND 254 AND email ~ '^[^[:space:]@"''<>`]+@[^[:space:]@"''<>`]+\.[^[:space:]@"''<>`]+$')),
  CONSTRAINT contact_messages_phone_len   CHECK (phone IS NULL OR char_length(phone) BETWEEN 5 AND 30),
  CONSTRAINT contact_messages_topic_len   CHECK (char_length(topic) BETWEEN 1 AND 40),
  CONSTRAINT contact_messages_vehicle_len CHECK (vehicle IS NULL OR char_length(vehicle) <= 120),
  CONSTRAINT contact_messages_message_len CHECK (char_length(btrim(message)) BETWEEN 5 AND 2000),
  CONSTRAINT contact_messages_source_len  CHECK (char_length(source) BETWEEN 1 AND 100),
  CONSTRAINT contact_messages_status_chk  CHECK (status IN ('new', 'handled')),
  -- We must be able to reach the sender somehow
  CONSTRAINT contact_messages_reachable   CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

COMMENT ON TABLE public.contact_messages IS
  'Messages submitted through the public website contact form. Insert-only for the public; staff read/update via RLS.';

CREATE INDEX IF NOT EXISTS idx_contact_messages_created ON public.contact_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_messages_status  ON public.contact_messages (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_messages_email   ON public.contact_messages (lower(email), created_at DESC);

-- ==============================================
-- 2. TRIGGERS
-- ==============================================

-- 2a. Server-side spam throttle: at most 5 messages per sender per hour
CREATE OR REPLACE FUNCTION public.contact_messages_throttle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent integer;
BEGIN
  SELECT count(*) INTO recent
  FROM public.contact_messages m
  WHERE m.created_at > NOW() - INTERVAL '1 hour'
    AND (
      (NEW.email IS NOT NULL AND lower(m.email) = lower(NEW.email))
      OR (NEW.phone IS NOT NULL AND m.phone = NEW.phone)
    );
  IF recent >= 5 THEN
    RAISE EXCEPTION 'Too many messages — please try again later'
      USING ERRCODE = 'KW001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contact_messages_throttle ON public.contact_messages;
CREATE TRIGGER trg_contact_messages_throttle
  BEFORE INSERT ON public.contact_messages
  FOR EACH ROW EXECUTE FUNCTION public.contact_messages_throttle();

-- SECURITY DEFINER: the inserting role (anon) has no SELECT grant, so the
-- throttle count must run with owner rights.
REVOKE ALL ON FUNCTION public.contact_messages_throttle() FROM PUBLIC, anon, authenticated;

-- 2b. Stamp handled_by / handled_at server-side so staff cannot forge them
CREATE OR REPLACE FUNCTION public.contact_messages_stamp_handled()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'handled' AND OLD.status IS DISTINCT FROM 'handled' THEN
    NEW.handled_by := auth.uid();
    NEW.handled_at := NOW();
  ELSIF NEW.status = 'new' THEN
    NEW.handled_by := NULL;
    NEW.handled_at := NULL;
  ELSE
    NEW.handled_by := OLD.handled_by;
    NEW.handled_at := OLD.handled_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contact_messages_stamp_handled ON public.contact_messages;
CREATE TRIGGER trg_contact_messages_stamp_handled
  BEFORE UPDATE ON public.contact_messages
  FOR EACH ROW EXECUTE FUNCTION public.contact_messages_stamp_handled();

-- ==============================================
-- 3. ROW LEVEL SECURITY
-- ==============================================

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_messages_public_insert ON public.contact_messages;
CREATE POLICY contact_messages_public_insert ON public.contact_messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'new'
    AND handled_by IS NULL
    AND handled_at IS NULL
    AND notified_at IS NULL
  );

-- Staff who handle customer enquiries: sales staff (owner/admin/ceo/cfo/cos/
-- chief_of_sales/sales_rep) plus operations (coo). Same helpers as orders / CRM.
DROP POLICY IF EXISTS contact_messages_staff_read ON public.contact_messages;
CREATE POLICY contact_messages_staff_read ON public.contact_messages
  FOR SELECT TO authenticated
  USING (public.is_sales_staff() OR public.is_operations_staff());

DROP POLICY IF EXISTS contact_messages_staff_update ON public.contact_messages;
CREATE POLICY contact_messages_staff_update ON public.contact_messages
  FOR UPDATE TO authenticated
  USING (public.is_sales_staff() OR public.is_operations_staff())
  WITH CHECK (public.is_sales_staff() OR public.is_operations_staff());

-- ==============================================
-- 4. GRANTS (column-level; defence in depth on top of RLS)
-- ==============================================

REVOKE ALL ON public.contact_messages FROM PUBLIC, anon, authenticated;

GRANT INSERT (name, email, phone, topic, vehicle, message, source)
  ON public.contact_messages TO anon, authenticated;

GRANT SELECT ON public.contact_messages TO authenticated;
GRANT UPDATE (status) ON public.contact_messages TO authenticated;

GRANT ALL ON public.contact_messages TO service_role;
