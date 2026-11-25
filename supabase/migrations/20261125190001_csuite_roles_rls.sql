-- Knight Watts Auto Parts — C-suite helpers, RLS expansions, email role seed
-- Requires 20261125190000_csuite_roles_enums.sql (committed first)
-- Does NOT create Auth users. Seed helper is a no-op when emails are absent.

-- ==============================================
-- 1. ROLE HELPERS
-- ==============================================

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$;

-- CEO + legacy owner/admin = full executive control
CREATE OR REPLACE FUNCTION public.is_owner_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_user_role() IN ('owner', 'admin', 'ceo'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_ceo()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() IN ('ceo', 'owner'), false);
$$;

CREATE OR REPLACE FUNCTION public.is_c_suite()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_user_role() IN ('owner', 'admin', 'ceo', 'cfo', 'coo', 'cos'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_finance_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_user_role() IN ('owner', 'admin', 'ceo', 'cfo'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_operations_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_user_role() IN ('owner', 'admin', 'ceo', 'coo'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_chief_of_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() = 'cos', false);
$$;

CREATE OR REPLACE FUNCTION public.is_chief_of_sales()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() = 'chief_of_sales', false);
$$;

-- Sales leadership: can see all reps / approve commissions / assign orders
-- Includes CFO (commissions payable) and COS (manages heads of sales)
CREATE OR REPLACE FUNCTION public.is_sales_leadership()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_user_role() IN (
      'owner', 'admin', 'ceo', 'cfo', 'cos', 'chief_of_sales'
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_sales_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_user_role() IN (
      'owner', 'admin', 'ceo', 'cfo', 'cos', 'chief_of_sales', 'sales_rep'
    ),
    false
  );
$$;

-- COS + CEO/owner/admin can manage sales rep roster
CREATE OR REPLACE FUNCTION public.is_sales_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_user_role() IN ('owner', 'admin', 'ceo', 'cos'),
    false
  );
$$;

-- Catalogue / stock readers (COO manages; CFO values inventory; reps browse)
CREATE OR REPLACE FUNCTION public.can_read_products_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_user_role() IN (
      'owner', 'admin', 'ceo', 'cfo', 'coo', 'cos',
      'chief_of_sales', 'sales_rep', 'print_operator', 'hq_readonly'
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_products()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_user_role() IN ('owner', 'admin', 'ceo', 'coo'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_orders_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_user_role() IN (
      'owner', 'admin', 'ceo', 'cfo', 'coo', 'cos', 'chief_of_sales'
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_orders()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_user_role() IN ('owner', 'admin', 'ceo', 'coo'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_reports_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_user_role() IN (
      'owner', 'admin', 'ceo', 'cfo', 'hq_readonly'
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_telemetry_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_user_role() IN (
      'owner', 'admin', 'ceo', 'coo', 'cos', 'hq_readonly', 'print_operator'
    ),
    false
  );
$$;

-- Grants
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'current_user_role',
    'is_owner_or_admin',
    'is_ceo',
    'is_c_suite',
    'is_finance_staff',
    'is_operations_staff',
    'is_chief_of_staff',
    'is_chief_of_sales',
    'is_sales_leadership',
    'is_sales_staff',
    'is_sales_admin',
    'can_read_products_staff',
    'can_manage_products',
    'can_read_orders_staff',
    'can_manage_orders',
    'can_read_reports_staff',
    'can_read_telemetry_staff'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I() FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I() TO authenticated', fn);
  END LOOP;
END $$;

-- ==============================================
-- 2. SALES ADMIN WRITE (COS can manage reps / rules with finance)
-- ==============================================

DROP POLICY IF EXISTS sales_reps_write ON public.sales_reps;
CREATE POLICY sales_reps_write ON public.sales_reps
  FOR ALL TO authenticated
  USING (public.is_sales_admin())
  WITH CHECK (public.is_sales_admin());

DROP POLICY IF EXISTS commission_rules_write ON public.commission_rules;
CREATE POLICY commission_rules_write ON public.commission_rules
  FOR ALL TO authenticated
  USING (public.is_finance_staff() OR public.is_sales_admin())
  WITH CHECK (public.is_finance_staff() OR public.is_sales_admin());

-- Profiles leadership can list now includes C-suite sales roles
DROP POLICY IF EXISTS sales_leadership_read_sales_profiles ON public.user_profiles;
CREATE POLICY sales_leadership_read_sales_profiles ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    public.is_sales_leadership()
    AND role IN (
      'sales_rep', 'chief_of_sales', 'cos', 'cfo', 'coo', 'ceo',
      'owner', 'admin'
    )
  );

DROP POLICY IF EXISTS admin_update_sales_roles ON public.user_profiles;
CREATE POLICY admin_update_sales_roles ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (public.is_sales_admin())
  WITH CHECK (public.is_sales_admin());

-- ensure_sales_rep_profile: allow COS
CREATE OR REPLACE FUNCTION public.ensure_sales_rep_profile(
  p_user_id UUID,
  p_display_name TEXT DEFAULT NULL,
  p_referral_code TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL
)
RETURNS public.sales_reps
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.user_profiles;
  v_code TEXT;
  v_rep public.sales_reps;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_sales_admin() THEN
    RAISE EXCEPTION 'Only sales admins can manage sales reps' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile FROM public.user_profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_profile.role NOT IN ('sales_rep', 'chief_of_sales') THEN
    RAISE EXCEPTION 'User must have sales_rep or chief_of_sales role first' USING ERRCODE = '22023';
  END IF;

  v_code := upper(regexp_replace(coalesce(p_referral_code, ''), '[^A-Za-z0-9]', '', 'g'));
  IF length(v_code) < 4 THEN
    v_code := upper(substr(regexp_replace(coalesce(v_profile.full_name, 'REP'), '[^A-Za-z0-9]', '', 'g'), 1, 4))
      || upper(substr(replace(p_user_id::text, '-', ''), 1, 4));
    v_code := regexp_replace(v_code, '[^A-Z0-9]', 'X', 'g');
    IF length(v_code) < 4 THEN
      v_code := 'REP' || upper(substr(replace(p_user_id::text, '-', ''), 1, 5));
    END IF;
  END IF;

  INSERT INTO public.sales_reps (id, referral_code, display_name, phone)
  VALUES (
    p_user_id,
    v_code,
    coalesce(nullif(btrim(p_display_name), ''), nullif(btrim(v_profile.full_name), ''), v_profile.email),
    coalesce(p_phone, v_profile.phone)
  )
  ON CONFLICT (id) DO UPDATE
  SET referral_code = EXCLUDED.referral_code,
      display_name = EXCLUDED.display_name,
      phone = COALESCE(EXCLUDED.phone, public.sales_reps.phone),
      is_active = TRUE,
      updated_at = NOW()
  RETURNING * INTO v_rep;

  RETURN v_rep;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_sales_rep_profile(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_sales_rep_profile(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ==============================================
-- 3. CORE TABLE RLS — additional permissive policies
-- (existing owner/admin policies remain; these OR in C-suite)
-- ==============================================

-- Products: staff read beyond public; COO/CEO manage
DROP POLICY IF EXISTS csuite_read_products ON public.products;
CREATE POLICY csuite_read_products ON public.products
  FOR SELECT TO authenticated
  USING (public.can_read_products_staff());

DROP POLICY IF EXISTS csuite_manage_products ON public.products;
CREATE POLICY csuite_manage_products ON public.products
  FOR ALL TO authenticated
  USING (public.can_manage_products())
  WITH CHECK (public.can_manage_products());

-- Orders
DROP POLICY IF EXISTS csuite_read_orders ON public.orders;
CREATE POLICY csuite_read_orders ON public.orders
  FOR SELECT TO authenticated
  USING (public.can_read_orders_staff());

DROP POLICY IF EXISTS csuite_manage_orders ON public.orders;
CREATE POLICY csuite_manage_orders ON public.orders
  FOR UPDATE TO authenticated
  USING (public.can_manage_orders())
  WITH CHECK (public.can_manage_orders());

-- Custom requests / quotes — operations
DROP POLICY IF EXISTS csuite_read_requests ON public.custom_part_requests;
CREATE POLICY csuite_read_requests ON public.custom_part_requests
  FOR SELECT TO authenticated
  USING (public.is_operations_staff() OR public.is_owner_or_admin());

DROP POLICY IF EXISTS csuite_manage_requests ON public.custom_part_requests;
CREATE POLICY csuite_manage_requests ON public.custom_part_requests
  FOR UPDATE TO authenticated
  USING (public.is_operations_staff() OR public.is_owner_or_admin())
  WITH CHECK (public.is_operations_staff() OR public.is_owner_or_admin());

DROP POLICY IF EXISTS csuite_manage_quotes ON public.quotes;
CREATE POLICY csuite_manage_quotes ON public.quotes
  FOR ALL TO authenticated
  USING (public.is_operations_staff() OR public.is_owner_or_admin())
  WITH CHECK (public.is_operations_staff() OR public.is_owner_or_admin());

-- Print jobs / printers — operations
DROP POLICY IF EXISTS csuite_read_print_jobs ON public.print_jobs;
CREATE POLICY csuite_read_print_jobs ON public.print_jobs
  FOR SELECT TO authenticated
  USING (
    public.is_operations_staff()
    OR public.current_user_role() = 'print_operator'
  );

DROP POLICY IF EXISTS csuite_manage_print_jobs ON public.print_jobs;
CREATE POLICY csuite_manage_print_jobs ON public.print_jobs
  FOR ALL TO authenticated
  USING (public.is_operations_staff())
  WITH CHECK (public.is_operations_staff());

DROP POLICY IF EXISTS csuite_read_printers ON public.printers;
CREATE POLICY csuite_read_printers ON public.printers
  FOR SELECT TO authenticated
  USING (
    public.is_operations_staff()
    OR public.current_user_role() = 'print_operator'
  );

-- Deliveries
DROP POLICY IF EXISTS csuite_manage_deliveries ON public.deliveries;
CREATE POLICY csuite_manage_deliveries ON public.deliveries
  FOR ALL TO authenticated
  USING (public.is_operations_staff())
  WITH CHECK (public.is_operations_staff());

-- Telemetry
DROP POLICY IF EXISTS csuite_read_telemetry ON public.telemetry_events;
CREATE POLICY csuite_read_telemetry ON public.telemetry_events
  FOR SELECT TO authenticated
  USING (public.can_read_telemetry_staff());

-- Reports / evaluations / site events
DROP POLICY IF EXISTS csuite_read_reports ON public.reports;
CREATE POLICY csuite_read_reports ON public.reports
  FOR SELECT TO authenticated
  USING (public.can_read_reports_staff());

DROP POLICY IF EXISTS csuite_create_reports ON public.reports;
CREATE POLICY csuite_create_reports ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (public.is_finance_staff() OR public.is_owner_or_admin());

DROP POLICY IF EXISTS csuite_read_evaluations ON public.evaluations;
CREATE POLICY csuite_read_evaluations ON public.evaluations
  FOR SELECT TO authenticated
  USING (
    public.is_finance_staff()
    OR public.is_c_suite()
    OR public.current_user_role() = 'hq_readonly'
  );

DROP POLICY IF EXISTS csuite_read_events ON public.site_events;
CREATE POLICY csuite_read_events ON public.site_events
  FOR SELECT TO authenticated
  USING (
    public.is_c_suite()
    OR public.current_user_role() = 'hq_readonly'
  );

-- Analytics queue (finance + CEO)
DROP POLICY IF EXISTS csuite_read_analytics_queue ON public.analytics_queue;
CREATE POLICY csuite_read_analytics_queue ON public.analytics_queue
  FOR SELECT TO authenticated
  USING (public.is_finance_staff() OR public.is_owner_or_admin());

-- ==============================================
-- 4. FINANCE RPC — inventory valuation + commissions payable
-- ==============================================

CREATE OR REPLACE FUNCTION public.finance_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_finance_staff() OR public.is_owner_or_admin() OR public.is_c_suite()
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- C-suite can call; CFO-focused payload still useful for CEO/COS overview
  SELECT jsonb_build_object(
    'revenue_kes', COALESCE((
      SELECT SUM(total_kes) FROM public.orders
      WHERE status IS DISTINCT FROM 'cancelled'
    ), 0),
    'orders_count', COALESCE((
      SELECT COUNT(*) FROM public.orders
      WHERE status IS DISTINCT FROM 'cancelled'
    ), 0),
    'inventory_units', COALESCE((
      SELECT SUM(stock_quantity) FROM public.products WHERE is_active
    ), 0),
    'inventory_valuation_kes', COALESCE((
      SELECT SUM(stock_quantity * price_kes) FROM public.products WHERE is_active
    ), 0),
    'low_stock_skus', COALESCE((
      SELECT COUNT(*) FROM public.products
      WHERE is_active AND stock_quantity <= COALESCE(low_stock_threshold, 5)
    ), 0),
    'commissions_pending_kes', COALESCE((
      SELECT SUM(commission_amount_kes) FROM public.commission_entries
      WHERE status = 'pending'
    ), 0),
    'commissions_approved_kes', COALESCE((
      SELECT SUM(commission_amount_kes) FROM public.commission_entries
      WHERE status = 'approved'
    ), 0),
    'commissions_paid_kes', COALESCE((
      SELECT SUM(commission_amount_kes) FROM public.commission_entries
      WHERE status = 'paid'
    ), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_dashboard_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.operations_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_operations_staff() OR public.is_owner_or_admin()
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'orders_pending', COALESCE((
      SELECT COUNT(*) FROM public.orders WHERE status IN ('pending', 'processing', 'confirmed')
    ), 0),
    'orders_shipped', COALESCE((
      SELECT COUNT(*) FROM public.orders WHERE status IN ('shipped', 'out_for_delivery')
    ), 0),
    'requests_pending', COALESCE((
      SELECT COUNT(*) FROM public.custom_part_requests WHERE status = 'pending'
    ), 0),
    'print_jobs_active', COALESCE((
      SELECT COUNT(*) FROM public.print_jobs WHERE status IN ('queued', 'printing')
    ), 0),
    'products_active', COALESCE((
      SELECT COUNT(*) FROM public.products WHERE is_active
    ), 0),
    'low_stock_skus', COALESCE((
      SELECT COUNT(*) FROM public.products
      WHERE is_active AND stock_quantity <= COALESCE(low_stock_threshold, 5)
    ), 0),
    'open_sales_tasks', COALESCE((
      SELECT COUNT(*) FROM public.sales_tasks
      WHERE status IN ('todo', 'in_progress')
    ), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.operations_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.operations_dashboard_stats() TO authenticated;

-- ==============================================
-- 5. EMAIL → ROLE SEED HELPER (no Auth user creation)
-- ==============================================

CREATE OR REPLACE FUNCTION public.seed_csuite_roles_by_email()
RETURNS TABLE(mapped_email text, assigned_role user_role, result_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_uid uuid;
BEGIN
  -- Only callable by service_role / postgres (dashboard SQL) — revoke from clients
  FOR r IN
    SELECT * FROM (VALUES
      ('escrivanyagah5@gmail.com'::text, 'ceo'::user_role),
      ('dkinyua971@gmail.com', 'cfo'),
      ('eliudmugo07@gmail.com', 'coo'),
      ('ldayanti719@gmail.com', 'cos'),
      ('sales001@knightwatts.co.ke', 'sales_rep')
    ) AS t(em, rl)
  LOOP
    mapped_email := r.em;
    assigned_role := r.rl;

    SELECT u.id INTO v_uid
    FROM auth.users u
    WHERE lower(u.email) = lower(r.em)
    LIMIT 1;

    IF v_uid IS NULL THEN
      result_status := 'skipped_no_auth_user';
      RETURN NEXT;
      CONTINUE;
    END IF;

    INSERT INTO public.user_profiles (id, email, full_name, role)
    VALUES (
      v_uid,
      lower(r.em),
      split_part(r.em, '@', 1),
      r.rl
    )
    ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role,
        email = EXCLUDED.email,
        updated_at = NOW();

    result_status := 'role_assigned';
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_csuite_roles_by_email() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_csuite_roles_by_email() TO service_role;

COMMENT ON FUNCTION public.seed_csuite_roles_by_email() IS
  'Maps known C-suite / sample sales emails to user_profiles.role when auth.users rows exist. Safe no-op when missing. Call from SQL editor after Auth users exist: SELECT * FROM seed_csuite_roles_by_email();';
