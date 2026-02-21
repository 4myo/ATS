// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { GoogleGenAI } from "npm:@google/genai";

type AnalyzePayload = {
  candidateId: string;
  resumeText?: string;
  jobTitle?: string;
};

const supabaseUrl =
  Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL") || "";
const supabaseKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_ANON_KEY") ||
  Deno.env.get("VITE_SUPABASE_ANON_KEY") ||
  "";
const geminiApiKey =
  Deno.env.get("GEMINICLIENT_KEY") || Deno.env.get("GEMINI_API_KEY") || "";

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing SUPABASE_URL / SUPABASE_KEY env vars.");
}

if (!geminiApiKey) {
  throw new Error("Missing GEMINI_API_KEY env var.");
}

const supabase = createClient(supabaseUrl, supabaseKey);
const ai = new GoogleGenAI({ apiKey: geminiApiKey });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

  const payload = (await req.json()) as AnalyzePayload;
  if (!payload.candidateId) {
    return new Response("Missing candidateId", {
      status: 400,
      headers: corsHeaders,
    });
  }

  const { data: candidate, error: fetchError } = await supabase
    .from("candidates")
    .select("id, full_name, job_title, email, resume_path")
    .eq("id", payload.candidateId)
    .single();

  if (fetchError || !candidate) {
    return new Response("Candidate not found", {
      status: 404,
      headers: corsHeaders,
    });
  }

  let resumeText = payload.resumeText || "";
  const jobTitle = payload.jobTitle || candidate.job_title || "";

  const prompt = `You are an ATS analyzer. Extract structured data from the resume text and return strict JSON with these fields:
{
  "location": string | null,
  "years_experience": number | null,
  "skills": string[],
  "ats_score": number,
  "summary": string,
  "strengths": string[],
  "concerns": string[],
  "skill_profile": {
    "technical": number,
    "communication": number,
    "experience": number,
    "leadership": number,
    "problem_solving": number,
    "culture": number
  }
}

Resume Text:
${resumeText}

Job Title: ${jobTitle}
Candidate Name: ${candidate.full_name}
Return JSON only.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  const rawText = response.text ?? "{}";
  const cleanedText = rawText
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  let parsed: {
    location?: string | null;
    years_experience?: number | null;
    skills?: string[];
    ats_score?: number;
    summary?: string;
    strengths?: string[];
    concerns?: string[];
    skill_profile?: Record<string, number>;
  } = {};

  try {
    parsed = JSON.parse(cleanedText);
  } catch (_error) {
    await supabase
      .from("candidates")
      .update({ analysis_status: "failed" })
      .eq("id", payload.candidateId);

    return new Response(`Failed to parse AI response: ${rawText}`, {
      status: 422,
      headers: corsHeaders,
    });
  }

  const { error: updateError } = await supabase
    .from("candidates")
    .update({
      location: parsed.location ?? null,
      years_experience: parsed.years_experience ?? null,
      skills: parsed.skills ?? [],
      ats_score: parsed.ats_score ?? null,
      analysis_summary: parsed.summary ?? null,
      analysis_strengths: parsed.strengths ?? [],
      analysis_concerns: parsed.concerns ?? [],
      skill_profile: parsed.skill_profile ?? null,
      analysis_status: "complete",
    })
    .eq("id", payload.candidateId);

  if (updateError) {
    return new Response("Failed to update candidate", {
      status: 500,
      headers: corsHeaders,
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});
