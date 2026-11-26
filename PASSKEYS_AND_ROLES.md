# Passkeys & Role-Based Dashboards

Admin portal auth (Face ID / Touch ID passkeys) and C-suite / sales role desks for Knight Watts Auto Parts.

**Canonical public site:** `https://knightwatts.co.ke` (apex).  
**Legacy GitHub Pages URL (still valid during DNS switchover):** `https://dalmus123.github.io/knight-watts-auto-parts/`

## Custom domain & passkeys (Nov 2026)

| Field | Value |
|-------|--------|
| Relying Party Display Name | `Knight Watts Admin` |
| Relying Party ID | `knightwatts.co.ke` (no scheme/path; **not** `www.`) |
| Relying Party Origins | `https://knightwatts.co.ke` and `https://www.knightwatts.co.ke` |

### Important: re-register passkeys

WebAuthn credentials are bound to a single **RP ID**. Passkeys created while the RP ID was `dalmus123.github.io` **will not work** on `knightwatts.co.ke`. After the domain cutover:

1. Set Supabase Passkeys RP ID to `knightwatts.co.ke` (and add the origins above).
2. Sign in with **password** on `https://knightwatts.co.ke/admin/`.
3. Open **Security → Register passkey** again on each device.

During DNS switchover you may keep the old github.io origin in Auth redirect allowlists for password/OAuth, but passkeys only work for the RP ID that matches the hostname the browser is on.

## Migrations (historical — already applied on live)

1. `supabase/migrations/20261125190000_csuite_roles_enums.sql`
2. `supabase/migrations/20261125190001_csuite_roles_rls.sql`
3. Staff mgmt / `must_change_password`: `20261125210000_staff_mgmt_rls.sql`

Seed helper (optional): `SELECT * FROM seed_csuite_roles_by_email();` — does not create Auth users; does not change roles that were already set.

| Email | Role | Notes |
|-------|------|--------|
| escrivanyagah5@gmail.com | `ceo` | Full company desk |
| dkinyua971@gmail.com | `cfo` | Finance (user-set — do not overwrite) |
| eliudmugo07@gmail.com | `coo` | Operations |
| ldayanti719@gmail.com | `cos` | Chief of Staff (sales leadership) |
| sales001@knightwatts.co.ke | `sales_rep` | Own telemetry only |

## Passkey setup (dashboard + client)

Supabase native passkeys (WebAuthn), experimental API — **not** MFA TOTP.

### 1. Enable in Supabase Dashboard

1. Open project **selvxrprxbkznxtfesxe**
2. **Authentication → Passkeys**
3. Turn on **Enable Passkey authentication**
4. Relying Party settings for the custom domain (see table above)

HTTPS is required (GitHub Pages custom domain with HTTPS enforced).

### 2. Client

- CDN: `@supabase/supabase-js@2.119.2` (≥ 2.105 required)
- `supabase/config.js` sets `auth.experimental.passkey: true`
- Uses **anon key only** — never the service role key
- `js/site-base.js` → `KWSite.passkeyRpId()` reports the RP ID for the current host (docs / UI hints)

### 3. User flow

1. Sign in with **password** (or Switch account modal)
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
| User Management | ceo/owner/admin + cos (scoped) | — | — | sales roles | — | — |
| My Sales | ✓ | ✓ | — | ✓ | ✓ | own |
| Sales Team / commissions payable | ✓ | ✓ | — | ✓ | ✓ | — |
| Sales Tasks | ✓ | — | ✓ | ✓ | ✓ | assigned |
| Commission Rules | ✓ | ✓ | — | ✓ | — | — |
| Sales Reps roster | ✓ | — | — | ✓ | — | — |
| Security (passkeys) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Home routes after sign-in: CEO → company dashboard; CFO → finance desk; COO → ops desk; COS / Head of Sales → Sales Team; sales_rep → My Sales.

## Service worker

Cache bumped to `knight-watts-v1.4.3-custom-domain`. Base path is derived from the SW script directory so the same worker works on the custom domain root and the `/knight-watts-auto-parts/` project URL. Admin HTML/JS/CSS use **network-first**; on activate the SW posts `FORCE_RELOAD`.
