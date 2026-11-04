/**
 * Telemetry Ingest Edge Function
 * Accepts telemetry events from IoT devices, sensors, and systems
 * with rate limiting and validation
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // Max 100 requests per minute per IP
const BATCH_SIZE = 50; // Process up to 50 events at once

interface TelemetryEvent {
  event_type: string;
  product_id?: string;
  print_job_id?: string;
  event_data: Record<string, any>;
  source?: string;
  severity?: string;
  location?: string;
  warehouse_section?: string;
  event_timestamp?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get client IP for rate limiting
    const clientIp = req.headers.get("x-forwarded-for") || 
                     req.headers.get("x-real-ip") || 
                     "unknown";

    // Verify API key (optional but recommended)
    const apiKey = req.headers.get("x-api-key");
    const expectedApiKey = Deno.env.get("TELEMETRY_API_KEY");
    
    if (expectedApiKey && apiKey !== expectedApiKey) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - Invalid API key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check rate limit
    const rateCheck = await checkRateLimit(supabase, "telemetry-ingest", clientIp);
    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({ 
          error: "Rate limit exceeded",
          retry_after_ms: rateCheck.retry_after_ms 
        }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil(rateCheck.retry_after_ms / 1000))
          } 
        }
      );
    }

    // Parse request body
    const body = await req.json();
    
    // Support both single event and batch
    const events: TelemetryEvent[] = Array.isArray(body) ? body : [body];
    
    if (events.length === 0) {
      return new Response(
        JSON.stringify({ error: "No events provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (events.length > BATCH_SIZE) {
      return new Response(
        JSON.stringify({ error: `Batch too large. Maximum ${BATCH_SIZE} events per request.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate and prepare events
    const validatedEvents = [];
    const errors = [];

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const validation = validateEvent(event);
      
      if (!validation.valid) {
        errors.push({ index: i, error: validation.error });
        continue;
      }

      validatedEvents.push({
        event_type: event.event_type,
        product_id: event.product_id || null,
        print_job_id: event.print_job_id || null,
        event_data: event.event_data,
        source: event.source || 'api',
        severity: event.severity || 'info',
        location: event.location || null,
        warehouse_section: event.warehouse_section || null,
        event_timestamp: event.event_timestamp || new Date().toISOString(),
      });
    }

    if (validatedEvents.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid events to process", validation_errors: errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert telemetry events
    const { data, error } = await supabase
      .from("telemetry_events")
      .insert(validatedEvents)
      .select();

    if (error) {
      console.error("Database insert error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to store telemetry events", details: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update stock in products table if this is a stock update
    for (const event of validatedEvents) {
      if (event.event_type === 'stock_update' && event.product_id && event.event_data.new_quantity !== undefined) {
        await supabase
          .from('products')
          .update({ stock_quantity: event.event_data.new_quantity })
          .eq('id', event.product_id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: validatedEvents.length,
        failed: errors.length,
        errors: errors.length > 0 ? errors : undefined,
        events: data
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Telemetry ingest error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", message: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Rate limiting check using SECURITY DEFINER function
async function checkRateLimit(
  supabase: any,
  endpoint: string,
  ip: string
): Promise<{ allowed: boolean; retry_after_ms?: number }> {
  try {
    // Call the SECURITY DEFINER function which bypasses RLS
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_endpoint: endpoint,
      p_ip_address: ip,
      p_max_requests: RATE_LIMIT_MAX_REQUESTS,
      p_window_seconds: Math.floor(RATE_LIMIT_WINDOW_MS / 1000)
    });

    if (error) {
      console.error("Rate limit check error:", error);
      // On error, allow the request but log it
      return { allowed: true };
    }

    if (data === false) {
      // Rate limit exceeded
      return {
        allowed: false,
        retry_after_ms: RATE_LIMIT_WINDOW_MS,
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error("Rate limit function error:", error);
    // On error, allow the request
    return { allowed: true };
  }
}

// Validate telemetry event
function validateEvent(event: any): { valid: boolean; error?: string } {
  if (!event.event_type || typeof event.event_type !== "string") {
    return { valid: false, error: "Missing or invalid event_type" };
  }

  const validEventTypes = [
    'stock_update',
    'location_change',
    'condition_update',
    'supplier_update',
    'print_progress',
    'low_stock_alert',
    'restock_needed'
  ];

  if (!validEventTypes.includes(event.event_type)) {
    return { valid: false, error: `Invalid event_type. Must be one of: ${validEventTypes.join(', ')}` };
  }

  if (!event.event_data || typeof event.event_data !== "object") {
    return { valid: false, error: "Missing or invalid event_data" };
  }

  // Validate UUIDs if provided
  if (event.product_id && !isValidUUID(event.product_id)) {
    return { valid: false, error: "Invalid product_id UUID" };
  }

  if (event.print_job_id && !isValidUUID(event.print_job_id)) {
    return { valid: false, error: "Invalid print_job_id UUID" };
  }

  // Validate severity
  if (event.severity && !['info', 'warning', 'critical'].includes(event.severity)) {
    return { valid: false, error: "Invalid severity. Must be info, warning, or critical" };
  }

  return { valid: true };
}

function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}
