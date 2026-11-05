-- Knight Watts Auto Parts - Revoke Cleanup Function Access
-- Migration 5: Restrict cleanup_old_rate_limit_logs() to service_role only

-- ==============================================
-- SECURITY FIX: cleanup_old_rate_limit_logs()
-- ==============================================

-- This function was created in migration 4 with SECURITY DEFINER
-- but didn't restrict access from PUBLIC/anon/authenticated
-- This is a security gap - anon users could call it and delete rate limit logs

-- Revoke all existing grants (including default PUBLIC grant)
REVOKE EXECUTE ON FUNCTION cleanup_old_rate_limit_logs() FROM PUBLIC, anon, authenticated;

-- Grant execute only to service_role
-- This function should only be called by scheduled jobs or admin Edge Functions
GRANT EXECUTE ON FUNCTION cleanup_old_rate_limit_logs() TO service_role;

-- Update function comment
COMMENT ON FUNCTION cleanup_old_rate_limit_logs() IS 
    'SECURITY DEFINER function to delete rate limit logs older than 24 hours. Service-role only. Should be called by scheduled jobs (e.g., pg_cron or Edge Function cron).';

-- ==============================================
-- USAGE NOTES
-- ==============================================

-- To schedule automatic cleanup, create a Supabase Edge Function or use pg_cron:
--
-- Option 1: Edge Function with Deno.cron (recommended for Supabase)
-- Create: supabase/functions/cleanup-cron/index.ts
-- Call: supabase.rpc('cleanup_old_rate_limit_logs') using service_role key
-- Schedule: Run daily at 2 AM
--
-- Option 2: pg_cron extension (if available in your plan)
-- SELECT cron.schedule('cleanup-rate-limits', '0 2 * * *', 
--   $$SELECT cleanup_old_rate_limit_logs()$$);

-- ==============================================
-- SECURITY AUDIT LOG
-- ==============================================

DO $$
BEGIN
    RAISE NOTICE 'Security fix applied:';
    RAISE NOTICE 'cleanup_old_rate_limit_logs() access restricted to service_role only';
    RAISE NOTICE 'Anon/public users can no longer delete rate limit logs';
END $$;
