-- RPC used by the contact-notify Edge Function to read the Resend API key
-- from Supabase Vault when the RESEND_API_KEY env secret is not set.
--
-- The secret itself is stored out of band with vault.create_secret
-- (name: resend_api_key) and is NEVER committed to git.

CREATE OR REPLACE FUNCTION public.get_resend_api_key()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = vault
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'resend_api_key'
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_resend_api_key() IS
  'Returns the Resend API key from Vault for contact-notify. EXECUTE granted only to service_role.';

REVOKE ALL ON FUNCTION public.get_resend_api_key() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_resend_api_key() TO service_role;
