# Contact form, Messages inbox and email notification

How a visitor's message reaches the team:

1. **Website form** (`index.html` → `js/contact-form.js`) inserts a row into `public.contact_messages`
   with the public anon key. RLS allows INSERT only; the browser can never read the table.
   A hidden honeypot field and a client-side limit (30 s gap, 3 per hour) cut spam; the database also
   enforces length checks and 5 messages per sender per hour.
2. **Admin → Messages** (`admin/messages.js`) lists messages newest first with *Reply* (mailto) and
   *Mark handled*. Visible to owner, admin, ceo, cfo, coo, cos, chief_of_sales and sales_rep
   (`is_sales_staff() OR is_operations_staff()` in RLS).
3. **Email to info@** is sent by the `contact-notify` Edge Function (Zoho SMTP). A Database Webhook
   calls it on every insert. The form never calls it, so a message is always saved even if the function
   is not deployed or Zoho is down.

## One-time setup after merge

```bash
# 1. Table + RLS + triggers
supabase db push        # or run supabase/migrations/20261127120000_contact_messages.sql in the SQL editor

# 2. Edge Function
supabase functions deploy contact-notify --project-ref selvxrprxbkznxtfesxe

# 3. Secrets (never commit these)
supabase secrets set ZOHO_SMTP_USER='<mailbox>@knightwatts.co.ke' \
                     ZOHO_SMTP_PASSWORD='<mailbox password or app password>' \
                     --project-ref selvxrprxbkznxtfesxe
# optional: ZOHO_SMTP_HOST (default smtp.zoho.com), CONTACT_NOTIFY_TO (default info@knightwatts.co.ke)
```

4. **Database Webhook** (Supabase Dashboard → Database → Webhooks → Create):
   name `contact_messages_notify`, table `public.contact_messages`, event **Insert**,
   type **Supabase Edge Functions**, function `contact-notify`, method POST.

## Verify

- Submit the form on the live site → row appears in Admin → Messages.
- Email arrives at info@ within a minute (check Edge Function logs if not).
- Tests: `psql -f supabase/tests/contact_messages_tests.sql` on a scratch database.

## Notes

- `ZOHO_SMTP_USER` must be a real mailbox (or alias) on the Zoho account; Zoho rejects other From addresses.
- Zoho's free plan does not include IMAP/POP; SMTP sending on the free plan should be tested once.
  If Zoho refuses SMTP, messages still land in Admin → Messages; switch the function to another
  mail API without touching the form.
