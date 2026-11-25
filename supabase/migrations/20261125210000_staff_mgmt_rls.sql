-- Staff management: User Management RLS + forced first-login password flag.
-- Apply on merge only (not before). Edge Function admin-create-staff sets the flag.

-- ==============================================
-- 1. must_change_password on profiles
-- ==============================================

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.user_profiles.must_change_password IS
  'When true, admin portal blocks all pages until the user sets their own password.';

-- Block clearing must_change_password via ordinary UPDATEs (own-profile RLS).
-- Only clear_own_must_change_password() may flip TRUE → FALSE (sets a one-shot GUC).
CREATE OR REPLACE FUNCTION public.guard_must_change_password()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.must_change_password IS TRUE
     AND NEW.must_change_password IS FALSE
     AND current_setting('app.clearing_must_change_password', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Password change flag can only be cleared via clear_own_must_change_password()'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_must_change_password ON public.user_profiles;
CREATE TRIGGER trg_guard_must_change_password
  BEFORE UPDATE OF must_change_password ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_must_change_password();

-- Authenticated user may clear ONLY their own flag after updateUser({password})
CREATE OR REPLACE FUNCTION public.clear_own_must_change_password()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Allow this transaction to flip the flag (see guard_must_change_password)
  PERFORM set_config('app.clearing_must_change_password', 'on', true);

  UPDATE public.user_profiles
  SET must_change_password = FALSE,
      updated_at = NOW()
  WHERE id = auth.uid()
    AND must_change_password = TRUE;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_own_must_change_password() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_own_must_change_password() TO authenticated;

-- ==============================================
-- 2. User Management read policies
-- ==============================================

DROP POLICY IF EXISTS staff_admin_read_all_profiles ON public.user_profiles;
CREATE POLICY staff_admin_read_all_profiles ON public.user_profiles
  FOR SELECT TO authenticated
  USING (public.is_owner_or_admin());

DROP POLICY IF EXISTS cos_read_sales_staff_profiles ON public.user_profiles;
CREATE POLICY cos_read_sales_staff_profiles ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    public.is_chief_of_staff()
    AND role IN ('sales_rep', 'chief_of_sales', 'cos')
  );

COMMENT ON POLICY staff_admin_read_all_profiles ON public.user_profiles IS
  'CEO/owner/admin can list all staff for User Management';
COMMENT ON POLICY cos_read_sales_staff_profiles ON public.user_profiles IS
  'Chief of Staff can list sales_rep / chief_of_sales / cos for scoped User Management';
