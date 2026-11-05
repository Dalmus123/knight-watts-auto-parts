-- Knight Watts Auto Parts - Security Hardening
-- Migration 4: Harden SECURITY DEFINER functions and fix concurrency issues

-- ==============================================
-- 1. REVOKE PUBLIC ACCESS TO RATE LIMIT FUNCTIONS
-- ==============================================

-- Revoke all existing grants
REVOKE EXECUTE ON FUNCTION check_rate_limit(TEXT, INET, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION record_rate_limit_violation(TEXT, INET) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_rate_limit_status(TEXT, INET, INTEGER) FROM PUBLIC, anon, authenticated;

-- Grant execute only to service_role
-- These functions should ONLY be called from Edge Functions using service role credentials
GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, INET, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION record_rate_limit_violation(TEXT, INET) TO service_role;
GRANT EXECUTE ON FUNCTION get_rate_limit_status(TEXT, INET, INTEGER) TO service_role;

-- ==============================================
-- 2. HARDEN get_user_role FUNCTION
-- ==============================================

-- Drop and recreate with security improvements
DROP FUNCTION IF EXISTS get_user_role(UUID);

CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS user_role 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_role user_role;
    target_role user_role;
BEGIN
    -- Check if caller is authenticated
    IF auth.uid() IS NULL THEN
        -- Not authenticated - deny access
        RETURN NULL;
    END IF;
    
    -- Get caller's role
    SELECT role INTO caller_role FROM user_profiles WHERE id = auth.uid();
    
    -- If caller is owner or admin, allow any lookup
    IF caller_role IN ('owner', 'admin') THEN
        SELECT role INTO target_role FROM user_profiles WHERE id = user_id;
        RETURN target_role;
    END IF;
    
    -- Otherwise, only allow looking up own role
    IF user_id = auth.uid() THEN
        SELECT role INTO target_role FROM user_profiles WHERE id = user_id;
        RETURN target_role;
    END IF;
    
    -- Deny all other lookups
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Ensure only authenticated users can call this
REVOKE EXECUTE ON FUNCTION get_user_role(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_user_role(UUID) TO authenticated;

-- ==============================================
-- 3. FIX CONCURRENCY IN check_rate_limit
-- ==============================================

-- Add unique constraint for atomic operations
-- This ensures we can use INSERT ... ON CONFLICT properly
DO $$ 
BEGIN
    -- Check if constraint already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'rate_limit_log_unique_window'
    ) THEN
        -- Add unique constraint on endpoint, ip_address, and rounded window_start
        -- We round to the nearest minute to group requests in the same window
        ALTER TABLE rate_limit_log
        ADD CONSTRAINT rate_limit_log_unique_window 
        UNIQUE (endpoint, ip_address, window_start);
    END IF;
END $$;

-- Drop and recreate check_rate_limit with proper concurrency handling
DROP FUNCTION IF EXISTS check_rate_limit(TEXT, INET, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION check_rate_limit(
    p_endpoint TEXT,
    p_ip_address INET,
    p_max_requests INTEGER DEFAULT 100,
    p_window_seconds INTEGER DEFAULT 60
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_window_start TIMESTAMPTZ;
    v_current_count INTEGER;
    v_is_blocked BOOLEAN;
BEGIN
    -- Use pg_advisory_xact_lock for serialization per endpoint+ip
    -- Convert endpoint and IP to integer hash for lock
    PERFORM pg_advisory_xact_lock(
        hashtext(p_endpoint || '::' || host(p_ip_address))
    );
    
    -- Round window_start to the start of the current window
    -- This ensures all requests in the same window share the same timestamp
    v_window_start := date_trunc('minute', NOW() - ((EXTRACT(EPOCH FROM NOW())::INTEGER % p_window_seconds) || ' seconds')::INTERVAL);
    
    -- Try to insert a new rate limit record, or update existing one atomically
    INSERT INTO rate_limit_log (
        endpoint, 
        ip_address, 
        request_count, 
        window_start,
        blocked
    )
    VALUES (
        p_endpoint,
        p_ip_address,
        1,
        v_window_start,
        FALSE
    )
    ON CONFLICT (endpoint, ip_address, window_start) 
    DO UPDATE SET
        request_count = rate_limit_log.request_count + 1,
        blocked = CASE 
            WHEN rate_limit_log.request_count + 1 > p_max_requests THEN TRUE
            ELSE rate_limit_log.blocked
        END
    RETURNING request_count, blocked INTO v_current_count, v_is_blocked;
    
    -- If blocked or count exceeds limit, return FALSE
    IF v_is_blocked OR v_current_count > p_max_requests THEN
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, INET, INTEGER, INTEGER) TO service_role;

-- ==============================================
-- 4. FIX record_rate_limit_violation
-- ==============================================

-- Drop and recreate with proper unique constraint handling
DROP FUNCTION IF EXISTS record_rate_limit_violation(TEXT, INET);

CREATE OR REPLACE FUNCTION record_rate_limit_violation(
    p_endpoint TEXT,
    p_ip_address INET
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_window_start TIMESTAMPTZ;
BEGIN
    -- Round to current minute for window grouping
    v_window_start := date_trunc('minute', NOW());
    
    -- Insert or update violation record
    -- Use the same unique constraint as check_rate_limit
    INSERT INTO rate_limit_log (
        endpoint, 
        ip_address, 
        request_count, 
        blocked,
        window_start
    )
    VALUES (
        p_endpoint,
        p_ip_address,
        1,
        TRUE,
        v_window_start
    )
    ON CONFLICT (endpoint, ip_address, window_start)
    DO UPDATE SET
        request_count = rate_limit_log.request_count + 1,
        blocked = TRUE;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION record_rate_limit_violation(TEXT, INET) TO service_role;

-- ==============================================
-- 5. UPDATE get_rate_limit_status
-- ==============================================

-- Recreate for consistency and grant only to service_role
DROP FUNCTION IF EXISTS get_rate_limit_status(TEXT, INET, INTEGER);

CREATE OR REPLACE FUNCTION get_rate_limit_status(
    p_endpoint TEXT,
    p_ip_address INET,
    p_window_seconds INTEGER DEFAULT 60
)
RETURNS TABLE (
    is_blocked BOOLEAN,
    request_count INTEGER,
    window_start TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_window_start TIMESTAMPTZ;
BEGIN
    v_window_start := NOW() - (p_window_seconds || ' seconds')::INTERVAL;
    
    RETURN QUERY
    SELECT 
        rl.blocked,
        rl.request_count,
        rl.window_start
    FROM rate_limit_log rl
    WHERE rl.endpoint = p_endpoint
      AND rl.ip_address = p_ip_address
      AND rl.window_start >= v_window_start
    ORDER BY rl.window_start DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_rate_limit_status(TEXT, INET, INTEGER) TO service_role;

-- ==============================================
-- 6. CREATE INDEX FOR PERFORMANCE
-- ==============================================

-- Add index for window queries (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_rate_limit_log_window_lookup'
    ) THEN
        CREATE INDEX idx_rate_limit_log_window_lookup 
        ON rate_limit_log(endpoint, ip_address, window_start DESC);
    END IF;
END $$;

-- ==============================================
-- 7. CLEANUP OLD RATE LIMIT LOGS FUNCTION
-- ==============================================

-- Enhanced cleanup function with better performance
CREATE OR REPLACE FUNCTION cleanup_old_rate_limit_logs()
RETURNS INTEGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete logs older than 24 hours
    DELETE FROM rate_limit_log
    WHERE created_at < NOW() - INTERVAL '24 hours';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION cleanup_old_rate_limit_logs() TO service_role;

-- ==============================================
-- COMMENTS & DOCUMENTATION
-- ==============================================

COMMENT ON FUNCTION get_user_role(UUID) IS 
    'HARDENED: Returns user role. Owners/admins can look up any user. Others can only look up themselves. Anon users denied.';

COMMENT ON FUNCTION check_rate_limit(TEXT, INET, INTEGER, INTEGER) IS 
    'HARDENED: Service-role only. Uses pg_advisory_xact_lock and atomic INSERT...ON CONFLICT for concurrency safety. Must be called from Edge Functions.';

COMMENT ON FUNCTION record_rate_limit_violation(TEXT, INET) IS 
    'HARDENED: Service-role only. Properly dedupes using unique constraint. Must be called from Edge Functions.';

COMMENT ON FUNCTION get_rate_limit_status(TEXT, INET, INTEGER) IS 
    'HARDENED: Service-role only. Must be called from Edge Functions.';

COMMENT ON CONSTRAINT rate_limit_log_unique_window ON rate_limit_log IS
    'Ensures atomic operations for rate limiting. One record per endpoint+ip+window.';

-- ==============================================
-- SECURITY AUDIT LOG
-- ==============================================

-- Log this security hardening
DO $$
BEGIN
    RAISE NOTICE 'Security hardening applied:';
    RAISE NOTICE '1. Rate limit functions restricted to service_role only';
    RAISE NOTICE '2. get_user_role hardened - users can only look up own role';
    RAISE NOTICE '3. check_rate_limit fixed for concurrency with pg_advisory_xact_lock';
    RAISE NOTICE '4. Unique constraint added: rate_limit_log_unique_window';
    RAISE NOTICE '5. record_rate_limit_violation properly deduplicates';
    RAISE NOTICE '6. All SECURITY DEFINER functions have SET search_path = public';
END $$;
