-- contact_messages tests (NOT auto-applied). Run via psql in a scratch DB after the
-- 20261127120000_contact_messages.sql migration. Synthetic fixtures only; rolls back.
-- Needs at least one user_profiles row with a staff role (ceo/owner/admin/sales_rep...)
-- and one with a non-staff role (e.g. print_operator) to exercise staff vs non-staff.

BEGIN;

DO $$
DECLARE
  v_staff uuid;
  v_nonstaff uuid;
  v_id uuid;
  v_n int;
BEGIN
  SELECT id INTO v_staff FROM public.user_profiles
   WHERE role IN ('ceo','owner','admin') LIMIT 1;
  SELECT id INTO v_nonstaff FROM public.user_profiles
   WHERE role = 'print_operator' LIMIT 1;
  IF v_staff IS NULL THEN RAISE EXCEPTION 'fixture: need a ceo/owner/admin profile'; END IF;

  -- ---- anon: may INSERT, may not SELECT/UPDATE/DELETE ----
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;

  INSERT INTO public.contact_messages (name, email, message, topic, source)
  VALUES ('Test Visitor', 'visitor@example.test', 'Hello, do you stock part X?', 'parts', 'test-index');

  BEGIN
    PERFORM count(*) FROM public.contact_messages;
    RAISE EXCEPTION 'anon SELECT should be denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  BEGIN
    UPDATE public.contact_messages SET status = 'handled';
    RAISE EXCEPTION 'anon UPDATE should be denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  BEGIN
    DELETE FROM public.contact_messages;
    RAISE EXCEPTION 'anon DELETE should be denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- anon cannot pre-set handled/status columns
  BEGIN
    INSERT INTO public.contact_messages (name, email, message, status)
    VALUES ('X', 'x@example.test', 'hello there', 'handled');
    RAISE EXCEPTION 'anon insert of status should be denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- length / shape checks
  BEGIN
    INSERT INTO public.contact_messages (name, email, message)
    VALUES ('X', 'x@example.test', 'hi');
    RAISE EXCEPTION 'short message should be rejected';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    INSERT INTO public.contact_messages (name, email, message)
    VALUES ('X', 'not-an-email', 'a long enough message');
    RAISE EXCEPTION 'bad email should be rejected';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    INSERT INTO public.contact_messages (name, message)
    VALUES ('X', 'a long enough message but no contact');
    RAISE EXCEPTION 'missing email+phone should be rejected';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    INSERT INTO public.contact_messages (name, phone, message)
    VALUES ('X', '0000000000', repeat('a', 2001));
    RAISE EXCEPTION 'oversize message should be rejected';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- throttle: 5 per sender per hour (1 already inserted above for visitor@)
  FOR i IN 1..4 LOOP
    INSERT INTO public.contact_messages (name, email, message)
    VALUES ('Test Visitor', 'visitor@example.test', 'repeat message number ' || i);
  END LOOP;
  BEGIN
    INSERT INTO public.contact_messages (name, email, message)
    VALUES ('Test Visitor', 'Visitor@Example.test', 'sixth message in an hour');
    RAISE EXCEPTION 'throttle should reject the 6th message';
  EXCEPTION WHEN SQLSTATE 'KW001' THEN NULL; END;

  RESET ROLE;

  -- ---- non-staff authenticated: no read ----
  IF v_nonstaff IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_nonstaff, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_nonstaff::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_n FROM public.contact_messages;
    IF v_n <> 0 THEN RAISE EXCEPTION 'non-staff must see 0 rows, saw %', v_n; END IF;
    RESET ROLE;
  END IF;

  -- ---- staff: read, mark handled (stamped server-side), cannot delete ----
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  SET LOCAL ROLE authenticated;

  SELECT id INTO v_id FROM public.contact_messages ORDER BY created_at LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'staff should see inserted rows'; END IF;

  UPDATE public.contact_messages SET status = 'handled' WHERE id = v_id;
  SELECT count(*) INTO v_n FROM public.contact_messages
   WHERE id = v_id AND status = 'handled' AND handled_by = v_staff AND handled_at IS NOT NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'handled_by/handled_at not stamped'; END IF;

  BEGIN
    UPDATE public.contact_messages SET message = 'tampered' WHERE id = v_id;
    RAISE EXCEPTION 'staff must not edit message text';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  BEGIN
    DELETE FROM public.contact_messages WHERE id = v_id;
    RAISE EXCEPTION 'staff must not delete';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  UPDATE public.contact_messages SET status = 'new' WHERE id = v_id;  -- reopen clears stamp
  RESET ROLE;
END $$;

ROLLBACK;
