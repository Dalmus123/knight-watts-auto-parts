-- Knight Watts Auto Parts - RLS Policies for Analytics & Rate Limiting
-- Migration 3: Enable Row Level Security on analytics_queue and rate_limit_log

-- ==============================================
-- ANALYTICS QUEUE RLS
-- ==============================================

-- Enable RLS
ALTER TABLE analytics_queue ENABLE ROW LEVEL SECURITY;

-- Public (anon) can insert analytics batches
CREATE POLICY "public_insert_analytics_queue" ON analytics_queue
    FOR INSERT
    TO anon
    WITH CHECK (TRUE);

-- Authenticated users can insert analytics batches
CREATE POLICY "authenticated_insert_analytics_queue" ON analytics_queue
    FOR INSERT
    TO authenticated
    WITH CHECK (TRUE);

-- Only staff can read analytics queue
CREATE POLICY "staff_read_analytics_queue" ON analytics_queue
    FOR SELECT
    TO authenticated
    USING (get_user_role(auth.uid()) IN ('owner', 'admin'));

-- Only staff can update/process batches
CREATE POLICY "staff_update_analytics_queue" ON analytics_queue
    FOR UPDATE
    TO authenticated
    USING (get_user_role(auth.uid()) IN ('owner', 'admin'))
    WITH CHECK (get_user_role(auth.uid()) IN ('owner', 'admin'));

-- Only staff can delete old batches
CREATE POLICY "staff_delete_analytics_queue" ON analytics_queue
    FOR DELETE
    TO authenticated
    USING (get_user_role(auth.uid()) IN ('owner', 'admin'));

-- ==============================================
-- RATE LIMIT LOG RLS
-- ==============================================

-- Enable RLS
ALTER TABLE rate_limit_log ENABLE ROW LEVEL SECURITY;

-- Allow rate limit checks via SECURITY DEFINER function
-- This bypasses RLS so the rate limiter can work for public endpoints

-- Public and authenticated can check/update rate limits via function
-- Direct table access is restricted

-- Only staff can read rate limit logs (for monitoring)
CREATE POLICY "staff_read_rate_limit_log" ON rate_limit_log
    FOR SELECT
    TO authenticated
    USING (get_user_role(auth.uid()) IN ('owner', 'admin'));

-- Only staff can delete old rate limit logs
CREATE POLICY "staff_delete_rate_limit_log" ON rate_limit_log
    FOR DELETE
    TO authenticated
    USING (get_user_role(auth.uid()) IN ('owner', 'admin'));

-- Create SECURITY DEFINER functions for rate limiting
-- These functions bypass RLS and can be called by public users

-- ==============================================
-- RATE LIMITING SECURITY DEFINER FUNCTIONS
-- ==============================================

-- Check rate limit (returns TRUE if allowed, FALSE if blocked)
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
    v_log_record RECORD;
BEGIN
    v_window_start := NOW() - (p_window_seconds || ' seconds')::INTERVAL;
    
    -- Get most recent log entry for this endpoint/IP in the window
    SELECT * INTO v_log_record
    FROM rate_limit_log
    WHERE endpoint = p_endpoint
      AND ip_address = p_ip_address
      AND window_start >= v_window_start
    ORDER BY window_start DESC
    LIMIT 1;
    
    -- If no recent entry, create one and allow
    IF NOT FOUND THEN
        INSERT INTO rate_limit_log (endpoint, ip_address, request_count, window_start)
        VALUES (p_endpoint, p_ip_address, 1, NOW());
        RETURN TRUE;
    END IF;
    
    -- Check if we're still in the same window
    IF v_log_record.window_start >= v_window_start THEN
        -- Same window - check if limit exceeded
        IF v_log_record.request_count >= p_max_requests THEN
            -- Block and mark as blocked
            UPDATE rate_limit_log
            SET blocked = TRUE
            WHERE id = v_log_record.id;
            RETURN FALSE;
        ELSE
            -- Increment counter
            UPDATE rate_limit_log
            SET request_count = request_count + 1
            WHERE id = v_log_record.id;
            RETURN TRUE;
        END IF;
    ELSE
        -- New window - create new entry and allow
        INSERT INTO rate_limit_log (endpoint, ip_address, request_count, window_start)
        VALUES (p_endpoint, p_ip_address, 1, NOW());
        RETURN TRUE;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Record rate limit violation
CREATE OR REPLACE FUNCTION record_rate_limit_violation(
    p_endpoint TEXT,
    p_ip_address INET
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO rate_limit_log (endpoint, ip_address, request_count, blocked, window_start)
    VALUES (p_endpoint, p_ip_address, 1, TRUE, NOW())
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Get rate limit status for an IP
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

-- ==============================================
-- CLEANUP FUNCTION PERMISSIONS
-- ==============================================

-- Grant execute on rate limit functions to anon and authenticated
GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, INET, INTEGER, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION record_rate_limit_violation(TEXT, INET) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_rate_limit_status(TEXT, INET, INTEGER) TO anon, authenticated;

-- ==============================================
-- COMMENTS
-- ==============================================

COMMENT ON POLICY "public_insert_analytics_queue" ON analytics_queue IS 
    'Allow public users to queue analytics events for batch processing';

COMMENT ON POLICY "staff_read_analytics_queue" ON analytics_queue IS 
    'Only staff can view the analytics queue';

COMMENT ON POLICY "staff_read_rate_limit_log" ON rate_limit_log IS 
    'Only staff can view rate limit logs for monitoring';

COMMENT ON FUNCTION check_rate_limit(TEXT, INET, INTEGER, INTEGER) IS 
    'SECURITY DEFINER function to check and update rate limits, callable by public users';

COMMENT ON FUNCTION record_rate_limit_violation(TEXT, INET) IS 
    'SECURITY DEFINER function to record rate limit violations';

COMMENT ON FUNCTION get_rate_limit_status(TEXT, INET, INTEGER) IS 
    'SECURITY DEFINER function to check current rate limit status for an IP/endpoint';

-- ==============================================
-- UPDATE EDGE FUNCTIONS TO USE NEW FUNCTIONS
-- ==============================================

-- Note: Edge Functions should now call check_rate_limit() instead of directly querying rate_limit_log
-- Example usage:
-- 
-- const { data, error } = await supabase.rpc('check_rate_limit', {
--   p_endpoint: 'telemetry-ingest',
--   p_ip_address: clientIp,
--   p_max_requests: 100,
--   p_window_seconds: 60
-- });
-- 
-- if (data === false) {
--   return new Response('Rate limit exceeded', { status: 429 });
-- }
