-- Knight Watts Auto Parts - Secure Order Tracking
-- Migration: Add track_order RPC and secure customer profile creation

-- ==============================================
-- SECURE ORDER TRACKING RPC
-- ==============================================

-- Function for customers to track orders with contact verification
-- Replaces direct public_order_tracking view access
CREATE OR REPLACE FUNCTION track_order(
    p_order_number TEXT,
    p_contact TEXT
)
RETURNS TABLE (
    order_number TEXT,
    order_status TEXT,
    order_date TIMESTAMPTZ,
    payment_status TEXT,
    subtotal_kes NUMERIC,
    shipping_kes NUMERIC,
    total_kes NUMERIC,
    delivery_number TEXT,
    delivery_status TEXT,
    delivery_area TEXT,
    scheduled_date DATE,
    scheduled_time_slot TEXT,
    estimated_arrival TIMESTAMPTZ,
    current_location TEXT,
    delivered_at TIMESTAMPTZ,
    courier_service TEXT
)
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Return order if contact matches (email or phone)
    RETURN QUERY
    SELECT
        o.order_number,
        o.status::TEXT as order_status,
        o.created_at as order_date,
        o.payment_status,
        o.subtotal_kes,
        o.shipping_kes,
        o.total_kes,
        d.delivery_number,
        d.status::TEXT as delivery_status,
        d.delivery_area,
        d.scheduled_date,
        d.scheduled_time_slot,
        d.estimated_arrival,
        d.current_location,
        d.delivered_at,
        d.courier_service
    FROM orders o
    LEFT JOIN deliveries d ON d.order_id = o.id
    WHERE o.order_number = p_order_number
      AND o.status NOT IN ('cancelled')
      AND (
          LOWER(o.customer_email) = LOWER(TRIM(p_contact))
          OR o.customer_phone = TRIM(p_contact)
      )
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Grant execute to anon users (public)
GRANT EXECUTE ON FUNCTION track_order(TEXT, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION track_order(TEXT, TEXT) IS 
    'Secure order tracking: returns order details only if contact (email or phone) matches. Rate-limited by Edge Functions.';

-- ==============================================
-- CUSTOMER USER PROFILE TRIGGER
-- ==============================================

-- Ensure new customer signups get a non-staff role
-- This trigger runs when a new user_profile is created without an explicit role
CREATE OR REPLACE FUNCTION set_default_customer_role()
RETURNS TRIGGER AS $$
BEGIN
    -- If no role specified or trying to set a staff role without being owner
    IF NEW.role IS NULL THEN
        -- Check if this is being created by an authenticated owner
        IF auth.uid() IS NOT NULL AND 
           EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'owner') THEN
            -- Owner can create any role, keep the provided role
            RETURN NEW;
        ELSE
            -- Default to customer role for public signups
            -- Note: 'customer' is not a valid user_role enum value in current schema
            -- Public customers should NOT get user_profiles rows
            -- This trigger is defensive - it should rarely fire
            RAISE EXCEPTION 'Customer accounts cannot access admin features. User profile creation blocked.';
        END IF;
    END IF;
    
    -- Prevent non-owners from creating staff accounts
    IF NEW.role IN ('owner', 'admin', 'print_operator', 'hq_readonly') THEN
        IF auth.uid() IS NULL OR 
           NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'owner') THEN
            RAISE EXCEPTION 'Only owners can create staff accounts';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to user_profiles
DROP TRIGGER IF EXISTS enforce_customer_role_defaults ON user_profiles;
CREATE TRIGGER enforce_customer_role_defaults
    BEFORE INSERT ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION set_default_customer_role();

COMMENT ON FUNCTION set_default_customer_role() IS 
    'Prevents public signups from creating user_profiles with staff roles. Staff accounts must be created by owners.';

-- ==============================================
-- RLS POLICY UPDATES
-- ==============================================

-- Add policy to prevent public creation of user_profiles
-- Only owners and service_role can create user_profiles
DROP POLICY IF EXISTS "prevent_public_profile_creation" ON user_profiles;
CREATE POLICY "prevent_public_profile_creation" ON user_profiles
    FOR INSERT
    WITH CHECK (
        -- Only allow if caller is owner or service_role
        EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'owner')
    );

COMMENT ON POLICY "prevent_public_profile_creation" ON user_profiles IS
    'Prevents public signups from creating user_profiles. Staff must be added by owners.';
