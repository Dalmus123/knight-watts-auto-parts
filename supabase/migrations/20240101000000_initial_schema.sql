-- Knight Watts Auto Parts - Initial Database Schema
-- This migration creates all tables, roles, and Row Level Security policies

-- ==============================================
-- EXTENSIONS
-- ==============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================
-- CUSTOM TYPES & ENUMS
-- ==============================================

CREATE TYPE user_role AS ENUM ('owner', 'admin', 'print_operator', 'hq_readonly');

CREATE TYPE order_status AS ENUM ('pending', 'processing', 'awaiting_quote', 'quoted', 'confirmed', 'printing', 'ready', 'completed', 'cancelled');

CREATE TYPE print_job_status AS ENUM ('pending_approval', 'approved', 'queued', 'printing', 'done', 'failed');

CREATE TYPE print_material AS ENUM ('PLA', 'PETG', 'ABS', 'TPU', 'Nylon', 'other');

CREATE TYPE printer_status AS ENUM ('idle', 'printing', 'paused', 'offline', 'maintenance');

CREATE TYPE connection_type AS ENUM ('OctoPrint', 'Bambu', 'Prusa Connect', 'manual');

CREATE TYPE request_type AS ENUM ('custom_part', '3d_print', 'quote');

-- ==============================================
-- USER PROFILES & ROLES
-- ==============================================

CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role user_role NOT NULL DEFAULT 'hq_readonly',
  phone TEXT,
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- PRODUCTS
-- ==============================================

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  sku TEXT UNIQUE,
  price_kes DECIMAL(10,2) NOT NULL CHECK (price_kes >= 0),
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  low_stock_threshold INTEGER DEFAULT 5,
  location TEXT NOT NULL,
  
  -- Product images stored in Supabase Storage
  -- Path format: products/{product_id}/{filename}
  primary_image_path TEXT,
  additional_images_paths TEXT[], -- Array of storage paths
  
  -- 3D model support
  has_3d_model BOOLEAN DEFAULT FALSE,
  model_path TEXT, -- Path to 3D model file in storage
  
  -- Metadata
  manufacturer TEXT,
  part_number TEXT,
  compatible_models TEXT[], -- Array of compatible car models
  weight_kg DECIMAL(8,3),
  dimensions_cm TEXT, -- e.g., "10x5x3"
  
  is_active BOOLEAN DEFAULT TRUE,
  featured BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES user_profiles(id)
);

CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_location ON products(location);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_products_sku ON products(sku);

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- ORDERS
-- ==============================================

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_location TEXT NOT NULL,
  
  status order_status NOT NULL DEFAULT 'pending',
  
  -- Order items (stored as JSONB for flexibility)
  -- Format: [{"product_id": "uuid", "product_name": "...", "quantity": 1, "price_kes": 1000}]
  items JSONB NOT NULL,
  
  subtotal_kes DECIMAL(10,2) NOT NULL,
  shipping_kes DECIMAL(10,2) DEFAULT 0,
  total_kes DECIMAL(10,2) NOT NULL,
  
  shipping_address TEXT NOT NULL,
  delivery_notes TEXT,
  
  -- Payment
  payment_method TEXT,
  payment_status TEXT DEFAULT 'pending',
  payment_reference TEXT,
  
  -- Fulfillment
  assigned_to UUID REFERENCES user_profiles(id),
  fulfilled_at TIMESTAMPTZ,
  
  notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_customer_email ON orders(customer_email);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_order_number ON orders(order_number);

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-generate order numbers
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.order_number = 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(nextval('order_number_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE order_number_seq START 1;

CREATE TRIGGER set_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW
  WHEN (NEW.order_number IS NULL)
  EXECUTE FUNCTION generate_order_number();

-- ==============================================
-- CUSTOM PART REQUESTS (including 3D printing)
-- ==============================================

CREATE TABLE custom_part_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_number TEXT UNIQUE NOT NULL,
  request_type request_type NOT NULL,
  
  -- Customer info
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_location TEXT,
  
  -- Request details
  part_name TEXT NOT NULL,
  description TEXT NOT NULL,
  vehicle_make TEXT,
  vehicle_model TEXT,
  vehicle_year INTEGER,
  
  -- 3D printing specific
  is_3d_print BOOLEAN DEFAULT FALSE,
  print_material print_material,
  preferred_color TEXT,
  quantity INTEGER DEFAULT 1,
  dimensions TEXT, -- e.g., "Length: 10cm, Width: 5cm, Height: 3cm"
  
  -- Uploaded files (photos, CAD files, etc.) in Supabase Storage
  -- Path format: custom_requests/{request_id}/{filename}
  attachment_paths TEXT[],
  
  -- Status and fulfillment
  status TEXT DEFAULT 'pending', -- pending, reviewing, quoted, approved, in_progress, completed, rejected
  priority TEXT DEFAULT 'normal', -- low, normal, high, urgent
  
  -- Quote
  quoted_price_kes DECIMAL(10,2),
  quote_notes TEXT,
  quoted_at TIMESTAMPTZ,
  quoted_by UUID REFERENCES user_profiles(id),
  
  -- Assignment
  assigned_to UUID REFERENCES user_profiles(id),
  reviewed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  internal_notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_custom_part_requests_status ON custom_part_requests(status);
CREATE INDEX idx_custom_part_requests_type ON custom_part_requests(request_type);
CREATE INDEX idx_custom_part_requests_created_at ON custom_part_requests(created_at DESC);

CREATE TRIGGER update_custom_part_requests_updated_at
  BEFORE UPDATE ON custom_part_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-generate request numbers
CREATE OR REPLACE FUNCTION generate_request_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.request_number = 'REQ-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(nextval('request_number_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE request_number_seq START 1;

CREATE TRIGGER set_request_number
  BEFORE INSERT ON custom_part_requests
  FOR EACH ROW
  WHEN (NEW.request_number IS NULL)
  EXECUTE FUNCTION generate_request_number();

-- ==============================================
-- QUOTES
-- ==============================================

CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_number TEXT UNIQUE NOT NULL,
  
  -- Related to order or custom request
  order_id UUID REFERENCES orders(id),
  custom_request_id UUID REFERENCES custom_part_requests(id),
  
  -- Customer info (denormalized for easy access)
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  
  -- Quote details
  items JSONB NOT NULL, -- Array of line items
  subtotal_kes DECIMAL(10,2) NOT NULL,
  tax_kes DECIMAL(10,2) DEFAULT 0,
  total_kes DECIMAL(10,2) NOT NULL,
  
  status TEXT DEFAULT 'draft', -- draft, sent, accepted, rejected, expired
  valid_until DATE,
  
  notes TEXT,
  terms TEXT,
  
  created_by UUID REFERENCES user_profiles(id),
  approved_by UUID REFERENCES user_profiles(id),
  
  sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_quotes_customer_email ON quotes(customer_email);
CREATE INDEX idx_quotes_created_at ON quotes(created_at DESC);

CREATE TRIGGER update_quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-generate quote numbers
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.quote_number = 'QTE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(nextval('quote_number_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE quote_number_seq START 1;

CREATE TRIGGER set_quote_number
  BEFORE INSERT ON quotes
  FOR EACH ROW
  WHEN (NEW.quote_number IS NULL)
  EXECUTE FUNCTION generate_quote_number();

-- ==============================================
-- PRINTERS
-- ==============================================

CREATE TABLE printers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  model TEXT,
  connection_type connection_type,
  
  -- Connection details (stored as JSONB for flexibility)
  -- OctoPrint: {"url": "http://...", "api_key": "..."}
  -- Bambu: {"ip": "...", "access_code": "..."}
  connection_config JSONB,
  
  loaded_material print_material,
  loaded_color TEXT,
  
  status printer_status DEFAULT 'offline',
  
  location TEXT,
  build_volume TEXT, -- e.g., "220x220x250mm"
  
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Maintenance
  last_maintenance_date DATE,
  next_maintenance_date DATE,
  maintenance_notes TEXT,
  
  notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_printers_status ON printers(status);
CREATE INDEX idx_printers_material ON printers(loaded_material);
CREATE INDEX idx_printers_active ON printers(is_active);

CREATE TRIGGER update_printers_updated_at
  BEFORE UPDATE ON printers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- PRINT JOBS
-- ==============================================

CREATE TABLE print_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_number TEXT UNIQUE NOT NULL,
  
  -- Linked to order or custom request
  order_id UUID REFERENCES orders(id),
  custom_request_id UUID REFERENCES custom_part_requests(id),
  
  part_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  
  -- Material requirements
  required_material print_material NOT NULL,
  required_color TEXT,
  
  -- File paths in Supabase Storage
  -- Path format: print_jobs/{job_id}/{filename}
  model_file_path TEXT NOT NULL,
  
  -- Print settings (stored as JSONB)
  print_settings JSONB, -- layer height, infill, supports, etc.
  
  -- Estimated metrics
  estimated_print_time_minutes INTEGER,
  estimated_material_grams DECIMAL(8,2),
  estimated_cost_kes DECIMAL(10,2),
  
  status print_job_status NOT NULL DEFAULT 'pending_approval',
  priority INTEGER DEFAULT 5, -- 1-10, higher = more urgent
  
  -- Assignment
  assigned_printer_id UUID REFERENCES printers(id),
  assigned_at TIMESTAMPTZ,
  
  -- Operator confirmation (bed clear, etc.)
  bed_clear_confirmed BOOLEAN DEFAULT FALSE,
  bed_clear_confirmed_by UUID REFERENCES user_profiles(id),
  bed_clear_confirmed_at TIMESTAMPTZ,
  
  -- Progress tracking
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  
  -- Actual metrics
  actual_print_time_minutes INTEGER,
  actual_material_grams DECIMAL(8,2),
  
  notes TEXT,
  
  approved_by UUID REFERENCES user_profiles(id),
  approved_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_print_jobs_status ON print_jobs(status);
CREATE INDEX idx_print_jobs_priority ON print_jobs(priority DESC);
CREATE INDEX idx_print_jobs_assigned_printer ON print_jobs(assigned_printer_id);
CREATE INDEX idx_print_jobs_created_at ON print_jobs(created_at DESC);

CREATE TRIGGER update_print_jobs_updated_at
  BEFORE UPDATE ON print_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-generate job numbers
CREATE OR REPLACE FUNCTION generate_job_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.job_number = 'JOB-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(nextval('job_number_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE job_number_seq START 1;

CREATE TRIGGER set_job_number
  BEFORE INSERT ON print_jobs
  FOR EACH ROW
  WHEN (NEW.job_number IS NULL)
  EXECUTE FUNCTION generate_job_number();

-- ==============================================
-- SITE ANALYTICS & EVENTS
-- ==============================================

CREATE TABLE site_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL, -- page_view, product_view, add_to_cart, checkout_start, etc.
  
  -- Event data (stored as JSONB for flexibility)
  event_data JSONB,
  
  -- Session tracking
  session_id TEXT,
  user_agent TEXT,
  ip_address INET,
  
  -- Location
  page_url TEXT,
  referrer TEXT,
  
  -- Product-specific (if applicable)
  product_id UUID REFERENCES products(id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_site_events_type ON site_events(event_type);
CREATE INDEX idx_site_events_created_at ON site_events(created_at DESC);
CREATE INDEX idx_site_events_product_id ON site_events(product_id);
CREATE INDEX idx_site_events_session_id ON site_events(session_id);

-- ==============================================
-- EVALUATIONS (Analytics summaries)
-- ==============================================

CREATE TABLE evaluations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  evaluation_date DATE NOT NULL,
  
  -- Metrics
  total_page_views INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  total_revenue_kes DECIMAL(12,2) DEFAULT 0,
  
  -- Top products (stored as JSONB)
  -- Format: [{"product_id": "uuid", "name": "...", "views": 100}]
  top_viewed_products JSONB,
  top_ordered_products JSONB,
  
  -- Custom requests
  total_custom_requests INTEGER DEFAULT 0,
  total_3d_print_requests INTEGER DEFAULT 0,
  
  -- Location breakdown
  location_stats JSONB, -- {"Embu": {"orders": 10, "revenue": 50000}, "Garissa": {...}}
  
  -- Conversion metrics
  cart_abandonment_rate DECIMAL(5,2),
  conversion_rate DECIMAL(5,2),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(evaluation_date)
);

CREATE INDEX idx_evaluations_date ON evaluations(evaluation_date DESC);

CREATE TRIGGER update_evaluations_updated_at
  BEFORE UPDATE ON evaluations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- REPORTS
-- ==============================================

CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_type TEXT NOT NULL, -- daily_summary, monthly_sales, inventory, etc.
  report_date DATE NOT NULL,
  
  -- Report data (stored as JSONB)
  data JSONB NOT NULL,
  
  generated_by UUID REFERENCES user_profiles(id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reports_type ON reports(report_type);
CREATE INDEX idx_reports_date ON reports(report_date DESC);
CREATE INDEX idx_reports_created_at ON reports(created_at DESC);

-- ==============================================
-- VIEWS FOR REPORTING
-- ==============================================

-- Daily summary view for hq_readonly users
CREATE OR REPLACE VIEW daily_summary AS
SELECT
  DATE(created_at) as report_date,
  COUNT(*) as total_orders,
  SUM(total_kes) as total_revenue_kes,
  COUNT(DISTINCT customer_email) as unique_customers,
  AVG(total_kes) as avg_order_value_kes
FROM orders
WHERE status NOT IN ('cancelled')
GROUP BY DATE(created_at)
ORDER BY report_date DESC;

-- Product performance view
CREATE OR REPLACE VIEW product_performance AS
SELECT
  p.id,
  p.name,
  p.category,
  p.stock_quantity,
  p.price_kes,
  COUNT(DISTINCT se.id) as total_views,
  COUNT(DISTINCT se.session_id) as unique_visitors
FROM products p
LEFT JOIN site_events se ON se.product_id = p.id AND se.event_type = 'product_view'
WHERE p.is_active = TRUE
GROUP BY p.id, p.name, p.category, p.stock_quantity, p.price_kes
ORDER BY total_views DESC;

-- Print queue overview
CREATE OR REPLACE VIEW print_queue_overview AS
SELECT
  status,
  COUNT(*) as job_count,
  SUM(quantity) as total_items,
  SUM(estimated_print_time_minutes) as total_estimated_minutes
FROM print_jobs
WHERE status IN ('approved', 'queued', 'printing')
GROUP BY status;

-- ==============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_part_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE printers ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Helper function to get user role
CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS user_role AS $$
  SELECT role FROM user_profiles WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ==============================================
-- USER PROFILES POLICIES
-- ==============================================

-- Owner can see and manage all users
CREATE POLICY "owner_all_user_profiles" ON user_profiles
  FOR ALL
  USING (get_user_role(auth.uid()) = 'owner')
  WITH CHECK (get_user_role(auth.uid()) = 'owner');

-- Users can see their own profile
CREATE POLICY "users_own_profile" ON user_profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile (but not role)
CREATE POLICY "users_update_own_profile" ON user_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM user_profiles WHERE id = auth.uid()));

-- ==============================================
-- PRODUCTS POLICIES
-- ==============================================

-- Public read access (for the storefront)
CREATE POLICY "public_read_products" ON products
  FOR SELECT
  USING (is_active = TRUE);

-- Owner and admin can manage products
CREATE POLICY "owner_admin_manage_products" ON products
  FOR ALL
  USING (get_user_role(auth.uid()) IN ('owner', 'admin'))
  WITH CHECK (get_user_role(auth.uid()) IN ('owner', 'admin'));

-- ==============================================
-- ORDERS POLICIES
-- ==============================================

-- Public can create orders
CREATE POLICY "public_create_orders" ON orders
  FOR INSERT
  WITH CHECK (TRUE);

-- Owner and admin can see all orders
CREATE POLICY "owner_admin_read_orders" ON orders
  FOR SELECT
  USING (get_user_role(auth.uid()) IN ('owner', 'admin'));

-- Owner and admin can update orders
CREATE POLICY "owner_admin_update_orders" ON orders
  FOR UPDATE
  USING (get_user_role(auth.uid()) IN ('owner', 'admin'))
  WITH CHECK (get_user_role(auth.uid()) IN ('owner', 'admin'));

-- ==============================================
-- CUSTOM PART REQUESTS POLICIES
-- ==============================================

-- Public can create requests
CREATE POLICY "public_create_requests" ON custom_part_requests
  FOR INSERT
  WITH CHECK (TRUE);

-- Owner and admin can see all requests
CREATE POLICY "owner_admin_read_requests" ON custom_part_requests
  FOR SELECT
  USING (get_user_role(auth.uid()) IN ('owner', 'admin'));

-- Owner and admin can update requests
CREATE POLICY "owner_admin_update_requests" ON custom_part_requests
  FOR UPDATE
  USING (get_user_role(auth.uid()) IN ('owner', 'admin'))
  WITH CHECK (get_user_role(auth.uid()) IN ('owner', 'admin'));

-- ==============================================
-- QUOTES POLICIES
-- ==============================================

-- Owner and admin can manage quotes
CREATE POLICY "owner_admin_manage_quotes" ON quotes
  FOR ALL
  USING (get_user_role(auth.uid()) IN ('owner', 'admin'))
  WITH CHECK (get_user_role(auth.uid()) IN ('owner', 'admin'));

-- ==============================================
-- PRINTERS POLICIES
-- ==============================================

-- Owner, admin, and print_operator can read printers
CREATE POLICY "staff_read_printers" ON printers
  FOR SELECT
  USING (get_user_role(auth.uid()) IN ('owner', 'admin', 'print_operator'));

-- Only owner can create/update/delete printers
CREATE POLICY "owner_manage_printers" ON printers
  FOR ALL
  USING (get_user_role(auth.uid()) = 'owner')
  WITH CHECK (get_user_role(auth.uid()) = 'owner');

-- ==============================================
-- PRINT JOBS POLICIES
-- ==============================================

-- Owner and admin can see all print jobs
CREATE POLICY "owner_admin_read_print_jobs" ON print_jobs
  FOR SELECT
  USING (get_user_role(auth.uid()) IN ('owner', 'admin', 'print_operator'));

-- Owner and admin can create and approve jobs
CREATE POLICY "owner_admin_manage_print_jobs" ON print_jobs
  FOR INSERT
  WITH CHECK (get_user_role(auth.uid()) IN ('owner', 'admin'));

-- Owner, admin, and print_operator can update jobs
CREATE POLICY "staff_update_print_jobs" ON print_jobs
  FOR UPDATE
  USING (get_user_role(auth.uid()) IN ('owner', 'admin', 'print_operator'))
  WITH CHECK (get_user_role(auth.uid()) IN ('owner', 'admin', 'print_operator'));

-- ==============================================
-- SITE EVENTS POLICIES
-- ==============================================

-- Public can create events (for analytics tracking)
CREATE POLICY "public_create_events" ON site_events
  FOR INSERT
  WITH CHECK (TRUE);

-- Owner, admin, and hq_readonly can read events
CREATE POLICY "staff_read_events" ON site_events
  FOR SELECT
  USING (get_user_role(auth.uid()) IN ('owner', 'admin', 'hq_readonly'));

-- ==============================================
-- EVALUATIONS POLICIES
-- ==============================================

-- Owner, admin, and hq_readonly can read evaluations
CREATE POLICY "staff_read_evaluations" ON evaluations
  FOR SELECT
  USING (get_user_role(auth.uid()) IN ('owner', 'admin', 'hq_readonly'));

-- Only owner and admin can create/update evaluations
CREATE POLICY "owner_admin_manage_evaluations" ON evaluations
  FOR ALL
  USING (get_user_role(auth.uid()) IN ('owner', 'admin'))
  WITH CHECK (get_user_role(auth.uid()) IN ('owner', 'admin'));

-- ==============================================
-- REPORTS POLICIES
-- ==============================================

-- All staff can read reports
CREATE POLICY "staff_read_reports" ON reports
  FOR SELECT
  USING (get_user_role(auth.uid()) IN ('owner', 'admin', 'hq_readonly'));

-- Owner and admin can create reports
CREATE POLICY "owner_admin_create_reports" ON reports
  FOR INSERT
  WITH CHECK (get_user_role(auth.uid()) IN ('owner', 'admin'));

-- ==============================================
-- STORAGE BUCKETS
-- ==============================================

-- Note: Storage buckets and policies must be created through Supabase Dashboard or CLI
-- This SQL file documents the required buckets:
-- 
-- Bucket: products
--   - Public read access
--   - Owner/admin write access
--   - Path: products/{product_id}/{filename}
-- 
-- Bucket: custom_requests
--   - Private (no public access)
--   - Public upload for new requests
--   - Owner/admin read/write access
--   - Path: custom_requests/{request_id}/{filename}
-- 
-- Bucket: print_jobs
--   - Private (no public access)
--   - Owner/admin/print_operator read/write access
--   - Path: print_jobs/{job_id}/{filename}

-- ==============================================
-- FUNCTIONS FOR PRINT QUEUE MANAGEMENT
-- ==============================================

-- Function to auto-assign print jobs to available printers
CREATE OR REPLACE FUNCTION assign_print_job_to_printer()
RETURNS TRIGGER AS $$
DECLARE
  available_printer_id UUID;
BEGIN
  -- Only auto-assign if job is approved and not yet assigned
  IF NEW.status = 'approved' AND NEW.assigned_printer_id IS NULL THEN
    -- Find an idle printer with matching material
    SELECT id INTO available_printer_id
    FROM printers
    WHERE status = 'idle'
      AND is_active = TRUE
      AND loaded_material = NEW.required_material
    ORDER BY updated_at ASC -- First available
    LIMIT 1;
    
    IF available_printer_id IS NOT NULL THEN
      -- Assign the job to the printer
      NEW.assigned_printer_id = available_printer_id;
      NEW.assigned_at = NOW();
      NEW.status = 'queued';
      
      -- Update printer status to show it has a queued job
      -- (Actual printing starts after bed clear confirmation)
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_assign_print_job
  BEFORE UPDATE ON print_jobs
  FOR EACH ROW
  EXECUTE FUNCTION assign_print_job_to_printer();

-- Function to update printer status when job starts/completes
CREATE OR REPLACE FUNCTION update_printer_on_job_change()
RETURNS TRIGGER AS $$
BEGIN
  -- When job starts printing
  IF NEW.status = 'printing' AND OLD.status != 'printing' THEN
    UPDATE printers
    SET status = 'printing', updated_at = NOW()
    WHERE id = NEW.assigned_printer_id;
  END IF;
  
  -- When job completes or fails
  IF NEW.status IN ('done', 'failed') AND OLD.status NOT IN ('done', 'failed') THEN
    -- Set printer back to idle if no other jobs are queued for it
    UPDATE printers
    SET status = 'idle', updated_at = NOW()
    WHERE id = NEW.assigned_printer_id
      AND NOT EXISTS (
        SELECT 1 FROM print_jobs
        WHERE assigned_printer_id = NEW.assigned_printer_id
          AND status IN ('queued', 'printing')
          AND id != NEW.id
      );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_printer_status
  AFTER UPDATE ON print_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_printer_on_job_change();

-- ==============================================
-- INITIAL DATA
-- ==============================================

-- Note: The first owner account must be created manually after running migrations
-- See BACKEND.md for instructions

COMMENT ON TABLE user_profiles IS 'User accounts with role-based access control';
COMMENT ON TABLE products IS 'Product catalog with Supabase Storage integration for images';
COMMENT ON TABLE orders IS 'Customer orders from the storefront';
COMMENT ON TABLE custom_part_requests IS 'Custom part and 3D printing requests from customers';
COMMENT ON TABLE quotes IS 'Price quotes for custom requests';
COMMENT ON TABLE printers IS '3D printers in the fleet (optional, none owned yet)';
COMMENT ON TABLE print_jobs IS 'Print jobs generated from orders, with auto-assignment and operator confirmation';
COMMENT ON TABLE site_events IS 'Analytics events from the public site';
COMMENT ON TABLE evaluations IS 'Daily analytics summaries for the evaluations dashboard';
COMMENT ON TABLE reports IS 'Generated reports for business intelligence';
