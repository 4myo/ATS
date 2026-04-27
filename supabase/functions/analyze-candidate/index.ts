// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { GoogleGenAI } from "npm:@google/genai";

type AnalyzePayload = {
  candidateId: string;
  resumeText?: string;
  jobTitle?: string;
  jobDescription?: string;
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
  const jobDescription = payload.jobDescription || "";

  const prompt = `You are an ATS analyzer. Follow these rules:
- Use the Job Title and Job Description as the target role requirements.
- Extract only the top 10 most relevant skills for the role.
- Compute ats_score (0-100) using weighted scoring:
  skills 50%, experience 30%, education 10%, culture/soft skills 10%.
  Use a weighted average and round to the nearest whole number.
- Provide strengths and concerns as concise bullet phrases.
- Keep skill_profile sub-scores from 0-100.
- Estimate ai_writing_score (0-100) as an opinion signal for whether the CV text appears generated or heavily assisted by ChatGPT or another AI writing tool.
- Do not present ai_writing_score as proof. Base it on generic phrasing, overly polished structure, repeated template language, lack of specific measurable detail, and unusually uniform tone.
- Provide ai_writing_notes as short evidence cues a recruiter can review.

Return strict JSON with these fields:
{
  "location": string | null,
  "years_experience": number | null,
  "skills": string[],
  "education": string[],
  "ats_score": number,
  "summary": string,
  "strengths": string[],
  "concerns": string[],
  "ai_writing_score": number,
  "ai_writing_label": "Low AI-writing signal" | "Mixed authorship signal" | "High AI-writing signal",
  "ai_writing_notes": string[],
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
Job Description: ${jobDescription}
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
    education?: string[];
    ats_score?: number;
    summary?: string;
    strengths?: string[];
    concerns?: string[];
    ai_writing_score?: number;
    ai_writing_label?: string;
    ai_writing_notes?: string[];
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

  const baseUpdate = {
    location: parsed.location ?? null,
    years_experience: parsed.years_experience ?? null,
    skills: parsed.skills ?? [],
    education: parsed.education ?? [],
    ats_score: parsed.ats_score ?? null,
    analysis_summary: parsed.summary ?? null,
    analysis_strengths: parsed.strengths ?? [],
    analysis_concerns: parsed.concerns ?? [],
    skill_profile: parsed.skill_profile ?? null,
    analysis_status: "complete",
  };

  const updateWithAiWriting = {
    ...baseUpdate,
    ai_writing_score: parsed.ai_writing_score ?? null,
    ai_writing_label: parsed.ai_writing_label ?? null,
    ai_writing_notes: parsed.ai_writing_notes ?? [],
  };

  let { error: updateError } = await supabase
    .from("candidates")
    .update(updateWithAiWriting)
    .eq("id", payload.candidateId);

  if (
    updateError &&
    (updateError.message?.includes("ai_writing") ||
      updateError.details?.includes("ai_writing"))
  ) {
    const retry = await supabase
      .from("candidates")
      .update(baseUpdate)
      .eq("id", payload.candidateId);
    updateError = retry.error;
  }

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
