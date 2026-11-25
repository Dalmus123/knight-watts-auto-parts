-- Preserve existing ceo when seeding C-suite emails.
-- Owner may promote someone (e.g. dkinyua971@gmail.com) to ceo; seed must not demote them.

CREATE OR REPLACE FUNCTION public.seed_csuite_roles_by_email()
RETURNS TABLE(mapped_email text, assigned_role user_role, result_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_uid uuid;
  v_existing user_role;
  v_final user_role;
BEGIN
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
    v_final := r.rl;

    SELECT u.id INTO v_uid
    FROM auth.users u
    WHERE lower(u.email) = lower(r.em)
    LIMIT 1;

    IF v_uid IS NULL THEN
      result_status := 'skipped_no_auth_user';
      RETURN NEXT;
      CONTINUE;
    END IF;

    SELECT p.role INTO v_existing
    FROM public.user_profiles p
    WHERE p.id = v_uid;

    -- Never downgrade an existing ceo via seed (manual promotions stick)
    IF v_existing = 'ceo' AND r.rl IS DISTINCT FROM 'ceo' THEN
      v_final := 'ceo';
      assigned_role := 'ceo';
      result_status := 'kept_existing_ceo';
      -- Still refresh email / updated_at without changing role
      UPDATE public.user_profiles
      SET email = lower(r.em),
          updated_at = NOW()
      WHERE id = v_uid;
      RETURN NEXT;
      CONTINUE;
    END IF;

    INSERT INTO public.user_profiles (id, email, full_name, role)
    VALUES (
      v_uid,
      lower(r.em),
      split_part(r.em, '@', 1),
      v_final
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
  'Maps known C-suite / sample sales emails to user_profiles.role when auth.users rows exist. Never demotes an existing ceo. Safe no-op when Auth user missing.';
