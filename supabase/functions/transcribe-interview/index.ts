// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type TranscribePayload = {
  transcriptId: string;
  confirmedMaxCostUsd?: number;
};

const supabaseUrl =
  Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const openAiApiKey = Deno.env.get("OPENAI_API_KEY") || "";
const transcribeModel =
  Deno.env.get("OPENAI_TRANSCRIBE_MODEL") || "gpt-4o-mini-transcribe";

const maxAudioBytes = 25 * 1024 * 1024;
const maxDurationSeconds = 60 * 60;

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

const getBearerToken = (req: Request) => {
  const authorization = req.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
};

const estimateCost = (seconds: number) =>
  Math.max(0.01, (Math.max(0, seconds) / 60) * 0.003);

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

  let payload: TranscribePayload;
  try {
    payload = (await req.json()) as TranscribePayload;
  } catch (_error) {
    return new Response("Invalid JSON body", {
      status: 400,
      headers: corsHeaders,
    });
  }

  try {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars.");
    }

    if (!openAiApiKey) {
      throw new Error("Missing OPENAI_API_KEY env var.");
    }

    if (!payload.transcriptId) {
      return new Response("Missing transcriptId", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    const bearerToken = getBearerToken(req);
    if (!bearerToken) {
      return new Response("Unauthorized", {
        status: 401,
        headers: corsHeaders,
      });
    }

    const { data: authData, error: authError } =
      await supabase.auth.getUser(bearerToken);
    if (authError || !authData.user) {
      return new Response("Unauthorized", {
        status: 401,
        headers: corsHeaders,
      });
    }

    const authedUserId = authData.user.id;
    const { data: transcript, error: transcriptError } = await supabase
      .from("interview_transcripts")
      .select(
        "id, user_id, title, audio_path, audio_mime_type, duration_seconds, status, estimated_cost_usd",
      )
      .eq("id", payload.transcriptId)
      .eq("user_id", authedUserId)
      .single();

    if (transcriptError || !transcript) {
      return new Response("Transcript not found", {
        status: 404,
        headers: corsHeaders,
      });
    }

    if (!transcript.audio_path) {
      return new Response("Transcript has no audio recording", {
        status: 409,
        headers: corsHeaders,
      });
    }

    if (transcript.status === "processing") {
      return new Response("Transcript is already processing", {
        status: 409,
        headers: corsHeaders,
      });
    }

    const durationSeconds = Math.max(
      0,
      Math.round(Number(transcript.duration_seconds ?? 0)),
    );
    if (durationSeconds > maxDurationSeconds) {
      return new Response("Recording exceeds the configured 60 minute limit", {
        status: 413,
        headers: corsHeaders,
      });
    }

    const estimatedCost =
      Number(transcript.estimated_cost_usd ?? 0) || estimateCost(durationSeconds);
    const confirmedMaxCostUsd = Number(payload.confirmedMaxCostUsd ?? 0);
    if (confirmedMaxCostUsd > 0 && estimatedCost > confirmedMaxCostUsd) {
      return new Response("Estimated transcription cost exceeds confirmation cap", {
        status: 402,
        headers: corsHeaders,
      });
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: hourlyCount } = await supabase
      .from("interview_transcripts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", authedUserId)
      .gte("updated_at", oneHourAgo)
      .in("status", ["processing", "complete"]);

    if ((hourlyCount ?? 0) >= 12) {
      return new Response("Transcription hourly limit reached", {
        status: 429,
        headers: corsHeaders,
      });
    }

    await supabase
      .from("interview_transcripts")
      .update({
        status: "processing",
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", transcript.id)
      .eq("user_id", authedUserId);

    const { data: audioBlob, error: downloadError } = await supabase.storage
      .from("interview-recordings")
      .download(transcript.audio_path);

    if (downloadError || !audioBlob) {
      throw new Error(downloadError?.message || "Failed to download recording.");
    }

    if (audioBlob.size > maxAudioBytes) {
      throw new Error("Recording is larger than the 25 MB transcription upload limit.");
    }

    const fileName =
      transcript.audio_path.split("/").pop() || `${transcript.id}.webm`;
    const formData = new FormData();
    formData.append("model", transcribeModel);
    formData.append("file", audioBlob, fileName);
    formData.append("language", "sl");
    formData.append(
      "prompt",
      "Razgovor za zaposlitev. Prepiši jasno v slovenščini, ohrani strokovne izraze, imena orodij in kratice.",
    );
    formData.append("response_format", "json");

    const openAiResponse = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiApiKey}`,
        },
        body: formData,
      },
    );

    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text();
      throw new Error(
        `OpenAI transcription error ${openAiResponse.status}: ${
          errorText || openAiResponse.statusText
        }`,
      );
    }

    const responseJson = await openAiResponse.json();
    const transcriptText = String(responseJson.text ?? "").trim();
    if (!transcriptText) {
      throw new Error("OpenAI returned an empty transcript.");
    }

    const usage = responseJson.usage ?? null;
    const { data: updatedTranscript, error: updateError } = await supabase
      .from("interview_transcripts")
      .update({
        transcript_text: transcriptText,
        status: "complete",
        actual_cost_usd: estimatedCost,
        metadata: {
          model: transcribeModel,
          usage,
          provider: "openai",
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", transcript.id)
      .eq("user_id", authedUserId)
      .select("id, title, transcript_text, duration_seconds, status, audio_path, error_message, created_at")
      .single();

    if (updateError || !updatedTranscript) {
      throw new Error(updateError?.message || "Failed to save transcript.");
    }

    return new Response(
      JSON.stringify({ ok: true, transcript: updatedTranscript, text: transcriptText }),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (payload?.transcriptId && supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
      });
      await supabase
        .from("interview_transcripts")
        .update({
          status: "failed",
          error_message: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payload.transcriptId);
    }

    return new Response(`Interview transcription failed: ${message}`, {
      status: 500,
      headers: corsHeaders,
    });
  }
});
