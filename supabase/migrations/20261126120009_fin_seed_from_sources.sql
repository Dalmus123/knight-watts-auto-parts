-- Finance — optional back-fill from operational tables (DO NOT RUN IN MIGRATION)
-- Defines logic only; no PERFORM/SELECT invocation here.

CREATE OR REPLACE FUNCTION public.fin_seed_from_sources()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- INTENTIONALLY EMPTY IN MIGRATIONS
  -- Operators may run manually in a controlled session after CFO sign-off.
  -- Would iterate orders/print_jobs/bank CSV imports and call fin_post_entry
  -- with idempotent source_document keys. Historical back-fill is DISABLED.
  RAISE NOTICE 'fin_seed_from_sources is defined but not executed by migrations';
END;
$$;

REVOKE ALL ON FUNCTION public.fin_seed_from_sources() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_seed_from_sources() TO authenticated;

COMMENT ON FUNCTION public.fin_seed_from_sources() IS
  'Back-fill helper — NOT executed during migrate. Run manually only when approved; uses idempotent fin_post_entry sources.';