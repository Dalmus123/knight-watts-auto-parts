-- Bump contact_messages_notify webhook timeout from 5s to 10s.
-- The trigger body is otherwise unchanged (same URL, same public anon JWT).
-- Safe to re-run. Requires supabase_functions.http_request from
-- 20261127140000_contact_messages_notify_webhook.sql.

DROP TRIGGER IF EXISTS contact_messages_notify ON public.contact_messages;
CREATE TRIGGER contact_messages_notify
  AFTER INSERT ON public.contact_messages
  FOR EACH ROW
  EXECUTE FUNCTION supabase_functions.http_request(
    'https://selvxrprxbkznxtfesxe.supabase.co/functions/v1/contact-notify',
    'POST',
    '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlbHZ4cnByeGJrem54dGZlc3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4MDExNTYsImV4cCI6MjEwOTM3NzE1Nn0.c5uB-kHqw0UbWlYF6OlcvZumm7q2KaOF4iHKUPoxiT4"}',
    '{}',
    '10000'
  );
