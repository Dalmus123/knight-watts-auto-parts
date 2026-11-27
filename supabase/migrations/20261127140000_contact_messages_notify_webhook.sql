-- Database webhook: after each insert on public.contact_messages, POST the
-- row to the contact-notify Edge Function (same mechanism the Supabase
-- Dashboard uses: supabase_functions.http_request over pg_net).
--
-- Authorization uses the project's public anon JWT (already in
-- supabase/config.js). contact-notify has verify_jwt = true and accepts this
-- JWT at the gateway; the function then talks to the database with the
-- platform-injected SUPABASE_SERVICE_ROLE_KEY from its environment. A service
-- role key is NOT stored in this trigger.
--
-- Safe to re-run: extension, schema, helper function and trigger are guarded.

-- 1. Async HTTP (documented Database Webhooks backend)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Dashboard-equivalent helper, if Database Webhooks have not been
--    enabled on this project yet. Matches supabase/docker/volumes/db/webhooks.sql
--    closely enough for http_request() to work; does not create extra login roles.
CREATE SCHEMA IF NOT EXISTS supabase_functions;

GRANT USAGE ON SCHEMA supabase_functions TO postgres, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS supabase_functions.migrations (
  version text PRIMARY KEY,
  inserted_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supabase_functions.hooks (
  id bigserial PRIMARY KEY,
  hook_table_id integer NOT NULL,
  hook_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  request_id bigint
);

CREATE INDEX IF NOT EXISTS supabase_functions_hooks_request_id_idx
  ON supabase_functions.hooks USING btree (request_id);
CREATE INDEX IF NOT EXISTS supabase_functions_hooks_h_table_id_h_name_idx
  ON supabase_functions.hooks USING btree (hook_table_id, hook_name);

COMMENT ON TABLE supabase_functions.hooks IS
  'Supabase Functions Hooks: Audit trail for triggered hooks.';

CREATE OR REPLACE FUNCTION supabase_functions.http_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = supabase_functions
AS $function$
DECLARE
  request_id bigint;
  payload jsonb;
  url text := TG_ARGV[0]::text;
  method text := TG_ARGV[1]::text;
  headers jsonb DEFAULT '{}'::jsonb;
  params jsonb DEFAULT '{}'::jsonb;
  timeout_ms integer DEFAULT 1000;
BEGIN
  IF url IS NULL OR url = 'null' THEN
    RAISE EXCEPTION 'url argument is missing';
  END IF;

  IF method IS NULL OR method = 'null' THEN
    RAISE EXCEPTION 'method argument is missing';
  END IF;

  IF TG_ARGV[2] IS NULL OR TG_ARGV[2] = 'null' THEN
    headers = '{"Content-Type": "application/json"}'::jsonb;
  ELSE
    headers = TG_ARGV[2]::jsonb;
  END IF;

  IF TG_ARGV[3] IS NULL OR TG_ARGV[3] = 'null' THEN
    params = '{}'::jsonb;
  ELSE
    params = TG_ARGV[3]::jsonb;
  END IF;

  IF TG_ARGV[4] IS NULL OR TG_ARGV[4] = 'null' THEN
    timeout_ms = 1000;
  ELSE
    timeout_ms = TG_ARGV[4]::integer;
  END IF;

  CASE
    WHEN method = 'GET' THEN
      SELECT http_get INTO request_id FROM net.http_get(
        url,
        params,
        headers,
        timeout_ms
      );
    WHEN method = 'POST' THEN
      payload = jsonb_build_object(
        'old_record', OLD,
        'record', NEW,
        'type', TG_OP,
        'table', TG_TABLE_NAME,
        'schema', TG_TABLE_SCHEMA
      );

      SELECT http_post INTO request_id FROM net.http_post(
        url,
        payload,
        params,
        headers,
        timeout_ms
      );
    ELSE
      RAISE EXCEPTION 'method argument % is invalid', method;
  END CASE;

  INSERT INTO supabase_functions.hooks
    (hook_table_id, hook_name, request_id)
  VALUES
    (TG_RELID, TG_NAME, request_id);

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION supabase_functions.http_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION supabase_functions.http_request() TO postgres, anon, authenticated, service_role;

-- pg_net is created in its own `net` schema even when registered under extensions
GRANT USAGE ON SCHEMA net TO postgres, anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA net TO postgres;

-- 3. The webhook trigger itself
DROP TRIGGER IF EXISTS contact_messages_notify ON public.contact_messages;
CREATE TRIGGER contact_messages_notify
  AFTER INSERT ON public.contact_messages
  FOR EACH ROW
  EXECUTE FUNCTION supabase_functions.http_request(
    'https://selvxrprxbkznxtfesxe.supabase.co/functions/v1/contact-notify',
    'POST',
    '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlbHZ4cnByeGJrem54dGZlc3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4MDExNTYsImV4cCI6MjEwOTM3NzE1Nn0.c5uB-kHqw0UbWlYF6OlcvZumm7q2KaOF4iHKUPoxiT4"}',
    '{}',
    '5000'
  );
