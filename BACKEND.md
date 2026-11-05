
# Knight Watts Auto Parts - Backend System Documentation

**Version 1.0** | Last Updated: November 4, 2026

This document provides complete setup instructions and documentation for the Supabase-powered backend system for Knight Watts Auto Parts.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start Setup](#quick-start-setup)
4. [Database Schema](#database-schema)
5. [Features](#features)
6. [Live Telemetry System](#live-telemetry-system)
7. [Delivery Coordination](#delivery-coordination)
8. [Performance & Scaling](#performance--scaling)
9. [User Roles & Permissions](#user-roles--permissions)
10. [Print Queue System](#print-queue-system)
11. [Analytics & Reports](#analytics--reports)
12. [API Endpoints](#api-endpoints)
13. [Troubleshooting](#troubleshooting)
14. [Maintenance](#maintenance)

---

## Overview

The Knight Watts Auto Parts backend is built on **Supabase** (PostgreSQL + Realtime + Storage + Edge Functions) and provides:

- **Product catalog** with image storage
- **Order management** with customer tracking
- **Custom part requests** including 3D printing
- **Print job queue** with auto-assignment and operator safety confirmations
- **Live telemetry** for inventory, locations, and print progress
- **Delivery coordination** with scheduling and real-time tracking
- **Role-based access control** (Owner, Admin, Print Operator, HQ Read-only)
- **Analytics & reporting** with graceful fallback if not configured
- **Printer integration** (pluggable OctoPrint adapter, disabled by default)

---

## Prerequisites

- A Supabase account (free tier works to start)
- Basic familiarity with PostgreSQL (optional but helpful)
- Node.js installed locally (for Supabase CLI - optional)

---

## Quick Start Setup

### Step 1: Create Your Supabase Project

1. Go to **https://supabase.com** and sign up/sign in
2. Click **"New Project"**
3. Choose:
   - **Project Name**: `knight-watts-auto-parts` (or your preference)
   - **Database Password**: Choose a strong password (save it securely)
   - **Region**: Select the closest to Kenya (e.g., "Frankfurt" or "Singapore")
   - **Pricing Plan**: Start with "Free" (upgrade when needed)
4. Click **"Create new project"** and wait ~2 minutes for provisioning

### Step 2: Get Your API Credentials

1. In your Supabase project dashboard, go to **Settings > API**
2. Copy the following values:
   - **Project URL** (looks like: `https://abcdefgh.supabase.co`)
   - **anon/public key** (long string starting with `eyJ...`)
3. **NEVER share or commit your `service_role` key** - we won't use it in the frontend

### Step 3: Configure the Application

1. Open the file: **`supabase/config.js`**
2. Replace the placeholder values:
   ```javascript
   const supabaseConfig = {
     url: 'https://YOUR-PROJECT-ID.supabase.co',  // Paste your Project URL
     anonKey: 'eyJhbGc...',  // Paste your anon/public key
     // ...
   };
   ```
3. **DO NOT commit this file with real keys to a public repository**
   - For production, use environment variables instead

### Step 4: Run Database Migrations

#### Option A: Using Supabase Dashboard (Recommended for non-developers)

1. Go to **SQL Editor** in your Supabase dashboard
2. Open the file: **`supabase/migrations/20240101000000_initial_schema.sql`**
3. Copy the **entire contents** of the file
4. Paste into the SQL Editor
5. Click **"Run"** (bottom right)
6. Wait for "Success" message
7. Repeat for **`supabase/migrations/20240102000000_telemetry_and_delivery.sql`**

#### Option B: Using Supabase CLI (For developers)

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref YOUR-PROJECT-ID

# Run migrations
supabase db push
```

### Step 5: Create Storage Buckets

1. Go to **Storage** in your Supabase dashboard
2. Create three buckets:

   **Bucket 1: `products`**
   - Click **"New bucket"**
   - Name: `products`
   - **Public bucket**: YES
   - Click **"Create bucket"**

   **Bucket 2: `custom_requests`**
   - Name: `custom_requests`
   - **Public bucket**: NO (private)
   - Click **"Create bucket"**

   **Bucket 3: `print_jobs`**
   - Name: `print_jobs`
   - **Public bucket**: NO (private)
   - Click **"Create bucket"**

### Step 6: Set Up Storage Policies

For each bucket, configure Row Level Security policies:

#### Products Bucket (Public read, staff write)

```sql
-- Allow public to view product images
CREATE POLICY "Public can view product images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'products');

-- Allow authenticated staff to upload
CREATE POLICY "Staff can upload product images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'products');
```

#### Custom Requests Bucket

```sql
-- Allow public to upload attachments (for new requests)
CREATE POLICY "Public can upload request attachments"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'custom_requests');

-- Staff can read everything
CREATE POLICY "Staff can read request attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'custom_requests');
```

#### Print Jobs Bucket

```sql
-- Only authenticated staff can access
CREATE POLICY "Staff can manage print job files"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'print_jobs')
WITH CHECK (bucket_id = 'print_jobs');
```

### Step 7: Enable Realtime

1. Go to **Database > Replication** in Supabase dashboard
2. Find these tables and toggle **"Realtime"** ON:
   - `telemetry_events`
   - `deliveries`
   - `print_jobs`

### Step 8: Create Your First Admin Account

1. Go to **Authentication > Users** in Supabase dashboard
2. Click **"Add user"** > **"Create new user"**
3. Enter:
   - **Email**: Your email (e.g., `admin@knightwatts.com`)
   - **Password**: A strong password
   - **Email Confirm**: Toggle OFF (or confirm via email)
4. Click **"Create user"**
5. Copy the **User UID** (looks like: `123e4567-e89b-12d3-a456-426614174000`)

6. Go to **SQL Editor** and run:
   ```sql
   INSERT INTO user_profiles (id, email, full_name, role, location)
   VALUES (
     '123e4567-e89b-12d3-a456-426614174000',  -- Paste your User UID
     'admin@knightwatts.com',  -- Your email
     'Admin User',  -- Your name
     'owner',  -- Role: owner, admin, print_operator, or hq_readonly
     'Embu'  -- Optional: location
   );
   ```

### Step 9: Test the Admin Dashboard

1. Open **`admin/index.html`** in a web browser
2. Log in with your email and password
3. You should see the admin dashboard!

---

## Database Schema

### Core Tables

1. **`user_profiles`** - User accounts with role-based access
2. **`products`** - Product catalog with images in Supabase Storage
3. **`orders`** - Customer orders from the storefront
4. **`custom_part_requests`** - Custom part and 3D printing requests
5. **`quotes`** - Price quotes for custom requests
6. **`printers`** - 3D printer fleet (optional, none owned yet)
7. **`print_jobs`** - Print jobs with auto-assignment and safety checks
8. **`telemetry_events`** - Real-time inventory and equipment telemetry
9. **`deliveries`** - Delivery scheduling and tracking
10. **`site_events`** - Analytics events from the public site
11. **`evaluations`** - Daily analytics summaries
12. **`reports`** - Generated business intelligence reports

### Supporting Tables

- **`analytics_queue`** - Batched analytics writes for high traffic
- **`rate_limit_log`** - Rate limiting enforcement for public endpoints

### Views

- **`daily_summary`** - Daily sales and order metrics
- **`product_performance`** - Product views and engagement
- **`print_queue_overview`** - Active print job statistics
- **`delivery_schedule`** - Calendar view of deliveries
- **`public_order_tracking`** - Customer-facing order status (no auth)

---

## Features

### 1. Product Management

- Upload products with images, SKUs, pricing in KES
- Stock tracking with low-stock thresholds
- Multi-location inventory (Embu, Garissa)
- 3D model support (optional)
- Category and search organization

**Permissions**: Owner, Admin

### 2. Order Processing

- Customer orders captured from the public site
- Auto-generated order numbers (e.g., `ORD-20241104-0001`)
- Status workflow: pending → processing → confirmed → completed
- Integration with print queue for 3D printed parts
- Delivery coordination

**Permissions**: Owner, Admin

### 3. Custom Part Requests

- Customer-submitted requests with photos and specifications
- 3D printing requests with material/color preferences
- File upload support (photos, CAD files)
- Quote generation and approval workflow
- Automatic print job creation on approval

**Permissions**: Owner, Admin

### 4. Print Queue & Safety

- Auto-assignment to idle printers with matching material
- **Bed clear confirmation** required before print starts (safety)
- Print progress tracking via telemetry
- Job priorities (1-10)
- Status tracking: pending_approval → approved → queued → printing → done/failed

**Permissions**:
- Approve jobs: Owner, Admin
- Operate queue: Owner, Admin, Print Operator

### 5. Printer Integration (Pluggable)

- **OctoPrint adapter** included (disabled by default)
- Stubs for Bambu Lab and Prusa Connect
- Connection stored securely per-printer
- Status polling, print start/stop/pause
- **Enable only when printers are configured**

**Setup**: Add printers in admin dashboard, configure connection details

---

## Live Telemetry System

### Overview

Real-time monitoring of inventory levels, locations, equipment status, and print job progress using Supabase Realtime.

### Event Types

1. **`stock_update`** - Inventory level changes
2. **`location_change`** - Part moved between warehouses
3. **`condition_update`** - Quality/condition inspection results
4. **`supplier_update`** - Supplier delivery notifications
5. **`print_progress`** - 3D print percentage and estimated remaining time
6. **`low_stock_alert`** - Auto-generated when stock ≤ threshold
7. **`restock_needed`** - Critical stock alert

### Telemetry Ingest Endpoint

**Endpoint**: `/supabase/functions/telemetry-ingest`

**Method**: POST

**Authentication**: Optional `X-Api-Key` header (set `TELEMETRY_API_KEY` env var)

**Rate Limit**: 100 requests per minute per IP

**Request Body** (single event):
```json
{
  "event_type": "stock_update",
  "product_id": "uuid-here",
  "event_data": {
    "old_quantity": 10,
    "new_quantity": 8,
    "reason": "sale"
  },
  "location": "Embu",
  "severity": "info"
}
```

**Batch Request** (multiple events):
```json
[
  { "event_type": "stock_update", ... },
  { "event_type": "print_progress", ... }
]
```

**Response**:
```json
{
  "success": true,
  "processed": 2,
  "failed": 0,
  "events": [ ... ]
}
```

### Severity Levels

- **`info`** - Normal operations
- **`warning`** - Attention needed (low stock)
- **`critical`** - Immediate action required (out of stock, print failure)

### Low-Stock Alerts

- **Auto-generated** when stock drops below `low_stock_threshold`
- Severity escalates based on remaining quantity:
  - Stock = 0: **critical**
  - Stock ≤ threshold/2: **warning**
  - Else: **info**

### Admin Dashboard Integration

- **Live feed** with auto-refresh via Supabase Realtime
- Filter by event type, severity, location
- Active alerts table for critical items
- Browser notifications for critical events (requires permission)

**Permissions**:
- View: Owner, Admin, HQ Read-only, Print Operator
- Create events: Owner, Admin, Print Operator (+ public API)

---

## Delivery Coordination

### Features

- Schedule deliveries with date and time slots
- Assign riders/couriers with vehicle details
- Real-time location tracking
- Customer-facing order tracking page
- Delivery calendar with area grouping
- Express delivery flagging
- Proof of delivery (photo upload)
- Reschedule and failure handling

### Delivery Status Workflow

1. **`scheduled`** - Delivery date/time set
2. **`assigned`** - Rider assigned
3. **`in_transit`** - Rider picked up package
4. **`out_for_delivery`** - Near customer location
5. **`delivered`** - Complete
6. **`failed`** - Delivery attempt failed
7. **`cancelled`** - Cancelled
8. **`rescheduled`** - New date set after failure

### Delivery Tracking API

Customers can track orders at: **`/track-order.html`**

- Enter order number (e.g., `ORD-20241104-0001`)
- View order status, delivery schedule, and ETA
- No authentication required (uses public view)

**Public View**: `public_order_tracking`
- Includes order and delivery status
- Real-time tracking updates
- Delivery area, scheduled time, current location

### Admin Delivery Calendar

- **View**: Grouped by date and area
- **Filters**: Area (Embu/Garissa), status, date
- **Actions**:
  - Update status (Start → In Transit → Out for Delivery → Delivered)
  - Update location in real-time
  - Mark delivered with recipient name
  - Mark failed with reason and reschedule

**Permissions**: Owner, Admin (full access), HQ Read-only (view reports)

---

## Performance & Scaling

### Design for Heavy Traffic

The system is designed to handle traffic spikes while keeping the public site fast and the Supabase free/pro tier sustainable.

### Static Site + CDN

✅ **Public site is static HTML/CSS/JS**
- Serve via GitHub Pages, Netlify, or Cloudflare Pages
- No server-side rendering = instant CDN caching
- Supabase calls are opt-in (graceful fallback if not configured)

### Caching Strategies

1. **Product Listings**
   - Cache product data in `localStorage` for 1 hour
   - Refresh in background
   - Serve stale data if Supabase is slow

2. **Analytics Batching**
   - Batch page view events (write every 10 events or 30 seconds)
   - Use `analytics_queue` table for batch processing
   - Process queue asynchronously with a cron job

3. **Materialized Views**
   - `product_inventory_summary` - refresh every 5 minutes
   - Run: `SELECT refresh_product_inventory();`

### Rate Limiting

**Implemented for**:
- Telemetry ingest: 100 req/min per IP
- Custom request forms: 10 req/min per IP (recommended)
- Order submission: 5 req/min per IP (recommended)

**Implementation**: `rate_limit_log` table + Edge Function checks

### Query Optimization

✅ **All tables indexed** on:
- Primary keys (UUID)
- Foreign keys
- Frequently filtered columns (status, date, location)
- Realtime subscription columns

✅ **Pagination recommended**:
```javascript
const { data, error } = await supabase
  .from('orders')
  .select('*')
  .order('created_at', { ascending: false })
  .range(0, 49);  // First 50 rows
```

### Scaling Limits & When to Upgrade

#### Supabase Free Tier Limits

| Resource | Free Tier | When to Upgrade |
|----------|-----------|-----------------|
| **Database Size** | 500 MB | When you hit 400 MB |
| **Bandwidth** | 5 GB/month | If you exceed 4 GB |
| **Storage** | 1 GB | When images reach 800 MB |
| **Realtime Connections** | 200 concurrent | If you have >150 concurrent users |
| **Edge Function Invocations** | 500,000/month | If telemetry >400k/month |
| **Auth Users** | 50,000 | You'll be fine for a long time |

#### Signs You Need to Upgrade

1. **"Database size limit reached"** error
   - **Action**: Upgrade to Pro ($25/month for 8 GB)
   - **Prevention**: Archive old orders/events quarterly

2. **Slow queries** (>2 seconds)
   - **Action**: Check query performance in Dashboard > Database > Query Performance
   - **Fix**: Add indexes, use materialized views, paginate results

3. **Realtime disconnections**
   - **Action**: Reduce concurrent subscriptions or upgrade to Pro
   - **Fix**: Only subscribe to relevant channels (not all telemetry)

4. **Rate limit 429 errors**
   - **Action**: Increase `RATE_LIMIT_MAX_REQUESTS` in Edge Functions
   - **Or**: Upgrade to Pro for higher burst limits

#### Cost-Effective Scaling Checklist

Before upgrading, try these optimizations:

- [ ] Archive orders/events older than 6 months to a separate table
- [ ] Compress product images (use WebP format)
- [ ] Batch analytics writes (use `analytics_queue`)
- [ ] Cache product listings in `localStorage`
- [ ] Use pagination for all large queries
- [ ] Clean up old `rate_limit_log` entries (automated in migration)
- [ ] Refresh `product_inventory_summary` only when needed

---

## User Roles & Permissions

### Role: `owner`

**Full system access** - Can do everything

- Manage all products, orders, requests, quotes
- Manage users and assign roles
- Configure printers and print queue
- View and edit prices, revenue, and financial data
- Access all reports and analytics

**Recommended for**: Business owner

### Role: `admin` (Company Staff)

**Operational management** - Cannot manage users or see sensitive financial settings

- Manage products, orders, custom requests
- Approve and manage print jobs
- Manage deliveries and scheduling
- View analytics and reports
- **Cannot**: Change user roles, see/edit base prices (can quote)

**Recommended for**: Store managers, operations staff

### Role: `print_operator`

**Print queue only** - Focused on 3D printing operations

- View print queue
- Confirm bed clear and start prints
- Update print job status (printing, done, failed)
- View printer status
- View telemetry for print jobs
- **Cannot**: See orders, products, financials, or deliveries

**Recommended for**: 3D printing technicians

### Role: `hq_readonly`

**Read-only reporting** - For remote monitoring and analysis

- View all reports and analytics
- View evaluations and site traffic
- View telemetry events
- View delivery summaries
- **Cannot**: Make any changes or see individual customer data

**Recommended for**: Remote assistants, analysts, advisors

### Row Level Security (RLS)

All tables use **Postgres Row Level Security** to enforce permissions at the database level. Even if someone gets your `anon` key, they can only do what their role allows.

**Key policies**:
- Public can create orders and custom requests (anon)
- Public can read active products (anon)
- Staff roles require authentication
- Owner-only actions (user management) enforced in SQL

---

## Print Queue System

### Workflow

1. **Order placed** with 3D printed part
2. **Admin approves** custom request
3. **Print job auto-created** with required material
4. **Auto-matcher assigns** to idle printer with matching material
5. **Job status** → `queued`
6. **Operator views** print queue
7. **Operator confirms** bed is clear and safe
8. **Job starts** → status `printing`
9. **Operator marks** done or failed
10. **Printer returns** to `idle` status

### Auto-Assignment Logic

```sql
-- Find first available printer with matching material
SELECT id FROM printers
WHERE status = 'idle'
  AND is_active = TRUE
  AND loaded_material = :required_material
ORDER BY updated_at ASC
LIMIT 1;
```

### Safety: Bed Clear Confirmation

**Critical**: Print jobs do NOT start automatically even after assignment.

- Operator **must manually confirm** the bed is clear
- Prevents starting a print on a bed with leftover material
- Only after confirmation does status change to `printing`

### Print Job Status Triggers

The database automatically updates printer status when jobs change:

- Job starts printing → Printer status = `printing`
- Job completes/fails → Printer status = `idle` (if no other queued jobs)

---

## Analytics & Reports

### Site Events

Track user behavior for business intelligence:

- **`page_view`** - Any page visited
- **`product_view`** - Product detail viewed
- **`add_to_cart`** - Item added to cart
- **`checkout_start`** - Checkout initiated
- **`order_placed`** - Order completed
- **`custom_request_submitted`** - Custom request form sent

### Analytics Batching (for high traffic)

1. Queue events in `analytics_queue` table
2. Process in batches with `process_analytics_batch(batch_id)`
3. Schedule with a cron job or Edge Function timer

### Evaluations

Daily summary metrics auto-calculated:

- Total page views
- Unique visitors
- Orders and revenue
- Top products
- Custom requests
- Location breakdown
- Conversion rate

### Reports

Generate and store reports:

- **`daily_summary`** - Orders, revenue, requests
- **`monthly_sales`** - Sales by location and category
- **`inventory`** - Stock levels and value
- **Custom reports** - Add your own

---

## API Endpoints

### Supabase Edge Functions

#### 1. Telemetry Ingest

**URL**: `https://YOUR-PROJECT-ID.supabase.co/functions/v1/telemetry-ingest`

**Method**: POST

**Headers**:
- `Content-Type: application/json`
- `X-Api-Key: YOUR_TELEMETRY_API_KEY` (optional but recommended)

**Body**: See [Live Telemetry System](#live-telemetry-system)

**Use Case**: IoT devices, warehouse systems, print status updates

**Security Note**: This Edge Function uses service role credentials internally to call rate limiting functions. Rate limit functions (`check_rate_limit`, etc.) are **service_role only** and cannot be called directly from the browser or public clients.

#### 2. Printer Adapter (Disabled by Default)

**URL**: `https://YOUR-PROJECT-ID.supabase.co/functions/v1/printer-adapter`

**Method**: POST

**Query Params**:
- `action=status|start_print|cancel_print|pause_print|resume_print`
- `printer_id=UUID`

**Use Case**: Control OctoPrint/Bambu/Prusa printers from admin dashboard

**⚠️ Enable only after configuring printers**

---

## Troubleshooting

### "Network error" when logging in

**Cause**: Supabase config not set up

**Fix**:
1. Check `supabase/config.js` has your real URL and anon key
2. Hard refresh the page (Ctrl+Shift+R)

### "Permission denied" errors

**Cause**: User profile not created or wrong role

**Fix**:
1. Go to Supabase Dashboard → SQL Editor
2. Check if user exists:
   ```sql
   SELECT * FROM user_profiles WHERE email = 'your@email.com';
   ```
3. If missing, create it (see Step 8)
4. If exists, update role:
   ```sql
   UPDATE user_profiles SET role = 'owner' WHERE email = 'your@email.com';
   ```

### Print jobs not auto-assigning

**Cause**: No printers configured or material mismatch

**Fix**:
1. Check printer exists and is active
2. Verify `loaded_material` matches job's `required_material`
3. Ensure printer `status = 'idle'`

### Telemetry events not appearing live

**Cause**: Realtime not enabled

**Fix**:
1. Go to **Database → Replication**
2. Enable Realtime for `telemetry_events` table
3. Refresh admin dashboard

### "Bucket not found" for images

**Cause**: Storage buckets not created

**Fix**: See [Step 5: Create Storage Buckets](#step-5-create-storage-buckets)

---

## Maintenance

### Regular Tasks

#### Daily
- Check low-stock alerts in telemetry dashboard
- Review pending orders and custom requests
- Monitor delivery schedule

#### Weekly
- Generate and review weekly reports
- Archive delivered orders older than 30 days
- Check printer maintenance schedules

#### Monthly
- Review database size (Dashboard → Database → Usage)
- Archive old telemetry events (keep last 90 days)
- Run:
  ```sql
  DELETE FROM telemetry_events WHERE event_timestamp < NOW() - INTERVAL '90 days';
  DELETE FROM site_events WHERE created_at < NOW() - INTERVAL '180 days';
  DELETE FROM rate_limit_log WHERE created_at < NOW() - INTERVAL '7 days';
  ```
- Refresh materialized views:
  ```sql
  SELECT refresh_product_inventory();
  ```

#### Quarterly
- Review and adjust rate limits if needed
- Archive old orders to backup storage
- Evaluate Supabase plan usage and upgrade if needed

### Backup Strategy

**Supabase Pro/Team Plans** include automatic daily backups.

**Free Tier**: Manual backups recommended
1. Go to **Database → Backups** (Pro only) OR
2. Use `pg_dump` locally:
   ```bash
   pg_dump -h db.YOUR-PROJECT-ID.supabase.co -U postgres -d postgres > backup.sql
   ```

### Security Best Practices

1. **Never commit** real API keys to Git
2. Use **environment variables** in production
3. Rotate **API keys** every 6 months (Dashboard → Settings → API)
4. Enable **2FA** on your Supabase account
5. Review **audit logs** monthly (Pro plan)
6. Keep **row-level security** enabled on all tables

### Security Hardening (Migration 4)

**Applied**: November 5, 2026

The system includes comprehensive security hardening to prevent unauthorized access and ensure safe concurrent operations:

#### 1. **Function Access Restrictions**
- ✅ **Rate limit functions** (`check_rate_limit`, `record_rate_limit_violation`, `get_rate_limit_status`) are now **service_role only**
- ✅ These functions can ONLY be called from Edge Functions using service role credentials
- ✅ Public/anon users cannot call these functions directly
- ✅ Prevents abuse of rate limiting system

#### 2. **Role Lookup Protection**
- ✅ `get_user_role()` function hardened with access controls
- ✅ **Owners and admins** can look up any user's role (for admin dashboard)
- ✅ **Regular users** can only look up their own role
- ✅ **Anonymous users** receive NULL (safe for RLS policies)
- ✅ EXECUTE kept for anon (required by public RLS policies for storefront)
- ✅ Prevents role enumeration while maintaining storefront functionality

#### 3. **Concurrency Safety**
- ✅ `check_rate_limit()` uses **pg_advisory_xact_lock** for serialization
- ✅ **Atomic INSERT...ON CONFLICT** prevents race conditions
- ✅ **Unique constraint** on `(endpoint, ip_address, window_start)` ensures one record per window
- ✅ **Dynamic window alignment** works with any `p_window_seconds` value (not hardcoded)
- ✅ Safe under high concurrent load (100+ req/sec per endpoint)

#### 4. **Data Integrity**
- ✅ `record_rate_limit_violation()` properly deduplicates using unique constraint
- ✅ No phantom duplicate records under concurrent inserts
- ✅ Efficient storage and accurate violation counts

#### 5. **SQL Injection Prevention**
- ✅ All SECURITY DEFINER functions have `SET search_path = public`
- ✅ Prevents search_path attacks on privileged functions
- ✅ Functions execute in controlled namespace

**Security Audit Trail**: All changes logged in migration 20240104000000_harden_functions.sql

**Impact**: No breaking changes to public API. All user-facing features work identically, but with stronger security guarantees.

---

## Support & Further Help

### Official Resources

- **Supabase Docs**: https://supabase.com/docs
- **Supabase Discord**: https://discord.supabase.com
- **Postgres Docs**: https://www.postgresql.org/docs/

### Contact

For questions about this backend system:
- Create an issue in the GitHub repository
- Email: tech@knightwatts.com (replace with your actual contact)

---

## Changelog

### v1.0 - November 4, 2026

**Initial Release**
- Database schema with RLS policies
- User roles and authentication
- Product management with Supabase Storage
- Order processing and custom requests
- Print queue with auto-assignment and safety checks
- Live telemetry system with Realtime
- Delivery coordination and tracking
- Customer-facing order tracking page
- Analytics and reporting
- Rate limiting for public endpoints
- Performance optimizations for traffic spikes
- OctoPrint printer adapter (pluggable, disabled by default)

---

**End of Documentation** | Knight Watts Auto Parts Backend v1.0
