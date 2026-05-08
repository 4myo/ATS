// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const supabaseUrl =
  Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const isOriginAllowed = (req: Request) => {
  const origin = req.headers.get("origin");
  return !origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin);
};

const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin =
    allowedOrigins.length === 0 || allowedOrigins.includes(origin)
      ? origin || "*"
      : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
};

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 128;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const termsVersion = "2026-05-07";

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
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(isOriginAllowed(req) ? "ok" : "Forbidden", {
      status: isOriginAllowed(req) ? 200 : 403,
      headers: corsHeaders,
    });
  }

  if (!isOriginAllowed(req)) {
    return new Response("Forbidden origin", {
      status: 403,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  let payload: {
    email?: unknown;
    password?: unknown;
    termsAccepted?: unknown;
    termsVersion?: unknown;
  };
  try {
    payload = await req.json();
  } catch (_error) {
    return new Response("Invalid JSON body", {
      status: 400,
      headers: corsHeaders,
    });
  }

  const email =
    typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  const acceptedTerms = payload.termsAccepted === true;
  const acceptedTermsVersion =
    typeof payload.termsVersion === "string" ? payload.termsVersion : "";

  if (!email || !password) {
    return new Response("Missing email or password", {
      status: 400,
      headers: corsHeaders,
    });
  }

  if (!acceptedTerms || acceptedTermsVersion !== termsVersion) {
    return new Response("Terms acceptance is required", {
      status: 400,
      headers: corsHeaders,
    });
  }

  if (
    email.length > MAX_EMAIL_LENGTH ||
    !emailPattern.test(email) ||
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    return new Response("Invalid email or password", {
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

  return new Response(
    JSON.stringify({
      ok: true,
    }),
    {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    },
  );
});
