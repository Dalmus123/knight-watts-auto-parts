/**
 * contact-notify
 * Emails info@knightwatts.co.ke when a row lands in public.contact_messages.
 *
 * Trigger : Database webhook (INSERT on public.contact_messages) → POST here.
 * Mail    : Resend HTTPS API (POST https://api.resend.com/emails).
 *
 * Secrets (never hardcoded; set with `supabase secrets set`):
 *   RESEND_API_KEY    Resend API key with sending access on knightwatts.co.ke
 * Optional:
 *   CONTACT_NOTIFY_TO default info@knightwatts.co.ke
 *   CONTACT_NOTIFY_FROM default Knight Watts Website <noreply@knightwatts.co.ke>
 * Provided automatically by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Security model: the request body is NOT trusted for content. We only read
 * `record.id` from it, load the row with the service role, and send at most one
 * notification per row (notified_at is claimed atomically). A forged call can
 * therefore only trigger the email that would have been sent anyway.
 *
 * The website form does not depend on this function: the message is stored first,
 * so a missing/failed function never loses a message or fails the form.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RESEND_URL = "https://api.resend.com/emails";
const FETCH_TIMEOUT_MS = 8000;
const DEFAULT_FROM = "Knight Watts Website <noreply@knightwatts.co.ke>";
const DEFAULT_TO = "info@knightwatts.co.ke";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Strip CR/LF and control chars so user text can never inject mail headers. */
function oneLine(v: unknown, max = 200): string {
  return String(v ?? "")
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, max);
}

function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

async function postResend(
  apiKey: string,
  body: Record<string, unknown>,
  idempotencyKey: string,
): Promise<{ ok: boolean; status: number; detail: string }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    let detail = "";
    try {
      const parsed = await res.json();
      // Never log keys. Resend errors look like { name, message, statusCode }.
      if (parsed && typeof parsed === "object") {
        detail = String(parsed.message || parsed.name || "").slice(0, 300);
      }
    } catch {
      detail = res.statusText || "";
    }
    return { ok: res.ok, status: res.status, detail };
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const notifyTo = Deno.env.get("CONTACT_NOTIFY_TO") || DEFAULT_TO;
  const notifyFrom = Deno.env.get("CONTACT_NOTIFY_FROM") || DEFAULT_FROM;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!resendKey) {
    // Not configured yet: do nothing (the message is already safe in the table).
    return json(503, { error: "RESEND_API_KEY not configured" });
  }
  if (!supabaseUrl || !serviceKey) {
    return json(500, { error: "Supabase environment not available" });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  const id = payload?.record?.id ?? payload?.id;
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    return json(400, { error: "Missing or invalid record id" });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Claim the row: only one notification per message, even if the webhook fires twice.
  const { data: claimed, error: claimErr } = await admin
    .from("contact_messages")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", id)
    .is("notified_at", null)
    .select("id, created_at, name, email, phone, topic, vehicle, message, source")
    .maybeSingle();

  if (claimErr) {
    console.error("contact-notify claim failed:", claimErr.message);
    return json(500, { error: "Could not load message" });
  }
  if (!claimed) {
    return json(200, { ok: true, skipped: "not found or already notified" });
  }

  const m = claimed;
  const when = new Date(m.created_at).toLocaleString("en-KE", {
    timeZone: "Africa/Nairobi",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const subject = oneLine(
    `[Website] ${m.topic || "Contact"} — ${m.name}`,
    150,
  );

  const lines = [
    `New message from the Knight Watts website contact form`,
    ``,
    `Name:    ${oneLine(m.name)}`,
    `Email:   ${oneLine(m.email) || "(not given)"}`,
    `Phone:   ${oneLine(m.phone) || "(not given)"}`,
    `Topic:   ${oneLine(m.topic)}`,
    `Vehicle: ${oneLine(m.vehicle) || "(not given)"}`,
    `Page:    ${oneLine(m.source)}`,
    `Sent:    ${when} (Nairobi)`,
    ``,
    `Message:`,
    String(m.message ?? ""),
    ``,
    `—`,
    `Reply to the customer directly, then mark it handled in the admin back office (Messages).`,
  ];
  const text = lines.join("\n");

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#222">
<h3 style="margin:0 0 12px">New website message</h3>
<table style="border-collapse:collapse">
<tr><td style="padding:2px 12px 2px 0;color:#666">Name</td><td>${escapeHtml(m.name)}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#666">Email</td><td>${escapeHtml(m.email) || "(not given)"}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#666">Phone</td><td>${escapeHtml(m.phone) || "(not given)"}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#666">Topic</td><td>${escapeHtml(m.topic)}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#666">Vehicle</td><td>${escapeHtml(m.vehicle) || "(not given)"}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#666">Page</td><td>${escapeHtml(m.source)}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#666">Sent</td><td>${escapeHtml(when)} (Nairobi)</td></tr>
</table>
<p style="white-space:pre-wrap;border-left:3px solid #ccc;padding-left:12px;margin:16px 0">${escapeHtml(m.message)}</p>
<p style="color:#666;font-size:12px">Reply to the customer directly, then mark it handled in the admin back office (Messages).</p>
</div>`;

  const resendBody: Record<string, unknown> = {
    from: notifyFrom,
    to: [notifyTo],
    subject,
    text,
    html,
  };
  if (isEmail(m.email)) resendBody.reply_to = m.email.trim();

  try {
    const result = await postResend(
      resendKey,
      resendBody,
      `contact-notify/${id}`,
    );
    if (!result.ok) {
      console.error(
        "contact-notify Resend failed:",
        result.status,
        result.detail,
      );
      await admin.from("contact_messages").update({ notified_at: null }).eq("id", id);
      return json(502, { error: "Email delivery failed" });
    }
    return json(200, { ok: true });
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    const message = aborted ? "Resend request timed out" : (err as Error).message;
    console.error("contact-notify Resend failed:", message);
    // Release the claim so a retry (or manual re-call) can send it later.
    await admin.from("contact_messages").update({ notified_at: null }).eq("id", id);
    return json(502, { error: "Email delivery failed" });
  }
});
