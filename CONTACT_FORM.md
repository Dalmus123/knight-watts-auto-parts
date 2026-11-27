# Contact form, Messages inbox and email notification

How a visitor's message reaches the team:

1. **Website form** (`index.html` → `js/contact-form.js`) inserts a row into `public.contact_messages`
   with the public anon key. RLS allows INSERT only; the browser can never read the table.
   A hidden honeypot field and a client-side limit (30 s gap, 3 per hour) cut spam; the database also
   enforces length checks and 5 messages per sender per hour.
2. **Admin → Messages** (`admin/messages.js`) lists messages newest first with *Reply* (mailto) and
   *Mark handled*. Visible to owner, admin, ceo, cfo, coo, cos, chief_of_sales and sales_rep
   (`is_sales_staff() OR is_operations_staff()` in RLS).
3. **Email to info@** is sent by the `contact-notify` Edge Function via the Resend HTTPS API
   (`POST https://api.resend.com/emails`). A Database Webhook calls it on every insert. The form
   never calls it, so a message is always saved even if the function is not deployed or Resend is down.
   Company mailboxes (ceo@, cfo@, info@, sales@) stay on Zoho Mail; Resend is used only to send the
   notification. Do not change the root MX records.

## One-time setup after merge

```bash
# 1. Table + RLS + triggers, plus the insert webhook (pg_net + contact_messages_notify)
supabase db push        # or run the supabase/migrations/*contact_messages*.sql files in order

# 2. Edge Function
supabase functions deploy contact-notify --project-ref selvxrprxbkznxtfesxe

# 3. Secrets (never commit these)
supabase secrets set RESEND_API_KEY='re_xxxxxxxx' \
                     --project-ref selvxrprxbkznxtfesxe
# optional: CONTACT_NOTIFY_TO (default info@knightwatts.co.ke)
#           CONTACT_NOTIFY_FROM (default Knight Watts Website <noreply@knightwatts.co.ke>)
```

The sending domain `knightwatts.co.ke` must be verified in Resend (DNS records on the `send` /
`resend._domainkey` / `rsend` names only — do not touch Zoho's root MX, SPF or `zmail._domainkey`).

`ZOHO_SMTP_USER` and `ZOHO_SMTP_PASSWORD` are no longer used by this function and can be deleted
from the Edge Function secrets later.

The insert webhook `contact_messages_notify` is already live. Its timeout is 10000 ms
(see `20261127160000_contact_messages_notify_timeout.sql`).

## Verify

- Submit the form on the live site → row appears in Admin → Messages.
- Email arrives at info@ within a minute (check Edge Function logs if not).
- Tests: `psql -f supabase/tests/contact_messages_tests.sql` on a scratch database.

## Notes

- The `From` address must be on the verified Resend domain (`@knightwatts.co.ke`).
- If Resend is not configured or the send fails, messages still land in Admin → Messages.
