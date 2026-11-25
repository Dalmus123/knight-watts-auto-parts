# Passkeys & Role-Based Dashboards

Admin portal auth (Face ID / Touch ID passkeys) and C-suite / sales role desks for Knight Watts Auto Parts.

**Migrations in this PR are NOT applied to the live project yet.** Apply on merge (project `selvxrprxbkznxtfesxe`).

## Migrations to apply on merge

1. `supabase/migrations/20261125190000_csuite_roles_enums.sql` — enum values `ceo`, `cfo`, `coo`, `cos`
2. `supabase/migrations/20261125190001_csuite_roles_rls.sql` — helpers, RLS expansions, finance/ops RPCs, email seed helper

Then (optional, when Auth users exist):

```sql
SELECT * FROM seed_csuite_roles_by_email();
```

| Email | Role | Notes |
|-------|------|--------|
| escrivanyagah5@gmail.com | `ceo` | Full company desk |
| dkinyua971@gmail.com | `cfo` | Finance |
| eliudmugo07@gmail.com | `coo` | Operations |
| ldayanti719@gmail.com | `cos` | Chief of Staff (sales leadership) |
| sales001@knightwatts.co.ke | `sales_rep` | Own telemetry only |

The helper **does not create Auth users**. Missing emails are reported as `skipped_no_auth_user`.

## Passkey setup (dashboard + client)

Supabase native passkeys (WebAuthn), experimental API — **not** MFA TOTP.

### 1. Enable in Supabase Dashboard

1. Open project **selvxrprxbkznxtfesxe**
2. **Authentication → Passkeys**
3. Turn on **Enable Passkey authentication**
4. Relying Party settings for GitHub Pages:

| Field | Value |
|-------|--------|
| Relying Party Display Name | `Knight Watts Admin` |
| Relying Party ID | `dalmus123.github.io` (no scheme/path) |
| Relying Party Origins | `https://dalmus123.github.io` (add `http://localhost:8080` for local testing) |

HTTPS is required (GitHub Pages already is). Changing RP ID later invalidates existing passkeys.

### 2. Client (already in this PR)

- CDN: `@supabase/supabase-js@2.119.2` (≥ 2.105 required)
- `supabase/config.js` sets `auth.experimental.passkey: true`
- Uses **anon key only** — never the service role key

### 3. User flow

1. Sign in with **password** (or Sign In User modal)
2. Open **Security** in the sidebar → **Register passkey** (Face ID / Touch ID)
3. Next visit: use **Sign in with passkey**, or pick the passkey from the browser autofill dropdown (Conditional UI)

Password remains a full fallback.

### 4. Autofill / Mac vs iPhone

Login forms use a real `<form>`, `type="email"`, `name="username"`, `autocomplete="username webauthn"`, password `autocomplete="current-password"`, and a proper submit button so Safari/Chrome can offer Keychain / passkeys.

Conditional UI: `signInWithPasskey({ options: { mediation: 'conditional' } })`.

**Mac note:** Safari uses **iCloud Keychain**. Chrome on macOS needs the **iCloud Passwords** extension or Chrome’s own passkey store — otherwise you may see passkeys on iPhone but not in Chrome on Mac.

## Role / permission matrix

Jurisdiction is enforced by **RLS** (and SECURITY DEFINER helpers). Sidebar hiding is UX only.

| Area | ceo / owner / admin | cfo | coo | cos | chief_of_sales | sales_rep |
|------|---------------------|-----|-----|-----|----------------|-----------|
| Company dashboard | ✓ | tailored | tailored | tailored | tailored | tailored |
| Products / catalogue / 3D | manage | read / valuation | manage | — | read | read (sell) |
| Orders | ✓ | revenue read | fulfil | sales read | team | own attributed |
| Custom requests / print / deliveries | ✓ | — | ✓ | — | — | — |
| Telemetry | ✓ | — | ✓ | ✓ | — | — |
| Analytics | ✓ | ✓ | — | ✓ | — | — |
| Reports / exports | ✓ | ✓ | — | — | — | — |
| User Management | ceo/owner | — | — | — | — | — |
| My Sales | ✓ | ✓ | — | ✓ | ✓ | own |
| Sales Team / commissions payable | ✓ | ✓ | — | ✓ | ✓ | — |
| Sales Tasks | ✓ | — | ✓ | ✓ | ✓ | assigned |
| Commission Rules | ✓ | ✓ | — | ✓ | — | — |
| Sales Reps roster | ✓ | — | — | ✓ | — | — |
| Security (passkeys) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Home routes after sign-in: CEO → company dashboard; CFO → finance desk; COO → ops desk; COS / Head of Sales → Sales Team; sales_rep → My Sales.

## Service worker

Cache bumped to `knight-watts-v1.4.0-passkeys-role-dashboards` (includes `admin/roles.js`, `admin/passkeys.js`).
