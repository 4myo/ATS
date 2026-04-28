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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const clampScore = (value: unknown) => {
  const score = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
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

  let payload: AnalyzePayload;
  try {
    payload = (await req.json()) as AnalyzePayload;
  } catch (_error) {
    return new Response("Invalid JSON body", {
      status: 400,
      headers: corsHeaders,
    });
  }

  try {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing SUPABASE_URL / SUPABASE_KEY env vars.");
    }

    if (!geminiApiKey) {
      throw new Error("Missing GEMINI_API_KEY env var.");
    }

    if (!payload.candidateId) {
      return new Response("Missing candidateId", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

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
    const hasDetailedJobDescription = jobDescription.trim().length >= 120;

    const prompt = `You are an ATS analyzer. Follow these rules:
- Use the Job Title and Job Description as the target role requirements.
- Always write every human-readable response field in Slovenian, regardless of the resume language.
- Keep JSON field names exactly as specified, but translate values such as summary, strengths, concerns, ai_writing_label, and ai_writing_notes into Slovenian.
- Skill names may stay in their common industry form when appropriate (for example React, TypeScript, SQL), but explanations and labels must be Slovenian.
- Extract only the top 10 most relevant skills for the role.
- Compute ats_score (0-100) using weighted scoring:
  skills 50%, experience 30%, education 10%, job-relevant collaboration/communication 10%.
  Use a weighted average and round to the nearest whole number.
- Be strict and calibrated. Do not reward generic CV language with high scores.
- Most real candidates should fall between 45 and 85 unless the CV contains strong, specific evidence for the exact role.
- Score bands:
  95-100: exceptional match; all must-have requirements are explicitly evidenced, relevant years are strong, achievements are specific/measurable, and no important gaps are present.
  85-94: strong match; most must-have requirements are evidenced, with only minor gaps.
  70-84: reasonable match; several relevant requirements are evidenced, but there are noticeable gaps or weaker proof.
  50-69: partial match; some relevant evidence exists, but important requirements are missing or unclear.
  30-49: weak match; limited direct evidence for the role.
  0-29: poor match; little or no relevant evidence.
- Score caps:
  If the Job Description is missing or too generic, ats_score must not exceed 82.
  If fewer than half of the must-have skills are explicitly evidenced, ats_score must not exceed 69.
  If relevant work experience is missing or unclear, ats_score must not exceed 59.
  If the CV has no specific projects, measurable outcomes, certifications, or concrete responsibilities, ats_score must not exceed 84.
  If there are two or more important concerns, ats_score must not exceed 79.
- Concerns must include missing or weakly evidenced key requirements, not only soft wording.
- Provide strengths and concerns as concise Slovenian bullet phrases.
- Keep skill_profile sub-scores from 0-100.
- Treat ats_score as a review aid only, never as a hiring decision.
- Do not consider or infer protected characteristics, including age, gender, race, nationality, ethnicity, religion, disability, marital status, pregnancy, sexual orientation, or family status.
- Do not use names, pronouns, graduation years, dates of birth, photos, nationality, address, or career gaps as negative signals.
- Evaluate only job-relevant evidence: required skills, relevant experience, role responsibilities, measurable achievements, certifications, and project/work history.
- If information is missing, mark it as unknown rather than assuming.
- Do not score "culture fit" based on personality, background, writing style, name, age, gender, or demographics.
- Interpret collaboration/communication only as job-relevant collaboration, communication, leadership, and stakeholder evidence explicitly present in the CV.
- Estimate ai_writing_score (0-100) as an opinion signal for whether the CV text appears generated or heavily assisted by ChatGPT or another AI writing tool.
- Do not present ai_writing_score as proof. Base it on generic phrasing, overly polished structure, repeated template language, lack of specific measurable detail, and unusually uniform tone.
- Provide ai_writing_label in Slovenian, using one of: "Nizek signal AI pisanja", "Mešan signal avtorstva", "Visok signal AI pisanja".
- Provide ai_writing_notes as short Slovenian evidence cues a recruiter can review.

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
  "ai_writing_label": "Nizek signal AI pisanja" | "Mešan signal avtorstva" | "Visok signal AI pisanja",
  "ai_writing_notes": string[],
  "skill_profile": {
    "technical": number,
    "communication": number,
    "experience": number,
    "leadership": number,
    "problem_solving": number,
    "collaboration": number
  }
}

Resume Text:
${resumeText}

Job Title: ${jobTitle}
Job Description: ${jobDescription}
Return JSON only.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
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

    const parsedScore = clampScore(parsed.ats_score);
    const importantConcerns = (parsed.concerns ?? []).filter((concern) =>
      /\b(manjka|manjkajo|ni jasno|nejasn|premalo|omejen|slab|brez|missing|unclear|limited|weak|lack)\b/i.test(
        concern,
      ),
    ).length;
    const calibratedAtsScore = (() => {
      if (parsedScore === null) return null;

      let maxScore = 100;
      const resumeLength = resumeText.trim().length;
      const skillCount = parsed.skills?.length ?? 0;

      if (!hasDetailedJobDescription) maxScore = Math.min(maxScore, 82);
      if (resumeLength < 600) maxScore = Math.min(maxScore, 65);
      if (skillCount <= 3) maxScore = Math.min(maxScore, 70);
      if (importantConcerns >= 2) maxScore = Math.min(maxScore, 79);
      if ((parsed.concerns?.length ?? 0) >= 4) maxScore = Math.min(maxScore, 84);

      return Math.min(parsedScore, maxScore);
    })();

    const normalizedSkillProfile = parsed.skill_profile
      ? {
          technical: parsed.skill_profile.technical ?? 0,
          communication: parsed.skill_profile.communication ?? 0,
          experience: parsed.skill_profile.experience ?? 0,
          leadership: parsed.skill_profile.leadership ?? 0,
          problem_solving: parsed.skill_profile.problem_solving ?? 0,
          collaboration:
            parsed.skill_profile.collaboration ??
            parsed.skill_profile.culture ??
            0,
        }
      : null;

    const baseUpdate = {
      location: parsed.location ?? null,
      years_experience: parsed.years_experience ?? null,
      skills: parsed.skills ?? [],
      ats_score: calibratedAtsScore,
      analysis_summary: parsed.summary ?? null,
      analysis_strengths: parsed.strengths ?? [],
      analysis_concerns: parsed.concerns ?? [],
      skill_profile: normalizedSkillProfile,
      analysis_status: "complete",
    };

    const updateWithEducation = {
      ...baseUpdate,
      education: parsed.education ?? [],
    };

    const updateWithAiWriting = {
      ...updateWithEducation,
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
        updateError.details?.includes("ai_writing") ||
        updateError.message?.includes("education") ||
        updateError.details?.includes("education"))
    ) {
      const retry = await supabase
        .from("candidates")
        .update(updateWithEducation)
        .eq("id", payload.candidateId);
      updateError = retry.error;
    }

    if (
      updateError &&
      (updateError.message?.includes("education") ||
        updateError.details?.includes("education"))
    ) {
      const retry = await supabase
        .from("candidates")
        .update(baseUpdate)
        .eq("id", payload.candidateId);
      updateError = retry.error;
    }

    if (updateError) {
      return new Response(`Failed to update candidate: ${updateError.message}`, {
        status: 500,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    if (payload.candidateId && supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase
        .from("candidates")
        .update({ analysis_status: "failed" })
        .eq("id", payload.candidateId);
    }

    const message = error instanceof Error ? error.message : String(error);
    return new Response(`AI analysis failed: ${message}`, {
      status: 500,
      headers: corsHeaders,
    });
  }
});
