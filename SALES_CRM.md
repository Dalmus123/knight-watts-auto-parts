# Sales Team CRM

Commission-paid sales team for Knight Watts Auto Parts (Chief of Sales + sales reps).

## Migrations to run

Apply in order (already applied on the live Supabase project `selvxrprxbkznxtfesxe`):

1. `supabase/migrations/20261125160000_sales_team_crm_enums.sql`
2. `supabase/migrations/20261125160001_sales_team_crm.sql`
3. `supabase/migrations/20261125160002_sales_team_crm_example_seed.sql` — **EXAMPLE SEED only** (default/category/product commission % rows labelled `EXAMPLE SEED`)
4. `supabase/migrations/20261125160003_sales_team_crm_revoke_anon.sql` — revoke anon on privileged RPCs

Enums are committed in a separate migration because Postgres requires new `user_role` values to be committed before use.

## Roles

| Role | Access |
|------|--------|
| `owner` / `admin` | Everything + manage reps, roles, commission rules |
| `chief_of_sales` | All reps’ performance, approve/pay commissions, assign tasks & orders |
| `sales_rep` | Own dashboard, own commissions, update own task status |

## Setup a salesperson

1. Invite the user in Supabase Auth.
2. Ensure a `user_profiles` row exists for that `auth.users` id.
3. In Admin → **Sales Reps**, select the user, set role (`sales_rep` or `chief_of_sales`), optional referral code, save.
   - Or SQL: `SELECT ensure_sales_rep_profile('<uuid>', 'Display Name', 'CODE01');` after setting `user_profiles.role`.

Referral links: `https://yoursite/?ref=CODE01` (also works on checkout).

## Attribution

- Referral link (`?ref=`) → stored in localStorage via `js/referral.js`
- Code entered at checkout
- Manual assignment by Chief of Sales (Sales Team → Manual order attribution)

`create_order(..., p_referral_code)` attributes the order and writes pending `commission_entries` per line (product % > category % > default %).

## Admin UI

- **My Sales** — period stats, category/product breakdown, referral link, leaderboard (Realtime)
- **Sales Team** — all-rep view, approve/mark paid commissions, assign orders
- **Sales Tasks** — task board
- **Commission Rules** — owner/admin
- **Sales Reps** — owner/admin

## Service worker

Cache bumped to `knight-watts-v1.3.1-sales-filaments` so PWAs pick up sales assets, referral helper, and Filaments pages together.
