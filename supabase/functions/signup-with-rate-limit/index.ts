// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl =
  Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL") || "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_ANON_KEY") ||
  Deno.env.get("VITE_SUPABASE_ANON_KEY") ||
  "";

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars.");
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const getClientIp = (req: Request) => {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }
  return req.headers.get("x-real-ip") || "unknown";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  const { email, password } = await req.json();
  if (!email || !password) {
    return new Response("Missing email or password", {
      status: 400,
      headers: corsHeaders,
    });
  }

  const ip = getClientIp(req);
  const now = new Date();

  const { data: existing } = await supabaseAdmin
    .from("signup_rate_limits")
    .select("id, attempts, window_start")
    .eq("ip", ip)
    .order("window_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const windowStart = new Date(existing.window_start);
    const windowAge = now.getTime() - windowStart.getTime();
    if (windowAge < RATE_LIMIT_WINDOW_MS) {
      if (existing.attempts >= RATE_LIMIT_MAX) {
        return new Response("Rate limit exceeded. Try again later.", {
          status: 429,
          headers: corsHeaders,
        });
      }

      await supabaseAdmin
        .from("signup_rate_limits")
        .update({ attempts: existing.attempts + 1 })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin
        .from("signup_rate_limits")
        .insert({ ip, attempts: 1, window_start: now.toISOString() });
    }
  } else {
    await supabaseAdmin
      .from("signup_rate_limits")
      .insert({ ip, attempts: 1, window_start: now.toISOString() });
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    return new Response(error.message, {
      status: 400,
      headers: corsHeaders,
    });
  }

  return new Response(JSON.stringify({ user: data.user }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});
