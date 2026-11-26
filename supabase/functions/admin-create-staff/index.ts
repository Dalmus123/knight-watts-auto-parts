/**
 * admin-create-staff
 * CEO (and COS for sales roles) staff provisioning via Auth Admin API.
 * Service role stays server-side only. Caller JWT + role verified on every request.
 *
 * Actions: create | invite | update_role | disable | enable | reset_password | list
 *
 * Temporary-password creates and reset_password set user_profiles.must_change_password = true.
 * Invite flow does not set the flag (user chooses password via invite link).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// CORS: wildcard so both custom domain (knightwatts.co.ke) and the legacy
// GitHub Pages origin (dalmus123.github.io) work during DNS switchover.
// Browser Authorization header still required; JWT + role checked below.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type StaffRole =
  | "owner"
  | "admin"
  | "ceo"
  | "cfo"
  | "coo"
  | "cos"
  | "chief_of_sales"
  | "sales_rep"
  | "print_operator"
  | "hq_readonly";

const CEO_ASSIGNABLE: StaffRole[] = [
  "cfo",
  "coo",
  "cos",
  "chief_of_sales",
  "sales_rep",
  "print_operator",
  "hq_readonly",
];

const COS_ASSIGNABLE: StaffRole[] = ["chief_of_sales", "sales_rep"];

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json(500, { error: "Server misconfigured" });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(401, { error: "Missing authorization" });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user: caller },
      error: userErr,
    } = await userClient.auth.getUser(token);
    if (userErr || !caller) {
      return json(401, { error: "Invalid session" });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerProfile, error: profileErr } = await admin
      .from("user_profiles")
      .select("id, email, role, full_name")
      .eq("id", caller.id)
      .maybeSingle();

    if (profileErr || !callerProfile) {
      return json(403, { error: "Caller profile not found" });
    }

    const callerRole = callerProfile.role as StaffRole;
    const isCeo =
      callerRole === "ceo" ||
      callerRole === "owner" ||
      callerRole === "admin";
    const isCos = callerRole === "cos";

    if (!isCeo && !isCos) {
      return json(403, { error: "Only CEO or Chief of Staff can manage staff" });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "create");

    const canAssign = (role: string) => {
      if (isCeo) return CEO_ASSIGNABLE.includes(role as StaffRole);
      return COS_ASSIGNABLE.includes(role as StaffRole);
    };

    const canManageTarget = async (userId: string) => {
      const { data: target } = await admin
        .from("user_profiles")
        .select("id, role")
        .eq("id", userId)
        .maybeSingle();
      if (!target) return { ok: false as const, reason: "User not found" };
      if (isCeo) return { ok: true as const, target };
      if (isCos && COS_ASSIGNABLE.includes(target.role as StaffRole)) {
        return { ok: true as const, target };
      }
      return { ok: false as const, reason: "COS may only manage sales roles" };
    };

    // ---------- list ----------
    if (action === "list") {
      let query = admin
        .from("user_profiles")
        .select(
          "id, email, full_name, role, location, created_at, updated_at, must_change_password",
        )
        .order("created_at", { ascending: false });

      if (isCos && !isCeo) {
        query = query.in("role", ["sales_rep", "chief_of_sales", "cos"]);
      }

      const { data: profiles, error: listErr } = await query;
      if (listErr) return json(500, { error: listErr.message });

      const enriched = [];
      for (const p of profiles || []) {
        const { data: authData } = await admin.auth.admin.getUserById(p.id);
        const au = authData?.user as
          | {
            last_sign_in_at?: string | null;
            banned_until?: string | null;
            email_confirmed_at?: string | null;
          }
          | undefined;
        enriched.push({
          ...p,
          last_sign_in_at: au?.last_sign_in_at ?? null,
          banned_until: au?.banned_until ?? null,
          email_confirmed_at: au?.email_confirmed_at ?? null,
          disabled: !!au?.banned_until,
        });
      }

      return json(200, { users: enriched });
    }

    // ---------- create / invite ----------
    if (action === "create" || action === "invite") {
      const email = String(body.email || "").trim().toLowerCase();
      const fullName = String(body.full_name || "").trim();
      const role = String(body.role || "").trim() as StaffRole;
      const password = body.password ? String(body.password) : "";
      const invite = action === "invite" || body.invite === true;

      if (!isEmail(email)) return json(400, { error: "Valid email required" });
      if (fullName.length < 2) {
        return json(400, { error: "Full name required" });
      }
      if (!canAssign(role)) {
        return json(403, {
          error: isCos
            ? "COS may only assign chief_of_sales or sales_rep"
            : "Role not assignable",
        });
      }
      if (!invite && password.length < 8) {
        return json(400, {
          error: "Password must be at least 8 characters (or use invite)",
        });
      }

      let userId: string | null = null;

      if (invite) {
        const redirectTo =
          typeof body.redirect_to === "string" && body.redirect_to.startsWith("https://")
            ? body.redirect_to
            : undefined;
        const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
          data: { full_name: fullName },
          ...(redirectTo ? { redirectTo } : {}),
        });
        if (error) return json(400, { error: error.message });
        userId = data.user?.id ?? null;
      } else {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
          app_metadata: { must_change_password: true },
        });
        if (error) return json(400, { error: error.message });
        userId = data.user?.id ?? null;
      }

      if (!userId) return json(500, { error: "User created but id missing" });

      // Temporary password → must change on first login. Invite → user picks password.
      const mustChange = !invite;

      const { error: upsertErr } = await admin.from("user_profiles").upsert(
        {
          id: userId,
          email,
          full_name: fullName,
          role,
          must_change_password: mustChange,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
      if (upsertErr) {
        return json(500, {
          error: `Auth user created but profile failed: ${upsertErr.message}`,
          user_id: userId,
        });
      }

      // Never return the temporary password to the client response beyond what the creator already typed
      return json(200, {
        ok: true,
        user_id: userId,
        email,
        role,
        invited: invite,
        must_change_password: mustChange,
      });
    }

    // ---------- update_role ----------
    if (action === "update_role") {
      const userId = String(body.user_id || "");
      const role = String(body.role || "").trim() as StaffRole;
      if (!userId) return json(400, { error: "user_id required" });
      if (userId === caller.id) {
        return json(400, { error: "Cannot change your own role here" });
      }
      if (!canAssign(role)) {
        return json(403, { error: "Cannot assign that role" });
      }
      const gate = await canManageTarget(userId);
      if (!gate.ok) return json(403, { error: gate.reason });

      const { error } = await admin
        .from("user_profiles")
        .update({ role, updated_at: new Date().toISOString() })
        .eq("id", userId);
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true, user_id: userId, role });
    }

    // ---------- disable / enable ----------
    if (action === "disable" || action === "enable") {
      const userId = String(body.user_id || "");
      if (!userId) return json(400, { error: "user_id required" });
      if (userId === caller.id) {
        return json(400, { error: "Cannot disable your own account" });
      }
      const gate = await canManageTarget(userId);
      if (!gate.ok) return json(403, { error: gate.reason });

      const banDuration = action === "disable" ? "876000h" : "none";
      const { error } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: banDuration,
      });
      if (error) return json(500, { error: error.message });
      return json(200, {
        ok: true,
        user_id: userId,
        disabled: action === "disable",
      });
    }

    // ---------- reset_password (temp password; forces change again) ----------
    if (action === "reset_password") {
      const userId = String(body.user_id || "");
      const password = String(body.password || "");
      if (!userId) return json(400, { error: "user_id required" });
      if (password.length < 8) {
        return json(400, { error: "Password must be at least 8 characters" });
      }
      const gate = await canManageTarget(userId);
      if (!gate.ok) return json(403, { error: gate.reason });

      const { error } = await admin.auth.admin.updateUserById(userId, {
        password,
        app_metadata: { must_change_password: true },
      });
      if (error) return json(500, { error: error.message });

      const { error: flagErr } = await admin
        .from("user_profiles")
        .update({
          must_change_password: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (flagErr) return json(500, { error: flagErr.message });

      return json(200, {
        ok: true,
        user_id: userId,
        must_change_password: true,
      });
    }

    return json(400, { error: `Unknown action: ${action}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("admin-create-staff error", message);
    return json(500, { error: message });
  }
});
