-- Knight Watts Auto Parts - Telemetry and Delivery Features
-- Migration 2: Add live telemetry tracking and delivery coordination

-- ==============================================
-- TELEMETRY EVENTS
-- ==============================================

CREATE TYPE telemetry_event_type AS ENUM (
    'stock_update',
    'location_change',
    'condition_update',
    'supplier_update',
    'print_progress',
    'low_stock_alert',
    'restock_needed'
);

CREATE TABLE telemetry_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type telemetry_event_type NOT NULL,
    
    -- Related entities
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    print_job_id UUID REFERENCES print_jobs(id) ON DELETE CASCADE,
    
    -- Event data (flexible JSONB for different event types)
    -- Examples:
    -- Stock update: {"old_quantity": 10, "new_quantity": 8, "reason": "sale"}
    -- Location change: {"from": "Embu", "to": "Garissa", "reason": "transfer"}
    -- Condition: {"condition": "good", "inspection_notes": "..."}
    -- Print progress: {"percentage": 45, "estimated_remaining_minutes": 120}
    event_data JSONB NOT NULL,
    
    -- Metadata
    source TEXT DEFAULT 'manual', -- manual, api, iot_sensor, system
    severity TEXT DEFAULT 'info', -- info, warning, critical
    
    -- Location tracking
    location TEXT,
    warehouse_section TEXT,
    
    -- Alerting
    alert_sent BOOLEAN DEFAULT FALSE,
    alert_recipients TEXT[], -- Array of user IDs or emails
    
    -- Timestamps
    event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_telemetry_events_type ON telemetry_events(event_type);
CREATE INDEX idx_telemetry_events_product ON telemetry_events(product_id);
CREATE INDEX idx_telemetry_events_print_job ON telemetry_events(print_job_id);
CREATE INDEX idx_telemetry_events_timestamp ON telemetry_events(event_timestamp DESC);
CREATE INDEX idx_telemetry_events_severity ON telemetry_events(severity);
CREATE INDEX idx_telemetry_events_location ON telemetry_events(location);

-- Enable Realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE telemetry_events;

-- Function to auto-generate low stock alerts
CREATE OR REPLACE FUNCTION check_and_create_low_stock_alert()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if product stock dropped below threshold
    IF NEW.event_type = 'stock_update' AND 
       EXISTS (
           SELECT 1 FROM products 
           WHERE id = NEW.product_id 
           AND stock_quantity <= low_stock_threshold
           AND is_active = TRUE
       ) THEN
        -- Create alert event
        INSERT INTO telemetry_events (
            event_type,
            product_id,
            event_data,
            source,
            severity,
            location
        )
        SELECT
            'low_stock_alert',
            p.id,
            jsonb_build_object(
                'product_name', p.name,
                'current_stock', p.stock_quantity,
                'threshold', p.low_stock_threshold,
                'location', p.location
            ),
            'system',
            CASE 
                WHEN p.stock_quantity = 0 THEN 'critical'
                WHEN p.stock_quantity <= (p.low_stock_threshold / 2) THEN 'warning'
                ELSE 'info'
            END,
            p.location
        FROM products p
        WHERE p.id = NEW.product_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_low_stock_alert
    AFTER INSERT ON telemetry_events
    FOR EACH ROW
    WHEN (NEW.event_type = 'stock_update')
    EXECUTE FUNCTION check_and_create_low_stock_alert();

-- ==============================================
-- DELIVERIES
-- ==============================================

CREATE TYPE delivery_status AS ENUM (
    'scheduled',
    'assigned',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'failed',
    'cancelled',
    'rescheduled'
);

CREATE TABLE deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    delivery_number TEXT UNIQUE NOT NULL,
    
    -- Related order
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
    
    -- Customer info (denormalized for quick access)
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    
    -- Delivery details
    delivery_address TEXT NOT NULL,
    delivery_area TEXT NOT NULL, -- Embu, Garissa, etc.
    delivery_notes TEXT,
    
    -- Scheduling
    scheduled_date DATE NOT NULL,
    scheduled_time_slot TEXT, -- e.g., "09:00-12:00", "14:00-17:00"
    estimated_arrival TIMESTAMPTZ,
    
    -- Assignment
    rider_name TEXT,
    rider_phone TEXT,
    courier_service TEXT, -- e.g., "In-house", "DHL", "Fargo"
    vehicle_details TEXT, -- e.g., "Red motorcycle KCA 123A"
    
    -- Status tracking
    status delivery_status NOT NULL DEFAULT 'scheduled',
    
    -- Real-time tracking
    current_location TEXT,
    tracking_updates JSONB DEFAULT '[]'::JSONB, -- Array of status updates with timestamps
    
    -- Completion
    delivered_at TIMESTAMPTZ,
    delivered_to TEXT, -- Name of person who received
    signature_required BOOLEAN DEFAULT FALSE,
    proof_of_delivery_url TEXT, -- Photo URL in storage
    
    -- Failure handling
    failed_reason TEXT,
    failed_at TIMESTAMPTZ,
    reschedule_count INTEGER DEFAULT 0,
    
    -- Priority
    priority INTEGER DEFAULT 5, -- 1-10, higher = more urgent
    is_express BOOLEAN DEFAULT FALSE,
    
    -- Internal notes
    internal_notes TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_deliveries_order ON deliveries(order_id);
CREATE INDEX idx_deliveries_status ON deliveries(status);
CREATE INDEX idx_deliveries_area ON deliveries(delivery_area);
CREATE INDEX idx_deliveries_scheduled_date ON deliveries(scheduled_date);
CREATE INDEX idx_deliveries_rider ON deliveries(rider_name);
CREATE INDEX idx_deliveries_created_at ON deliveries(created_at DESC);

-- Enable Realtime for live tracking
ALTER PUBLICATION supabase_realtime ADD TABLE deliveries;

CREATE TRIGGER update_deliveries_updated_at
    BEFORE UPDATE ON deliveries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Auto-generate delivery numbers
CREATE OR REPLACE FUNCTION generate_delivery_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.delivery_number = 'DEL-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(nextval('delivery_number_seq')::TEXT, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE delivery_number_seq START 1;

CREATE TRIGGER set_delivery_number
    BEFORE INSERT ON deliveries
    FOR EACH ROW
    WHEN (NEW.delivery_number IS NULL)
    EXECUTE FUNCTION generate_delivery_number();

-- Function to add tracking update
CREATE OR REPLACE FUNCTION add_delivery_tracking_update(
    delivery_id UUID,
    update_status TEXT,
    update_location TEXT DEFAULT NULL,
    update_notes TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    UPDATE deliveries
    SET tracking_updates = tracking_updates || jsonb_build_object(
        'timestamp', NOW(),
        'status', update_status,
        'location', update_location,
        'notes', update_notes
    )
    WHERE id = delivery_id;
END;
$$ LANGUAGE plpgsql;

-- View for delivery calendar
CREATE OR REPLACE VIEW delivery_schedule AS
SELECT
    d.id,
    d.delivery_number,
    d.scheduled_date,
    d.scheduled_time_slot,
    d.delivery_area,
    d.customer_name,
    d.rider_name,
    d.status,
    d.priority,
    d.is_express,
    o.order_number,
    o.total_kes,
    COUNT(*) OVER (PARTITION BY d.scheduled_date) as deliveries_same_day,
    COUNT(*) OVER (PARTITION BY d.scheduled_date, d.delivery_area) as deliveries_same_area
FROM deliveries d
LEFT JOIN orders o ON o.id = d.order_id
WHERE d.status NOT IN ('delivered', 'cancelled')
ORDER BY d.scheduled_date, d.priority DESC, d.created_at;

-- ==============================================
-- ROW LEVEL SECURITY FOR NEW TABLES
-- ==============================================

ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;

-- Telemetry Events Policies
-- Owner, admin, and hq_readonly can read telemetry
CREATE POLICY "staff_read_telemetry" ON telemetry_events
    FOR SELECT
    USING (get_user_role(auth.uid()) IN ('owner', 'admin', 'hq_readonly', 'print_operator'));

-- Owner and admin can create telemetry events
CREATE POLICY "owner_admin_create_telemetry" ON telemetry_events
    FOR INSERT
    WITH CHECK (get_user_role(auth.uid()) IN ('owner', 'admin', 'print_operator'));

-- Public API can create events (for telemetry ingest endpoint)
-- This will be enforced at the Edge Function level with API key
CREATE POLICY "public_api_create_telemetry" ON telemetry_events
    FOR INSERT
    WITH CHECK (TRUE);

-- Deliveries Policies
-- Owner and admin can manage deliveries
CREATE POLICY "owner_admin_manage_deliveries" ON deliveries
    FOR ALL
    USING (get_user_role(auth.uid()) IN ('owner', 'admin'))
    WITH CHECK (get_user_role(auth.uid()) IN ('owner', 'admin'));

-- hq_readonly can view deliveries
CREATE POLICY "hq_readonly_read_deliveries" ON deliveries
    FOR SELECT
    USING (get_user_role(auth.uid()) IN ('owner', 'admin', 'hq_readonly'));

-- Public can view their own delivery by order number (for customer tracking)
-- This is handled through a separate public view with no RLS

-- ==============================================
-- PUBLIC CUSTOMER TRACKING VIEW
-- ==============================================

-- View for customer order tracking (no auth required)
CREATE OR REPLACE VIEW public_order_tracking AS
SELECT
    o.order_number,
    o.customer_email,
    o.status as order_status,
    o.created_at as order_date,
    o.total_kes,
    d.delivery_number,
    d.delivery_area,
    d.scheduled_date,
    d.scheduled_time_slot,
    d.status as delivery_status,
    d.estimated_arrival,
    d.current_location,
    d.tracking_updates,
    d.delivered_at,
    d.courier_service
FROM orders o
LEFT JOIN deliveries d ON d.order_id = o.id
WHERE o.status NOT IN ('cancelled');

-- ==============================================
-- PERFORMANCE: ANALYTICS BATCHING
-- ==============================================

-- Table for batched analytics writes
CREATE TABLE analytics_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_batch JSONB NOT NULL,
    batch_size INTEGER NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX idx_analytics_queue_processed ON analytics_queue(processed, created_at);

-- Function to process analytics batch
CREATE OR REPLACE FUNCTION process_analytics_batch(batch_id UUID)
RETURNS INTEGER AS $$
DECLARE
    batch_record RECORD;
    events_processed INTEGER := 0;
    event_record JSONB;
BEGIN
    -- Get the batch
    SELECT * INTO batch_record FROM analytics_queue WHERE id = batch_id AND processed = FALSE;
    
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    
    -- Process each event in the batch
    FOR event_record IN SELECT * FROM jsonb_array_elements(batch_record.event_batch)
    LOOP
        INSERT INTO site_events (
            event_type,
            session_id,
            page_url,
            referrer,
            user_agent,
            product_id,
            event_data,
            created_at
        )
        VALUES (
            event_record->>'event_type',
            event_record->>'session_id',
            event_record->>'page_url',
            event_record->>'referrer',
            event_record->>'user_agent',
            (event_record->>'product_id')::UUID,
            event_record->'event_data',
            (event_record->>'timestamp')::TIMESTAMPTZ
        );
        
        events_processed := events_processed + 1;
    END LOOP;
    
    -- Mark batch as processed
    UPDATE analytics_queue
    SET processed = TRUE, processed_at = NOW()
    WHERE id = batch_id;
    
    RETURN events_processed;
END;
$$ LANGUAGE plpgsql;

-- ==============================================
-- PERFORMANCE: QUERY OPTIMIZATION
-- ==============================================

-- Materialized view for product inventory summary (refresh periodically)
CREATE MATERIALIZED VIEW product_inventory_summary AS
SELECT
    p.location,
    p.category,
    COUNT(*) as total_products,
    SUM(p.stock_quantity) as total_stock,
    SUM(CASE WHEN p.stock_quantity <= p.low_stock_threshold THEN 1 ELSE 0 END) as low_stock_count,
    SUM(CASE WHEN p.stock_quantity = 0 THEN 1 ELSE 0 END) as out_of_stock_count,
    SUM(p.stock_quantity * p.price_kes) as inventory_value_kes
FROM products p
WHERE p.is_active = TRUE
GROUP BY p.location, p.category;

CREATE INDEX idx_product_inventory_location ON product_inventory_summary(location);
CREATE INDEX idx_product_inventory_category ON product_inventory_summary(category);

-- Function to refresh inventory summary (call this periodically)
CREATE OR REPLACE FUNCTION refresh_product_inventory()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY product_inventory_summary;
END;
$$ LANGUAGE plpgsql;

-- ==============================================
-- RATE LIMITING TRACKING
-- ==============================================

CREATE TABLE rate_limit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    endpoint TEXT NOT NULL,
    ip_address INET NOT NULL,
    request_count INTEGER DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    blocked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rate_limit_endpoint_ip ON rate_limit_log(endpoint, ip_address, window_start DESC);
CREATE INDEX idx_rate_limit_created_at ON rate_limit_log(created_at);

-- Cleanup old rate limit logs (keep last 24 hours only)
CREATE OR REPLACE FUNCTION cleanup_rate_limit_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM rate_limit_log
    WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- ==============================================
-- COMMENTS
-- ==============================================

COMMENT ON TABLE telemetry_events IS 'Real-time telemetry for stock levels, locations, conditions, and print job progress';
COMMENT ON TABLE deliveries IS 'Delivery coordination and scheduling with real-time tracking';
COMMENT ON TABLE analytics_queue IS 'Batched analytics events for high-traffic periods';
COMMENT ON TABLE rate_limit_log IS 'Rate limiting tracking for public endpoints';
COMMENT ON VIEW delivery_schedule IS 'Calendar view of scheduled deliveries';
COMMENT ON VIEW public_order_tracking IS 'Public view for customer order tracking without authentication';
