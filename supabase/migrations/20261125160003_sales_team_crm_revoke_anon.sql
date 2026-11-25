-- Harden sales CRM SECURITY DEFINER RPCs: revoke anon/PUBLIC where not needed.
-- create_order remains executable by anon (storefront). lookup stays for create_order internals.

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_owner_or_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_chief_of_sales() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_sales_leadership() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_sales_staff() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_commission_rate(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.compute_order_commissions(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_order_to_sales_rep(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_commission_status(UUID[], commission_status) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ensure_sales_rep_profile(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sales_dashboard_stats(TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sales_tasks_rep_status_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lookup_sales_rep_by_code(TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner_or_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_chief_of_sales() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_sales_leadership() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_sales_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_commission_rate(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_order_commissions(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_order_to_sales_rep(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_commission_status(UUID[], commission_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_sales_rep_profile(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_dashboard_stats(TEXT, UUID) TO authenticated;
-- lookup used inside create_order (SECURITY DEFINER) — service_role + authenticated only
GRANT EXECUTE ON FUNCTION public.lookup_sales_rep_by_code(TEXT) TO authenticated, service_role;
