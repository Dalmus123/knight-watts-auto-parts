-- Knight Watts Auto Parts — Sales Team CRM
-- Requires 20261125160000_sales_team_crm_enums.sql (committed first)
-- Roles: owner/admin, chief_of_sales, sales_rep
-- Attribution, commission rules/entries, task board, RLS + realtime

-- ==============================================
-- 1. HELPER FUNCTIONS (roles for RLS)
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

CREATE OR REPLACE FUNCTION public.is_owner_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() IN ('owner', 'admin'), false);
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

CREATE OR REPLACE FUNCTION public.is_sales_leadership()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_user_role() IN ('owner', 'admin', 'chief_of_sales'),
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
    public.current_user_role() IN ('owner', 'admin', 'chief_of_sales', 'sales_rep'),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_owner_or_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_chief_of_sales() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_sales_leadership() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_sales_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner_or_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_chief_of_sales() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_sales_leadership() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_sales_staff() TO authenticated;

-- ==============================================
-- 4. SALES REPS
-- ==============================================

CREATE TABLE IF NOT EXISTS public.sales_reps (
  id UUID PRIMARY KEY REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  hired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sales_reps_referral_code_format
    CHECK (referral_code ~ '^[A-Z0-9]{4,16}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS sales_reps_referral_code_uidx
  ON public.sales_reps (upper(referral_code));

CREATE INDEX IF NOT EXISTS idx_sales_reps_active ON public.sales_reps (is_active);

DROP TRIGGER IF EXISTS update_sales_reps_updated_at ON public.sales_reps;
CREATE TRIGGER update_sales_reps_updated_at
  BEFORE UPDATE ON public.sales_reps
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- 5. COMMISSION RULES
-- Priority: product > category > default
-- ==============================================

CREATE TABLE IF NOT EXISTS public.commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope commission_rule_scope NOT NULL,
  category TEXT,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  rate_percent NUMERIC(5,2) NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  label TEXT,
  created_by UUID REFERENCES public.user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT commission_rules_scope_shape CHECK (
    (scope = 'default' AND category IS NULL AND product_id IS NULL)
    OR (scope = 'category' AND category IS NOT NULL AND product_id IS NULL)
    OR (scope = 'product' AND product_id IS NOT NULL AND category IS NULL)
  )
);

-- One active default rule
CREATE UNIQUE INDEX IF NOT EXISTS commission_rules_one_default
  ON public.commission_rules (scope)
  WHERE scope = 'default' AND is_active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS commission_rules_one_active_category
  ON public.commission_rules (lower(category))
  WHERE scope = 'category' AND is_active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS commission_rules_one_active_product
  ON public.commission_rules (product_id)
  WHERE scope = 'product' AND is_active = TRUE;

DROP TRIGGER IF EXISTS update_commission_rules_updated_at ON public.commission_rules;
CREATE TRIGGER update_commission_rules_updated_at
  BEFORE UPDATE ON public.commission_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- 6. ORDER ATTRIBUTION COLUMNS
-- ==============================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS attributed_rep_id UUID REFERENCES public.sales_reps(id),
  ADD COLUMN IF NOT EXISTS attribution_source attribution_source,
  ADD COLUMN IF NOT EXISTS referral_code_used TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_attributed_rep
  ON public.orders (attributed_rep_id)
  WHERE attributed_rep_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_referral_code_used
  ON public.orders (upper(referral_code_used))
  WHERE referral_code_used IS NOT NULL;

-- ==============================================
-- 7. ATTRIBUTED CUSTOMERS
-- ==============================================

CREATE TABLE IF NOT EXISTS public.sales_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT,
  email TEXT,
  phone TEXT,
  attributed_rep_id UUID NOT NULL REFERENCES public.sales_reps(id),
  attribution_source attribution_source NOT NULL DEFAULT 'referral_code',
  first_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS sales_customers_email_rep_uidx
  ON public.sales_customers (lower(email), attributed_rep_id)
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sales_customers_phone_rep_uidx
  ON public.sales_customers (regexp_replace(phone, '\s', '', 'g'), attributed_rep_id)
  WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_customers_rep
  ON public.sales_customers (attributed_rep_id);

DROP TRIGGER IF EXISTS update_sales_customers_updated_at ON public.sales_customers;
CREATE TRIGGER update_sales_customers_updated_at
  BEFORE UPDATE ON public.sales_customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- 8. COMMISSION ENTRIES (per order line)
-- ==============================================

CREATE TABLE IF NOT EXISTS public.commission_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sales_rep_id UUID NOT NULL REFERENCES public.sales_reps(id),
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  category TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_kes NUMERIC(10,2) NOT NULL CHECK (unit_price_kes >= 0),
  line_total_kes NUMERIC(10,2) NOT NULL CHECK (line_total_kes >= 0),
  commission_rate_percent NUMERIC(5,2) NOT NULL CHECK (commission_rate_percent >= 0),
  commission_amount_kes NUMERIC(10,2) NOT NULL CHECK (commission_amount_kes >= 0),
  status commission_status NOT NULL DEFAULT 'pending',
  rule_id UUID REFERENCES public.commission_rules(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.user_profiles(id),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_entries_rep
  ON public.commission_entries (sales_rep_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_commission_entries_order
  ON public.commission_entries (order_id);

CREATE INDEX IF NOT EXISTS idx_commission_entries_status
  ON public.commission_entries (status);

CREATE INDEX IF NOT EXISTS idx_commission_entries_product
  ON public.commission_entries (product_id)
  WHERE product_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_commission_entries_updated_at ON public.commission_entries;
CREATE TRIGGER update_commission_entries_updated_at
  BEFORE UPDATE ON public.commission_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- 9. SALES TASKS
-- ==============================================

CREATE TABLE IF NOT EXISTS public.sales_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  description TEXT,
  due_date DATE,
  status sales_task_status NOT NULL DEFAULT 'todo',
  assignee_id UUID NOT NULL REFERENCES public.sales_reps(id),
  assigned_by UUID REFERENCES public.user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_tasks_assignee
  ON public.sales_tasks (assignee_id, status);

CREATE INDEX IF NOT EXISTS idx_sales_tasks_due
  ON public.sales_tasks (due_date)
  WHERE status IN ('todo', 'in_progress');

DROP TRIGGER IF EXISTS update_sales_tasks_updated_at ON public.sales_tasks;
CREATE TRIGGER update_sales_tasks_updated_at
  BEFORE UPDATE ON public.sales_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- 10. RESOLVE COMMISSION RATE
-- ==============================================

CREATE OR REPLACE FUNCTION public.resolve_commission_rate(
  p_product_id UUID,
  p_category TEXT
)
RETURNS TABLE (rate_percent NUMERIC, rule_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate NUMERIC;
  v_rule UUID;
  v_cat TEXT := nullif(lower(btrim(coalesce(p_category, ''))), '');
BEGIN
  IF p_product_id IS NOT NULL THEN
    SELECT r.rate_percent, r.id INTO v_rate, v_rule
    FROM public.commission_rules r
    WHERE r.scope = 'product' AND r.product_id = p_product_id AND r.is_active
    LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_rate, v_rule;
      RETURN;
    END IF;
  END IF;

  IF v_cat IS NOT NULL THEN
    SELECT r.rate_percent, r.id INTO v_rate, v_rule
    FROM public.commission_rules r
    WHERE r.scope = 'category' AND lower(r.category) = v_cat AND r.is_active
    LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_rate, v_rule;
      RETURN;
    END IF;
  END IF;

  SELECT r.rate_percent, r.id INTO v_rate, v_rule
  FROM public.commission_rules r
  WHERE r.scope = 'default' AND r.is_active
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_rate, v_rule;
  ELSE
    RETURN QUERY SELECT 5.00::NUMERIC, NULL::UUID;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_commission_rate(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_commission_rate(UUID, TEXT) TO authenticated, service_role;

-- ==============================================
-- 11. LOOKUP REFERRAL + COMPUTE COMMISSIONS
-- ==============================================

CREATE OR REPLACE FUNCTION public.lookup_sales_rep_by_code(p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_norm TEXT := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
BEGIN
  IF length(v_norm) < 4 THEN
    RETURN NULL;
  END IF;
  SELECT id INTO v_id
  FROM public.sales_reps
  WHERE is_active = TRUE AND upper(referral_code) = v_norm
  LIMIT 1;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_sales_rep_by_code(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_sales_rep_by_code(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.compute_order_commissions(p_order_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item JSONB;
  v_pid UUID;
  v_pname TEXT;
  v_qty INT;
  v_price NUMERIC;
  v_cat TEXT;
  v_rate NUMERIC;
  v_rule UUID;
  v_line NUMERIC;
  v_count INT := 0;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND OR v_order.attributed_rep_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Rebuild commissions only while pending (do not wipe approved/paid)
  IF EXISTS (
    SELECT 1 FROM public.commission_entries
    WHERE order_id = p_order_id AND status <> 'pending'
  ) THEN
    RETURN 0;
  END IF;

  DELETE FROM public.commission_entries
  WHERE order_id = p_order_id AND status = 'pending';

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_order.items, '[]'::jsonb)) LOOP
    BEGIN
      v_qty := (v_item ->> 'quantity')::INT;
    EXCEPTION WHEN OTHERS THEN
      v_qty := NULL;
    END;
    IF v_qty IS NULL OR v_qty < 1 THEN
      CONTINUE;
    END IF;

    v_pid := NULL;
    v_pname := left(btrim(coalesce(v_item ->> 'name', v_item ->> 'product_name', 'Item')), 200);
    BEGIN
      IF coalesce(v_item ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_pid := (v_item ->> 'id')::UUID;
      ELSIF coalesce(v_item ->> 'product_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_pid := (v_item ->> 'product_id')::UUID;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_pid := NULL;
    END;

    BEGIN
      v_price := coalesce((v_item ->> 'price')::NUMERIC, (v_item ->> 'price_kes')::NUMERIC);
    EXCEPTION WHEN OTHERS THEN
      v_price := 0;
    END;

    v_cat := NULL;
    IF v_pid IS NOT NULL THEN
      SELECT p.category, COALESCE(NULLIF(v_pname, 'Item'), p.name), COALESCE(v_price, p.price_kes)
      INTO v_cat, v_pname, v_price
      FROM public.products p
      WHERE p.id = v_pid;
    END IF;
    v_cat := coalesce(v_cat, nullif(v_item ->> 'category', ''));

    SELECT r.rate_percent, r.rule_id INTO v_rate, v_rule
    FROM public.resolve_commission_rate(v_pid, v_cat) r;

    v_line := round(coalesce(v_price, 0) * v_qty, 2);

    INSERT INTO public.commission_entries (
      order_id, sales_rep_id, product_id, product_name, category,
      quantity, unit_price_kes, line_total_kes,
      commission_rate_percent, commission_amount_kes, status, rule_id
    ) VALUES (
      p_order_id, v_order.attributed_rep_id, v_pid, v_pname, v_cat,
      v_qty, round(coalesce(v_price, 0), 2), v_line,
      v_rate, round(v_line * v_rate / 100.0, 2), 'pending', v_rule
    );
    v_count := v_count + 1;
  END LOOP;

  -- Link / refresh attributed customer (email or phone match for this rep)
  IF EXISTS (
    SELECT 1 FROM public.sales_customers sc
    WHERE sc.attributed_rep_id = v_order.attributed_rep_id
      AND (
        (sc.email IS NOT NULL AND lower(sc.email) = lower(v_order.customer_email))
        OR (sc.phone IS NOT NULL AND regexp_replace(sc.phone, '\s', '', 'g')
            = regexp_replace(v_order.customer_phone, '\s', '', 'g'))
      )
  ) THEN
    UPDATE public.sales_customers sc
    SET full_name = COALESCE(sc.full_name, v_order.customer_name),
        email = COALESCE(sc.email, lower(v_order.customer_email)),
        phone = COALESCE(sc.phone, v_order.customer_phone),
        updated_at = NOW()
    WHERE sc.attributed_rep_id = v_order.attributed_rep_id
      AND (
        (sc.email IS NOT NULL AND lower(sc.email) = lower(v_order.customer_email))
        OR (sc.phone IS NOT NULL AND regexp_replace(sc.phone, '\s', '', 'g')
            = regexp_replace(v_order.customer_phone, '\s', '', 'g'))
      );
  ELSE
    INSERT INTO public.sales_customers (
      full_name, email, phone, attributed_rep_id, attribution_source, first_order_id
    ) VALUES (
      v_order.customer_name,
      lower(v_order.customer_email),
      v_order.customer_phone,
      v_order.attributed_rep_id,
      coalesce(v_order.attribution_source, 'referral_code'),
      v_order.id
    );
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.compute_order_commissions(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_order_commissions(UUID) TO authenticated, service_role;

-- ==============================================
-- 12. MANUAL ATTRIBUTION (chief / admin)
-- ==============================================

CREATE OR REPLACE FUNCTION public.assign_order_to_sales_rep(
  p_order_id UUID,
  p_rep_id UUID
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_sales_leadership() THEN
    RAISE EXCEPTION 'Only sales leadership can assign orders' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sales_reps WHERE id = p_rep_id AND is_active) THEN
    RAISE EXCEPTION 'Sales rep not found or inactive' USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders
  SET attributed_rep_id = p_rep_id,
      attribution_source = 'manual',
      updated_at = NOW()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.compute_order_commissions(p_order_id);
  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_order_to_sales_rep(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_order_to_sales_rep(UUID, UUID) TO authenticated;

-- ==============================================
-- 13. COMMISSION STATUS UPDATES
-- ==============================================

CREATE OR REPLACE FUNCTION public.set_commission_status(
  p_entry_ids UUID[],
  p_status commission_status
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_sales_leadership() THEN
    RAISE EXCEPTION 'Only sales leadership can change commission status' USING ERRCODE = '42501';
  END IF;

  IF p_status = 'approved' THEN
    UPDATE public.commission_entries
    SET status = 'approved',
        approved_by = auth.uid(),
        approved_at = NOW(),
        updated_at = NOW()
    WHERE id = ANY (p_entry_ids)
      AND status = 'pending';
    GET DIAGNOSTICS v_updated = ROW_COUNT;
  ELSIF p_status = 'paid' THEN
    UPDATE public.commission_entries
    SET status = 'paid',
        paid_at = NOW(),
        updated_at = NOW()
    WHERE id = ANY (p_entry_ids)
      AND status IN ('approved', 'paid');
    GET DIAGNOSTICS v_updated = ROW_COUNT;
  ELSIF p_status = 'pending' THEN
    UPDATE public.commission_entries
    SET status = 'pending',
        approved_by = NULL,
        approved_at = NULL,
        paid_at = NULL,
        updated_at = NOW()
    WHERE id = ANY (p_entry_ids)
      AND status = 'approved';
    GET DIAGNOSTICS v_updated = ROW_COUNT;
  ELSE
    RAISE EXCEPTION 'Unsupported status transition' USING ERRCODE = '22023';
  END IF;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.set_commission_status(UUID[], commission_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_commission_status(UUID[], commission_status) TO authenticated;

-- ==============================================
-- 14. ENSURE SALES REP PROFILE HELPER
-- ==============================================

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
  IF auth.uid() IS NULL OR NOT public.is_owner_or_admin() THEN
    RAISE EXCEPTION 'Only owner/admin can manage sales reps' USING ERRCODE = '42501';
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
-- 15. EXTEND create_order WITH REFERRAL
-- ==============================================

-- Drop prior 8-arg overload so the new signature (with defaulted referral) replaces it
DROP FUNCTION IF EXISTS public.create_order(text, text, text, text, jsonb, text, text, text);

CREATE OR REPLACE FUNCTION public.create_order(
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_customer_location text,
  p_items jsonb,
  p_shipping_address text DEFAULT NULL,
  p_delivery_notes text DEFAULT NULL,
  p_payment_method text DEFAULT 'cash',
  p_referral_code text DEFAULT NULL
)
RETURNS TABLE(id uuid, order_number text, total_kes numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ip inet; v_hdr text;
  v_name text := btrim(coalesce(p_customer_name, ''));
  v_email text := lower(btrim(coalesce(p_customer_email, '')));
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '\s', '', 'g');
  v_loc text := lower(btrim(coalesce(p_customer_location, '')));
  v_addr text := btrim(coalesce(p_shipping_address, ''));
  v_notes text := nullif(btrim(coalesce(p_delivery_notes, '')), '');
  v_pm text := lower(regexp_replace(coalesce(p_payment_method, ''), '[^a-zA-Z]', '', 'g'));
  v_item jsonb; v_qty int; v_price numeric; v_pid uuid; v_pname text; v_verified boolean;
  v_pcat text;
  v_items jsonb := '[]'::jsonb;
  v_sub numeric := 0; v_ship numeric; v_unverified int := 0;
  v_id uuid; v_num text;
  v_ref text := upper(regexp_replace(coalesce(p_referral_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_rep uuid;
  v_attr attribution_source;
BEGIN
  BEGIN
    v_hdr := current_setting('request.headers', true)::json ->> 'x-forwarded-for';
    v_ip := trim(split_part(coalesce(v_hdr, ''), ',', 1))::inet;
  EXCEPTION WHEN others THEN v_ip := NULL; END;
  IF NOT public.check_rate_limit('rpc/create_order', coalesce(v_ip, '0.0.0.0'::inet), 5, 600) THEN
    RAISE EXCEPTION 'Too many orders from this connection. Please wait a few minutes and try again.' USING ERRCODE = 'P0429';
  END IF;

  IF length(v_name) < 2 OR length(v_name) > 120 THEN RAISE EXCEPTION 'Please enter your name' USING ERRCODE = '22023'; END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 254 THEN RAISE EXCEPTION 'Please enter a valid email address' USING ERRCODE = '22023'; END IF;
  IF v_phone !~ '^(\+254|254|0)[17][0-9]{8}$' THEN RAISE EXCEPTION 'Please enter a valid Kenyan phone number' USING ERRCODE = '22023'; END IF;
  IF length(v_loc) = 0 OR length(v_loc) > 100 THEN RAISE EXCEPTION 'Please choose a delivery or pickup location' USING ERRCODE = '22023'; END IF;
  IF length(v_addr) > 500 OR length(coalesce(v_notes, '')) > 1000 THEN RAISE EXCEPTION 'Address or notes too long' USING ERRCODE = '22023'; END IF;
  IF v_loc LIKE '%delivery%' AND length(v_addr) = 0 THEN RAISE EXCEPTION 'Please enter your delivery address' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Your cart is empty or too large' USING ERRCODE = '22023';
  END IF;
  IF v_pm NOT IN ('mpesa', 'cash', 'bank') THEN v_pm := 'cash'; END IF;

  IF length(v_ref) >= 4 THEN
    v_rep := public.lookup_sales_rep_by_code(v_ref);
    IF v_rep IS NOT NULL THEN
      v_attr := 'referral_code';
    ELSE
      v_ref := NULL;
    END IF;
  ELSE
    v_ref := NULL;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    BEGIN
      v_qty := (v_item ->> 'quantity')::int;
    EXCEPTION WHEN others THEN v_qty := NULL; END;
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > 100 THEN RAISE EXCEPTION 'Invalid item quantity' USING ERRCODE = '22023'; END IF;

    v_pid := NULL; v_price := NULL; v_pname := NULL; v_verified := false; v_pcat := NULL;
    IF coalesce(v_item ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT p.id, p.price_kes, p.name, p.category INTO v_pid, v_price, v_pname, v_pcat
      FROM public.products p WHERE p.id = (v_item ->> 'id')::uuid AND p.is_active = true;
    END IF;
    IF v_pid IS NOT NULL THEN
      v_verified := true;
    ELSE
      BEGIN
        v_price := (v_item ->> 'price')::numeric;
      EXCEPTION WHEN others THEN v_price := NULL; END;
      IF v_price IS NULL OR v_price < 0 OR v_price > 10000000 THEN RAISE EXCEPTION 'Invalid item price' USING ERRCODE = '22023'; END IF;
      v_pname := left(btrim(coalesce(v_item ->> 'name', 'Item')), 200);
      v_pcat := nullif(v_item ->> 'category', '');
      v_unverified := v_unverified + 1;
    END IF;

    v_sub := v_sub + round(v_price, 2) * v_qty;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', coalesce(v_pid::text, left(v_item ->> 'id', 64)),
      'name', v_pname,
      'quantity', v_qty,
      'price', round(v_price, 2),
      'category', v_pcat,
      'location', left(v_item ->> 'location', 50),
      'price_verified', v_verified));
  END LOOP;

  v_ship := CASE v_loc WHEN 'embu-delivery' THEN 200 WHEN 'garissa-delivery' THEN 300 ELSE 0 END;

  INSERT INTO public.orders (
    customer_name, customer_email, customer_phone, customer_location, status, items,
    subtotal_kes, shipping_kes, total_kes, shipping_address, delivery_notes,
    payment_method, payment_status, notes,
    attributed_rep_id, attribution_source, referral_code_used
  )
  VALUES (
    v_name, v_email, v_phone, v_loc, 'pending', v_items,
    v_sub, v_ship, v_sub + v_ship,
    CASE WHEN length(v_addr) > 0 THEN v_addr ELSE 'Pickup: ' || v_loc END,
    v_notes, v_pm, 'unpaid',
    CASE WHEN v_unverified > 0 THEN 'UNVERIFIED PRICES: ' || v_unverified || ' item(s) not matched to the product catalogue - confirm prices before fulfilment.' END,
    v_rep, v_attr, v_ref
  )
  RETURNING orders.id, orders.order_number INTO v_id, v_num;

  IF v_rep IS NOT NULL THEN
    PERFORM public.compute_order_commissions(v_id);
  END IF;

  RETURN QUERY SELECT v_id, v_num, v_sub + v_ship;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_order(text, text, text, text, jsonb, text, text, text, text)
  TO anon, authenticated;

-- ==============================================
-- 16. DASHBOARD RPC (period stats + leaderboard)
-- ==============================================

CREATE OR REPLACE FUNCTION public.sales_dashboard_stats(
  p_period text DEFAULT 'month',
  p_rep_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role := public.current_user_role();
  v_start timestamptz;
  v_rep uuid := p_rep_id;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_sales_staff() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_role = 'sales_rep' THEN
    v_rep := auth.uid();
  ELSIF v_rep IS NOT NULL AND NOT public.is_sales_leadership() THEN
    RAISE EXCEPTION 'Not authorized to view other reps' USING ERRCODE = '42501';
  END IF;

  v_start := CASE lower(coalesce(p_period, 'month'))
    WHEN 'today' THEN date_trunc('day', NOW())
    WHEN 'week' THEN date_trunc('week', NOW())
    WHEN 'month' THEN date_trunc('month', NOW())
    ELSE date_trunc('month', NOW())
  END;

  SELECT jsonb_build_object(
    'period', lower(coalesce(p_period, 'month')),
    'period_start', v_start,
    'rep_id', v_rep,
    'totals', (
      SELECT jsonb_build_object(
        'units', COALESCE(SUM(ce.quantity), 0),
        'revenue_kes', COALESCE(SUM(ce.line_total_kes), 0),
        'commission_kes', COALESCE(SUM(ce.commission_amount_kes), 0),
        'commission_pending_kes', COALESCE(SUM(ce.commission_amount_kes) FILTER (WHERE ce.status = 'pending'), 0),
        'commission_approved_kes', COALESCE(SUM(ce.commission_amount_kes) FILTER (WHERE ce.status = 'approved'), 0),
        'commission_paid_kes', COALESCE(SUM(ce.commission_amount_kes) FILTER (WHERE ce.status = 'paid'), 0),
        'customers', (
          SELECT COUNT(*) FROM public.sales_customers sc
          WHERE sc.created_at >= v_start
            AND (v_rep IS NULL OR sc.attributed_rep_id = v_rep)
        ),
        'orders', (
          SELECT COUNT(*) FROM public.orders o
          WHERE o.created_at >= v_start
            AND o.attributed_rep_id IS NOT NULL
            AND (v_rep IS NULL OR o.attributed_rep_id = v_rep)
        )
      )
      FROM public.commission_entries ce
      WHERE ce.created_at >= v_start
        AND (v_rep IS NULL OR ce.sales_rep_id = v_rep)
    ),
    'by_category', COALESCE((
      SELECT jsonb_agg(row_to_json(x))
      FROM (
        SELECT COALESCE(ce.category, 'Uncategorized') AS category,
               SUM(ce.quantity) AS units,
               SUM(ce.line_total_kes) AS revenue_kes,
               SUM(ce.commission_amount_kes) AS commission_kes
        FROM public.commission_entries ce
        WHERE ce.created_at >= v_start
          AND (v_rep IS NULL OR ce.sales_rep_id = v_rep)
        GROUP BY 1
        ORDER BY revenue_kes DESC
      ) x
    ), '[]'::jsonb),
    'by_product', COALESCE((
      SELECT jsonb_agg(row_to_json(x))
      FROM (
        SELECT ce.product_name,
               ce.product_id,
               COALESCE(ce.category, 'Uncategorized') AS category,
               SUM(ce.quantity) AS units,
               SUM(ce.line_total_kes) AS revenue_kes,
               SUM(ce.commission_amount_kes) AS commission_kes
        FROM public.commission_entries ce
        WHERE ce.created_at >= v_start
          AND (v_rep IS NULL OR ce.sales_rep_id = v_rep)
        GROUP BY ce.product_name, ce.product_id, ce.category
        ORDER BY revenue_kes DESC
        LIMIT 50
      ) x
    ), '[]'::jsonb),
    'leaderboard', CASE WHEN public.is_sales_leadership() OR v_role = 'sales_rep' THEN COALESCE((
      SELECT jsonb_agg(row_to_json(x))
      FROM (
        SELECT sr.id AS rep_id,
               sr.display_name,
               sr.referral_code,
               COALESCE(SUM(ce.quantity), 0) AS units,
               COALESCE(SUM(ce.line_total_kes), 0) AS revenue_kes,
               COALESCE(SUM(ce.commission_amount_kes), 0) AS commission_kes
        FROM public.sales_reps sr
        LEFT JOIN public.commission_entries ce
          ON ce.sales_rep_id = sr.id AND ce.created_at >= v_start
        WHERE sr.is_active
        GROUP BY sr.id, sr.display_name, sr.referral_code
        ORDER BY revenue_kes DESC, units DESC
      ) x
    ), '[]'::jsonb) ELSE '[]'::jsonb END
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.sales_dashboard_stats(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_dashboard_stats(text, uuid) TO authenticated;

-- ==============================================
-- 17. RLS
-- ==============================================

ALTER TABLE public.sales_reps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_tasks ENABLE ROW LEVEL SECURITY;

-- sales_reps
DROP POLICY IF EXISTS sales_reps_select ON public.sales_reps;
CREATE POLICY sales_reps_select ON public.sales_reps
  FOR SELECT TO authenticated
  USING (
    public.is_sales_leadership()
    OR id = auth.uid()
  );

DROP POLICY IF EXISTS sales_reps_write ON public.sales_reps;
CREATE POLICY sales_reps_write ON public.sales_reps
  FOR ALL TO authenticated
  USING (public.is_owner_or_admin())
  WITH CHECK (public.is_owner_or_admin());

-- commission_rules: sales staff read; owner/admin write
DROP POLICY IF EXISTS commission_rules_select ON public.commission_rules;
CREATE POLICY commission_rules_select ON public.commission_rules
  FOR SELECT TO authenticated
  USING (public.is_sales_staff());

DROP POLICY IF EXISTS commission_rules_write ON public.commission_rules;
CREATE POLICY commission_rules_write ON public.commission_rules
  FOR ALL TO authenticated
  USING (public.is_owner_or_admin())
  WITH CHECK (public.is_owner_or_admin());

-- sales_customers
DROP POLICY IF EXISTS sales_customers_select ON public.sales_customers;
CREATE POLICY sales_customers_select ON public.sales_customers
  FOR SELECT TO authenticated
  USING (
    public.is_sales_leadership()
    OR attributed_rep_id = auth.uid()
  );

DROP POLICY IF EXISTS sales_customers_write ON public.sales_customers;
CREATE POLICY sales_customers_write ON public.sales_customers
  FOR ALL TO authenticated
  USING (public.is_sales_leadership())
  WITH CHECK (public.is_sales_leadership());

-- commission_entries
DROP POLICY IF EXISTS commission_entries_select ON public.commission_entries;
CREATE POLICY commission_entries_select ON public.commission_entries
  FOR SELECT TO authenticated
  USING (
    public.is_sales_leadership()
    OR sales_rep_id = auth.uid()
  );

DROP POLICY IF EXISTS commission_entries_leadership_update ON public.commission_entries;
CREATE POLICY commission_entries_leadership_update ON public.commission_entries
  FOR UPDATE TO authenticated
  USING (public.is_sales_leadership())
  WITH CHECK (public.is_sales_leadership());

-- Inserts happen via SECURITY DEFINER compute function
DROP POLICY IF EXISTS commission_entries_leadership_insert ON public.commission_entries;
CREATE POLICY commission_entries_leadership_insert ON public.commission_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.is_sales_leadership());

-- sales_tasks
DROP POLICY IF EXISTS sales_tasks_select ON public.sales_tasks;
CREATE POLICY sales_tasks_select ON public.sales_tasks
  FOR SELECT TO authenticated
  USING (
    public.is_sales_leadership()
    OR assignee_id = auth.uid()
  );

DROP POLICY IF EXISTS sales_tasks_leadership_insert ON public.sales_tasks;
CREATE POLICY sales_tasks_leadership_insert ON public.sales_tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.is_sales_leadership());

DROP POLICY IF EXISTS sales_tasks_leadership_update ON public.sales_tasks;
CREATE POLICY sales_tasks_leadership_update ON public.sales_tasks
  FOR UPDATE TO authenticated
  USING (public.is_sales_leadership())
  WITH CHECK (public.is_sales_leadership());

DROP POLICY IF EXISTS sales_tasks_rep_update_status ON public.sales_tasks;
CREATE POLICY sales_tasks_rep_update_status ON public.sales_tasks
  FOR UPDATE TO authenticated
  USING (assignee_id = auth.uid() AND public.current_user_role() = 'sales_rep')
  WITH CHECK (assignee_id = auth.uid() AND public.current_user_role() = 'sales_rep');

-- Reps may only change task status (not reassign / rewrite title)
CREATE OR REPLACE FUNCTION public.sales_tasks_rep_status_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() = 'sales_rep' AND NOT public.is_sales_leadership() THEN
    IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.due_date IS DISTINCT FROM OLD.due_date
       OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by THEN
      RAISE EXCEPTION 'Sales reps may only update task status' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_tasks_rep_status_only_trg ON public.sales_tasks;
CREATE TRIGGER sales_tasks_rep_status_only_trg
  BEFORE UPDATE ON public.sales_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.sales_tasks_rep_status_only();

DROP POLICY IF EXISTS sales_tasks_leadership_delete ON public.sales_tasks;
CREATE POLICY sales_tasks_leadership_delete ON public.sales_tasks
  FOR DELETE TO authenticated
  USING (public.is_sales_leadership());

-- Orders: let sales leadership read all; reps read attributed
DROP POLICY IF EXISTS sales_leadership_read_orders ON public.orders;
CREATE POLICY sales_leadership_read_orders ON public.orders
  FOR SELECT TO authenticated
  USING (public.is_sales_leadership());

DROP POLICY IF EXISTS sales_rep_read_own_orders ON public.orders;
CREATE POLICY sales_rep_read_own_orders ON public.orders
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'sales_rep'
    AND attributed_rep_id = auth.uid()
  );

DROP POLICY IF EXISTS sales_leadership_update_order_attribution ON public.orders;
CREATE POLICY sales_leadership_update_order_attribution ON public.orders
  FOR UPDATE TO authenticated
  USING (public.is_sales_leadership())
  WITH CHECK (public.is_sales_leadership());

-- user_profiles: sales leadership can list sales staff profiles
DROP POLICY IF EXISTS sales_leadership_read_sales_profiles ON public.user_profiles;
CREATE POLICY sales_leadership_read_sales_profiles ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    public.is_sales_leadership()
    AND role IN ('sales_rep', 'chief_of_sales', 'owner', 'admin')
  );

DROP POLICY IF EXISTS admin_update_sales_roles ON public.user_profiles;
CREATE POLICY admin_update_sales_roles ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (public.is_owner_or_admin())
  WITH CHECK (public.is_owner_or_admin());

-- ==============================================
-- 18. GRANTS (Data API)
-- ==============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_reps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_tasks TO authenticated;

-- Public referral code validation (read-only active codes via RPC only)
-- No direct anon SELECT on sales_reps

-- ==============================================
-- 19. REALTIME
-- ==============================================

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.commission_entries;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_tasks;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_customers;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

COMMENT ON TABLE public.sales_reps IS 'Commission-paid salespeople; referral_code drives attribution';
COMMENT ON TABLE public.commission_rules IS 'Configurable commission %: product overrides category overrides default';
COMMENT ON TABLE public.commission_entries IS 'Per order-line commission with pending/approved/paid status';
COMMENT ON TABLE public.sales_tasks IS 'Chief of Sales task board assigned to reps';
COMMENT ON TABLE public.sales_customers IS 'Customers attributed to a sales rep';
