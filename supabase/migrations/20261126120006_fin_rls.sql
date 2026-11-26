-- Finance — role gates (CFO write, owner/CEO/CFO read) + RLS on all fin_* tables

CREATE OR REPLACE FUNCTION public.fin_is_cfo()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() = 'cfo', false);
$$;

CREATE OR REPLACE FUNCTION public.fin_can_read()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_user_role() IN ('cfo', 'ceo', 'owner'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.fin_can_write()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() = 'cfo', false);
$$;

REVOKE ALL ON FUNCTION public.fin_is_cfo() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fin_can_read() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fin_can_write() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_is_cfo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_can_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_can_write() TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_ceo_may_view_payslip_detail()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_user_role() <> 'ceo'
    OR (SELECT ceo_can_view_payslips FROM public.fin_settings WHERE id = 1),
    true
  );
$$;

REVOKE ALL ON FUNCTION public.fin_ceo_may_view_payslip_detail() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_ceo_may_view_payslip_detail() TO authenticated;

-- Apply uniform RLS to every public.fin_% table (no per-entity policies)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
  WHERE schemaname = 'public' AND tablename LIKE 'fin\_%' ESCAPE '\'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);

    EXECUTE format('DROP POLICY IF EXISTS fin_read ON public.%I', r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS fin_write ON public.%I', r.tablename);

    IF r.tablename = 'fin_payslips' THEN
      EXECUTE format(
        'CREATE POLICY fin_read ON public.%I FOR SELECT TO authenticated USING (public.fin_can_read() AND public.fin_ceo_may_view_payslip_detail())',
        r.tablename
      );
    ELSE
      EXECUTE format(
        'CREATE POLICY fin_read ON public.%I FOR SELECT TO authenticated USING (public.fin_can_read())',
        r.tablename
      );
    END IF;

    EXECUTE format(
      'CREATE POLICY fin_write ON public.%I FOR ALL TO authenticated USING (public.fin_can_write()) WITH CHECK (public.fin_can_write())',
      r.tablename
    );

    EXECUTE format('REVOKE ALL ON public.%I FROM anon', r.tablename);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', r.tablename);
  END LOOP;
END $$;

-- Revoke anon on finance posting helpers already restricted; ensure reporting funcs granted later
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'fin\_%' ESCAPE '\'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.fn);
  END LOOP;
END $$;