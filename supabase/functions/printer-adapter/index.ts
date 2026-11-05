/**
 * Printer Adapter - OctoPrint API Integration (Pluggable)
 * This Edge Function interfaces with 3D printers via their APIs
 * Currently supports OctoPrint, with stubs for Bambu Lab and Prusa Connect
 * 
 * DISABLED BY DEFAULT - Enable when printers are configured
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

interface PrinterConnection {
  type: 'OctoPrint' | 'Bambu' | 'Prusa Connect' | 'manual';
  config: any;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const printerId = url.searchParams.get("printer_id");

    if (!printerId) {
      return new Response(
        JSON.stringify({ error: "printer_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get printer configuration
    const { data: printer, error: printerError } = await supabase
      .from("printers")
      .select("*")
      .eq("id", printerId)
      .single();

    if (printerError || !printer) {
      return new Response(
        JSON.stringify({ error: "Printer not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!printer.connection_config) {
      return new Response(
        JSON.stringify({ error: "Printer connection not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const connection: PrinterConnection = {
      type: printer.connection_type,
      config: printer.connection_config
    };

    // Handle different actions
    let result;
    switch (action) {
      case "status":
        result = await getPrinterStatus(connection);
        break;
      case "start_print":
        const body = await req.json();
        result = await startPrint(connection, body.file_path, body.job_id);
        break;
      case "cancel_print":
        result = await cancelPrint(connection);
        break;
      case "pause_print":
        result = await pausePrint(connection);
        break;
      case "resume_print":
        result = await resumePrint(connection);
        break;
      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Printer adapter error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", message: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ==============================================
// OCTOPRINT ADAPTER
// ==============================================

async function getPrinterStatus(connection: PrinterConnection) {
  if (connection.type === 'OctoPrint') {
    return await octoPrintGetStatus(connection.config);
  } else if (connection.type === 'Bambu') {
    return await bambuGetStatus(connection.config);
  } else if (connection.type === 'Prusa Connect') {
    return await prusaConnectGetStatus(connection.config);
  } else {
    return { status: 'manual', message: 'Manual printer - no API' };
  }
}

async function octoPrintGetStatus(config: any) {
  try {
    const response = await fetch(`${config.url}/api/printer`, {
      headers: {
        "X-Api-Key": config.api_key
      }
    });

    if (!response.ok) {
      throw new Error(`OctoPrint API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      success: true,
      state: data.state?.text || 'unknown',
      temperatures: data.temperature,
      sd_ready: data.sd?.ready || false
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function startPrint(connection: PrinterConnection, filePath: string, jobId: string) {
  if (connection.type === 'OctoPrint') {
    return await octoPrintStartPrint(connection.config, filePath, jobId);
  }
  
  return {
    success: false,
    error: 'Print start not supported for this printer type yet'
  };
}

async function octoPrintStartPrint(config: any, filePath: string, jobId: string) {
  try {
    // In a real implementation, the file would need to be uploaded to OctoPrint first
    // This is a simplified example
    
    const response = await fetch(`${config.url}/api/files/local/${encodeURIComponent(filePath)}`, {
      method: 'POST',
      headers: {
        "X-Api-Key": config.api_key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        command: "select",
        print: true
      })
    });

    if (!response.ok) {
      throw new Error(`OctoPrint start print error: ${response.statusText}`);
    }

    return {
      success: true,
      message: "Print started successfully",
      job_id: jobId
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function cancelPrint(connection: PrinterConnection) {
  if (connection.type === 'OctoPrint') {
    return await octoPrintCancelPrint(connection.config);
  }
  
  return { success: false, error: 'Cancel not supported' };
}

async function octoPrintCancelPrint(config: any) {
  try {
    const response = await fetch(`${config.url}/api/job`, {
      method: 'POST',
      headers: {
        "X-Api-Key": config.api_key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ command: "cancel" })
    });

    if (!response.ok) {
      throw new Error(`OctoPrint cancel error: ${response.statusText}`);
    }

    return { success: true, message: "Print cancelled" };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function pausePrint(connection: PrinterConnection) {
  if (connection.type === 'OctoPrint') {
    return await octoPrintPausePrint(connection.config);
  }
  
  return { success: false, error: 'Pause not supported' };
}

async function octoPrintPausePrint(config: any) {
  try {
    const response = await fetch(`${config.url}/api/job`, {
      method: 'POST',
      headers: {
        "X-Api-Key": config.api_key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ command: "pause", action: "pause" })
    });

    if (!response.ok) {
      throw new Error(`OctoPrint pause error: ${response.statusText}`);
    }

    return { success: true, message: "Print paused" };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function resumePrint(connection: PrinterConnection) {
  if (connection.type === 'OctoPrint') {
    return await octoPrintResumePrint(connection.config);
  }
  
  return { success: false, error: 'Resume not supported' };
}

async function octoPrintResumePrint(config: any) {
  try {
    const response = await fetch(`${config.url}/api/job`, {
      method: 'POST',
      headers: {
        "X-Api-Key": config.api_key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ command: "pause", action: "resume" })
    });

    if (!response.ok) {
      throw new Error(`OctoPrint resume error: ${response.statusText}`);
    }

    return { success: true, message: "Print resumed" };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==============================================
// BAMBU LAB ADAPTER (STUB)
// ==============================================

async function bambuGetStatus(config: any) {
  // TODO: Implement Bambu Lab API integration
  // Bambu printers use MQTT or local API
  return {
    success: false,
    error: "Bambu Lab integration not yet implemented"
  };
}

// ==============================================
// PRUSA CONNECT ADAPTER (STUB)
// ==============================================

async function prusaConnectGetStatus(config: any) {
  // TODO: Implement Prusa Connect API integration
  return {
    success: false,
    error: "Prusa Connect integration not yet implemented"
  };
}
