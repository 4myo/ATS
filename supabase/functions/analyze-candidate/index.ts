// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type AnalyzePayload = {
  candidateId: string;
  jobId?: string;
  resumeText?: string;
  jobTitle?: string;
  jobDescription?: string;
};

type AiAgentSettings = {
  scoring_strictness?: string | null;
  response_tone?: string | null;
  interview_question_style?: string | null;
  ai_writing_sensitivity?: string | null;
  evaluation_focus?: string[] | null;
  custom_instructions?: string | null;
};

const supabaseUrl =
  Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL") || "";
const supabaseKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  "";
const openAiApiKey = Deno.env.get("OPENAI_API_KEY") || "";
const openAiModel = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const maxResumePromptChars = 12000;
const maxJobDescriptionPromptChars = 5000;

const clampScore = (value: unknown) => {
  const score = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
};

const limitPromptText = (text: string, maxChars: number) => {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;

  const headChars = Math.floor(maxChars * 0.72);
  const tailChars = maxChars - headChars;
  return `${trimmed.slice(0, headChars)}

[...besedilo je skrajsano zaradi omejitve porabe API tokenov...]

${trimmed.slice(-tailChars)}`;
};

const redactPersonalData = (text: string) =>
  text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removed]")
    .replace(/\bhttps?:\/\/\S+/gi, "[url removed]")
    .replace(/\b(?:www\.)\S+/gi, "[url removed]")
    .replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, "[phone removed]")
    .replace(
      /\b(?:date of birth|dob|datum rojstva|rojstni datum)\s*[:.-]?\s*\S+(?:\s+\S+){0,2}/gi,
      "[date of birth removed]",
    )
    .replace(
      /\b(?:address|naslov)\s*[:.-]?\s*[^\n\r]+/gi,
      "[address removed]",
    );

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const redactKnownName = (text: string, fullName?: string | null) => {
  const normalizedName = fullName?.trim();
  if (!normalizedName) return text;

  return text.replace(
    new RegExp(`\\b${escapeRegExp(normalizedName)}\\b`, "gi"),
    "[candidate name removed]",
  );
};

const safeInstructionText = (text?: string | null) =>
  (text ?? "")
    .replace(/\s+/g, " ")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 1600);

const labelMap: Record<string, string> = {
  role_critical_skills: "role-critical skills and must-have responsibilities",
  measurable_impact: "specific measurable outcomes, project evidence, and concrete responsibilities",
  seniority: "seniority, ownership scope, and role level",
  transferable_experience: "adjacent and transferable professional experience",
  communication: "job-relevant communication and stakeholder evidence",
  leadership: "job-relevant leadership and ownership evidence",
  certifications: "job-relevant education, licenses, and certifications",
};

const buildAiAgentPreferenceInstructions = (settings?: AiAgentSettings | null) => {
  if (!settings) return "";
                  
  const lines = [
    "Recruiter AI Agent Configuration for this job:",
    "- These settings are active configuration, not decoration. Apply them visibly in scoring, concerns, interview questions, AI-writing signal, and wording.",
    "- These settings must never override fairness, privacy, protected-characteristic, strict JSON, or human-review rules.",
  ];

  const strictness = settings.scoring_strictness || "balanced";
  if (strictness === "strict") {
    lines.push(
      "- Scoring mode: STRICT.",
      "- STRICT scoring changes the rubric materially: direct role-critical evidence is worth more than adjacent evidence; transferable evidence is supporting only.",
      "- In STRICT mode, reserve 85+ for candidates with explicit evidence for most must-have requirements, role-level seniority, and concrete outcomes.",
      "- In STRICT mode, if two or more central requirements are missing or vague, the score should usually stay below 75 even if the candidate has adjacent experience.",
      "- In STRICT mode, call out missing must-have evidence directly in concerns and make interview questions verify those gaps.",
    );
  } else if (strictness === "lenient") {
    lines.push(
      "- Scoring mode: LENIENT.",
      "- LENIENT scoring changes the rubric materially: give more credit to adjacent professional experience, transferable tools, and comparable responsibilities.",
      "- In LENIENT mode, do not punish missing preferred tools heavily when broader evidence shows the candidate can plausibly ramp into the role.",
      "- In LENIENT mode, still keep severe legal/licensing and missing core-responsibility gaps visible.",
    );
  } else {
    lines.push("- Scoring mode: BALANCED. Use the default calibrated rubric.");
  }

  const tone = settings.response_tone || "professional";
  if (tone === "direct") {
    lines.push(
      "- Response tone: direct. Use shorter, evidence-first Slovenian phrasing and avoid softening important gaps.",
    );
  } else if (tone === "supportive") {
    lines.push(
      "- Response tone: supportive. Use constructive Slovenian wording, but still name real gaps clearly.",
    );
  } else {
    lines.push("- Response tone: professional. Use neutral, formal Slovenian recruiter language.");
  }

  const questionStyle = settings.interview_question_style || "practical";
  if (questionStyle === "technical") {
    lines.push(
      "- Interview question style: technical. At least two questions must verify concrete technical/domain competence required by the job.",
    );
  } else if (questionStyle === "behavioral") {
    lines.push(
      "- Interview question style: behavioral. Questions must be scenario-based and focused on job-relevant collaboration, ownership, and decision-making.",
    );
  } else if (questionStyle === "gap_focused") {
    lines.push(
      "- Interview question style: gap-focused. Each question must target a missing must-have, unclear claim, or score-limiting gap.",
    );
  } else {
    lines.push("- Interview question style: practical. Questions should verify hands-on role evidence and real examples.");
  }

  const aiWritingSensitivity = settings.ai_writing_sensitivity || "balanced";
  if (aiWritingSensitivity === "high") {
    lines.push(
      "- AI writing signal sensitivity: high. Increase the score when repeated template language, generic phrasing, or unusually uniform structure appears. Still describe it only as a review cue, not proof.",
    );
  } else if (aiWritingSensitivity === "low") {
    lines.push(
      "- AI writing signal sensitivity: low. Lower the score unless there are strong repeated AI-writing cues. Do not over-call polished professional CV language.",
    );
  } else {
    lines.push("- AI writing signal sensitivity: balanced. Use the default evidence threshold.");
  }

  const focus = (settings.evaluation_focus ?? [])
    .map((item) => labelMap[item] ?? safeInstructionText(item))
    .filter(Boolean);
  if (focus.length) {
    lines.push(
      `- Evaluation focus: materially weight these areas more heavily in score, strengths, concerns, and interview questions: ${focus.join(", ")}.`,
    );
  }

  const customInstructions = safeInstructionText(settings.custom_instructions);
  if (customInstructions) {
    lines.push(`- Recruiter custom instructions: ${customInstructions}`);
  }

  return lines.length > 2 ? lines.join("\n") : "";
};

const getAiWritingLabel = (score: number) => {
  if (score >= 68) return "Visok signal AI pisanja";
  if (score >= 38) return "Mešan signal avtorstva";
  return "Nizek signal AI pisanja";
};

const candidateAnalysisSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "location",
    "years_experience",
    "skills",
    "education",
    "ats_score",
    "summary",
    "strengths",
    "concerns",
    "interview_questions",
    "offer_summary",
    "ai_writing_score",
    "ai_writing_label",
    "ai_writing_notes",
    "skill_profile",
  ],
  properties: {
    location: { type: ["string", "null"] },
    years_experience: { type: ["number", "null"] },
    skills: {
      type: "array",
      items: { type: "string" },
    },
    education: {
      type: "array",
      items: { type: "string" },
    },
    ats_score: {
      type: "number",
      minimum: 0,
      maximum: 100,
    },
    summary: { type: "string" },
    strengths: {
      type: "array",
      items: { type: "string" },
    },
    concerns: {
      type: "array",
      items: { type: "string" },
    },
    interview_questions: {
      type: "array",
      items: { type: "string" },
    },
    offer_summary: { type: "string" },
    ai_writing_score: {
      type: "number",
      minimum: 0,
      maximum: 100,
    },
    ai_writing_label: {
      type: "string",
      enum: [
        "Nizek signal AI pisanja",
        "Mešan signal avtorstva",
        "Visok signal AI pisanja",
      ],
    },
    ai_writing_notes: {
      type: "array",
      items: { type: "string" },
    },
    skill_profile: {
      type: "object",
      additionalProperties: false,
      required: [
        "technical",
        "communication",
        "experience",
        "leadership",
        "problem_solving",
        "collaboration",
      ],
      properties: {
        technical: { type: "number", minimum: 0, maximum: 100 },
        communication: { type: "number", minimum: 0, maximum: 100 },
        experience: { type: "number", minimum: 0, maximum: 100 },
        leadership: { type: "number", minimum: 0, maximum: 100 },
        problem_solving: { type: "number", minimum: 0, maximum: 100 },
        collaboration: { type: "number", minimum: 0, maximum: 100 },
      },
    },
  },
};

const extractOpenAiText = (response: any) => {
  if (typeof response?.output_text === "string") return response.output_text;

  const content = response?.output
    ?.flatMap((item: any) => item?.content ?? [])
    ?.map((item: any) => item?.text ?? "")
    ?.join("");

  return typeof content === "string" ? content : "";
};

const getBearerToken = (req: Request) => {
  const authorization = req.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
};

Deno.serve(async (req) => {
  let authedUserId: string | null = null;

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
      throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars.");
    }

    if (!openAiApiKey) {
      throw new Error("Missing OPENAI_API_KEY env var.");
    }

    if (!payload.candidateId) {
      return new Response("Missing candidateId", {
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
    authedUserId = authData.user.id;

    const { data: candidate, error: fetchError } = await supabase
      .from("candidates")
      .select("id, user_id, full_name, job_title, email, resume_path")
      .eq("id", payload.candidateId)
      .eq("user_id", authedUserId)
      .single();

    if (fetchError || !candidate) {
      return new Response("Candidate not found", {
        status: 404,
        headers: corsHeaders,
      });
    }

    let resumeText = payload.resumeText || "";
    const jobTitle = payload.jobTitle || candidate.job_title || "";
    let jobDescription = payload.jobDescription || "";
    let jobId = payload.jobId || "";

    if (jobId) {
      const { data: selectedJob } = await supabase
        .from("jobs")
        .select("id, title, description")
        .eq("id", jobId)
        .eq("user_id", authedUserId)
        .maybeSingle();

      if (selectedJob) {
        jobDescription = jobDescription || selectedJob.description || "";
      } else {
        jobId = "";
      }
    }

    if ((!jobDescription.trim() || !jobId) && jobTitle.trim()) {
      const { data: latestJob } = await supabase
        .from("jobs")
        .select("id, description")
        .eq("title", jobTitle)
        .eq("user_id", authedUserId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      jobDescription = jobDescription || latestJob?.description || "";
      jobId = jobId || latestJob?.id || "";
    }

    let aiAgentSettings: AiAgentSettings | null = null;
    if (jobId) {
      const { data: settingsData, error: settingsError } = await supabase
        .from("ai_agent_settings")
        .select(
          "scoring_strictness, response_tone, interview_question_style, ai_writing_sensitivity, evaluation_focus, custom_instructions",
        )
        .eq("job_id", jobId)
        .eq("user_id", authedUserId)
        .maybeSingle();

      if (!settingsError && settingsData) {
        aiAgentSettings = settingsData as AiAgentSettings;
      }
    }

    const promptResumeText = limitPromptText(
      redactKnownName(redactPersonalData(resumeText), candidate.full_name),
      maxResumePromptChars,
    );
    const promptJobDescription = limitPromptText(
      jobDescription,
      maxJobDescriptionPromptChars,
    );
    const hasDetailedJobDescription = promptJobDescription.trim().length >= 120;
    const aiAgentPreferenceInstructions =
      buildAiAgentPreferenceInstructions(aiAgentSettings);

    const prompt = `You are an ATS analyzer. Follow these rules:
- Use the Job Title and Job Description as the target role requirements.
- Always write every human-readable response field in Slovenian, regardless of the resume language.
- Keep JSON field names exactly as specified, but translate values such as summary, strengths, concerns, interview_questions, offer_summary, ai_writing_label, and ai_writing_notes into Slovenian.
- Skill names may stay in their common industry form when appropriate (for example React, TypeScript, SQL), but explanations and labels must be Slovenian.
- Extract only the top 10 most relevant skills for the role.
- Keep output useful but compact: summary 100-150 words, offer_summary max 80 words, strengths 5-6 items, concerns 5-7 items, ai_writing_notes max 4 items.
- In the summary, explain the main evidence behind the score, the strongest role-fit signals, and why the score is not higher.
- Compute ats_score (0-100) as a calibrated role-fit score, not as a general candidate quality score.
- Use this weighted rubric:
  role-critical skills and responsibilities 40%,
  relevant years and seniority for the target role 25%,
  adjacent/transferable professional experience 15%,
  concrete evidence quality and measurable outcomes 10%,
  education/certifications only when clearly job-relevant 5%,
  job-relevant collaboration/communication/leadership 5%.
- Be strict about exact-role fit, but do not confuse "not ideal for this role" with "poor candidate".
- Adjacent professional experience counts across all roles. When exact tools, titles, industries, or specializations differ, evaluate transferable domain skills, comparable responsibilities, seniority, stakeholder ownership, process maturity, measurable outcomes, and context overlap.
- Examples of adjacent evidence:
  Software: senior frontend/full-stack/web engineering can support backend/platform fit through API work, databases, Docker, SQL, performance, system design collaboration, production delivery, and cross-functional ownership.
  Architecture/design: architectural drafting, BIM/CAD, construction documentation, permitting, site coordination, client presentations, interior design, urban planning, project coordination, and regulatory knowledge can support related architect/designer/project architect roles even if the exact building type or software differs.
  Marketing: campaign management, content, SEO, paid ads, analytics, social media, brand work, and lead generation can transfer across marketing specialist/manager/growth roles.
  HR/recruiting: sourcing, interviewing, onboarding, HR administration, employee relations, ATS use, and stakeholder coordination can transfer across talent acquisition/HR generalist/people operations roles.
  Sales/customer roles: prospecting, account management, CRM use, negotiation, customer support, onboarding, retention, and success metrics can transfer across sales/customer success/support roles.
- Missing a preferred tool, software package, industry niche, or title should reduce the score; missing several core requirements should cap the score. It should not by itself force a score below 30 when the CV contains substantial adjacent professional evidence.
- Most real candidates should fall between 40 and 85 unless the CV contains very little job-relevant or adjacent evidence.
- Use fine-grained scoring. If one candidate would be slightly stronger than another for the same role, reflect that with a 1-5 point difference. Do not cluster different good candidates at the same number such as 84 unless their evidence is genuinely equivalent.
- Score bands:
  95-100: exceptional match; all must-have requirements are explicitly evidenced, relevant years are strong, achievements are specific/measurable, and no important gaps are present.
  85-94: strong match; most must-have requirements are evidenced, with only minor gaps.
  70-84: reasonable match; several relevant requirements are evidenced, but there are noticeable gaps or weaker proof.
  50-69: partial match; some relevant evidence exists, but important requirements are missing or unclear.
  35-49: weak but adjacent match; limited direct evidence for the role, but meaningful transferable experience exists.
  0-34: poor match; little or no relevant or transferable evidence for the role.
- Score caps:
  If the Job Description is missing or too generic, ats_score must not exceed 82.
  If fewer than half of the must-have skills are explicitly evidenced, ats_score must not exceed 69.
  If relevant work experience is missing or unclear, ats_score must not exceed 59.
  If the CV has no specific projects, measurable outcomes, certifications, or concrete responsibilities, ats_score must not exceed 84.
  If there are two or more severe concerns about legal/licensing requirements, missing required qualifications, or missing core responsibilities, ats_score must not exceed 82.
  Multiple minor or medium concerns should reduce the score gradually, but should not automatically cap a strong candidate below 85.
- Score floors:
  If the candidate has 5+ years of professional experience in the same broad function plus at least two adjacent job-relevant tools, responsibilities, domains, or outcomes, ats_score should usually be at least 35, even when exact requirements are missing.
  If the candidate has 7+ years of adjacent professional experience plus evidence of delivering comparable work, owning stakeholders/projects, using related tools, or working in a similar domain, ats_score should usually be at least 40 unless the target role has a genuine legal/licensing requirement or the CV evidence is too vague to verify.
  Do not apply these floors for fabricated/empty CVs, CVs with almost no connection to the target role, or roles where a missing license/certification legally prevents the person from performing the job.
- Education:
  Treat education as a small supporting signal unless the job description explicitly marks a degree as a hard legal or contractual requirement.
  Missing a master's degree may be a concern, but it should not dominate the score when substantial role-relevant work evidence exists.
- Concerns must include missing or weakly evidenced key requirements, not only soft wording.
- Provide strengths and concerns as evidence-backed Slovenian bullet phrases. Each item should mention the evidence or impact, not just a generic label.
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
- Provide exactly 3 interview_questions in Slovenian for an interviewer.
- Each interview question must be tailored to the Job Description and the candidate's CV evidence, focused on verifying key requirements, gaps, concrete experience, or measurable impact.
- Interview questions must be open-ended, practical, concise, and must not ask about or imply protected characteristics.
- Provide offer_summary as a short Slovenian recruiter-facing paragraph explaining why this candidate is suitable enough to prepare an offer, based only on job-relevant CV evidence and the target role.

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
  "interview_questions": string[],
  "offer_summary": string,
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
${promptResumeText}

Job Title: ${jobTitle}
Job Description: ${promptJobDescription}
${aiAgentPreferenceInstructions ? `\n${aiAgentPreferenceInstructions}\n` : ""}
Return JSON only.`;

    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: openAiModel,
        input: [
          {
            role: "system",
            content:
              "You are a careful ATS analysis engine. Return only the requested structured JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "candidate_analysis",
            strict: true,
            schema: candidateAnalysisSchema,
          },
        },
        max_output_tokens: 3072,
      }),
    });

    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text();
      throw new Error(
        `OpenAI API error ${openAiResponse.status}: ${
          errorText || openAiResponse.statusText
        }`,
      );
    }

    const responseJson = await openAiResponse.json();
    const rawText = extractOpenAiText(responseJson) || "{}";
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
      interview_questions?: string[];
      offer_summary?: string;
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
        .eq("id", payload.candidateId)
        .eq("user_id", authedUserId);

      return new Response(`Failed to parse AI response: ${rawText}`, {
        status: 422,
        headers: corsHeaders,
      });
    }

    const parsedScore = clampScore(parsed.ats_score);
    const scoringStrictness = aiAgentSettings?.scoring_strictness || "balanced";
    const aiWritingSensitivity =
      aiAgentSettings?.ai_writing_sensitivity || "balanced";
    const concernTexts = parsed.concerns ?? [];
    const severeConcerns = concernTexts.filter((concern) =>
      /\b(licenc|zakonsk|legal|obvezn|zahtevan|zahtevana|zahtevano|must-have|hard requirement|brez relevantn|no relevant|missing required|manjka zahtev|manjkajo zahtev)\b/i.test(
        concern,
      ),
    ).length;
    const gapConcerns = concernTexts.filter((concern) =>
      /\b(manjka|manjkajo|pomanjkanj|ni jasno|nejasn|premalo|omejen|omejena|omejeno|nepopoln|potrebno|brez|missing|unclear|limited|weak|lack)\b/i.test(
        concern,
      ),
    ).length;
    const calibratedAtsScore = (() => {
      if (parsedScore === null) return null;

      let maxScore = 100;
      let score = parsedScore;
      const resumeLength = promptResumeText.trim().length;
      const skillCount = parsed.skills?.length ?? 0;

      if (!hasDetailedJobDescription) maxScore = Math.min(maxScore, 82);
      if (resumeLength < 600) maxScore = Math.min(maxScore, 65);
      if (skillCount <= 3) maxScore = Math.min(maxScore, 70);
      if (severeConcerns >= 2) maxScore = Math.min(maxScore, 82);
      if (severeConcerns === 1) maxScore = Math.min(maxScore, 88);
      if (gapConcerns >= 5) maxScore = Math.min(maxScore, 90);

      if (scoringStrictness === "strict") {
        const strictPenalty = Math.min(
          22,
          6 + severeConcerns * 5 + gapConcerns * 2 + (!hasDetailedJobDescription ? 4 : 0),
        );
        score -= strictPenalty;

        if (gapConcerns >= 3) maxScore = Math.min(maxScore, 78);
        if (severeConcerns >= 1) maxScore = Math.min(maxScore, 74);
        if (skillCount <= 5) maxScore = Math.min(maxScore, 76);
      } else if (scoringStrictness === "lenient") {
        const lenientBoost =
          severeConcerns === 0
            ? Math.min(8, 3 + Math.max(0, 3 - gapConcerns))
            : Math.min(3, Math.max(0, 2 - severeConcerns));
        score += lenientBoost;

        if (hasDetailedJobDescription && severeConcerns === 0) {
          maxScore = Math.min(100, maxScore + 4);
        }
      }

      return Math.max(0, Math.min(Math.round(score), maxScore));
    })();

    const calibratedAiWritingScore = (() => {
      const baseScore = clampScore(parsed.ai_writing_score);
      if (baseScore === null) return null;

      if (aiWritingSensitivity === "high") {
        return Math.min(100, baseScore + 12);
      }

      if (aiWritingSensitivity === "low") {
        return Math.max(0, baseScore - 12);
      }

      return baseScore;
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
      ai_writing_score: calibratedAiWritingScore,
      ai_writing_label:
        calibratedAiWritingScore == null
          ? parsed.ai_writing_label ?? null
          : getAiWritingLabel(calibratedAiWritingScore),
      ai_writing_notes: parsed.ai_writing_notes ?? [],
    };

    const updateWithInterviewQuestions = {
      ...updateWithAiWriting,
      interview_questions: (parsed.interview_questions ?? []).slice(0, 3),
    };

    const updateWithOfferSummary = {
      ...updateWithInterviewQuestions,
      offer_summary: parsed.offer_summary ?? null,
    };

    let { error: updateError } = await supabase
      .from("candidates")
      .update(updateWithOfferSummary)
      .eq("id", payload.candidateId)
      .eq("user_id", authedUserId);

    if (
      updateError &&
      (updateError.message?.includes("offer_summary") ||
        updateError.details?.includes("offer_summary"))
    ) {
      const retry = await supabase
        .from("candidates")
        .update(updateWithInterviewQuestions)
        .eq("id", payload.candidateId)
        .eq("user_id", authedUserId);
      updateError = retry.error;
    }

    if (
      updateError &&
      (updateError.message?.includes("interview_questions") ||
        updateError.details?.includes("interview_questions"))
    ) {
      const retry = await supabase
        .from("candidates")
        .update(updateWithAiWriting)
        .eq("id", payload.candidateId)
        .eq("user_id", authedUserId);
      updateError = retry.error;
    }

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
        .eq("id", payload.candidateId)
        .eq("user_id", authedUserId);
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
        .eq("id", payload.candidateId)
        .eq("user_id", authedUserId);
      updateError = retry.error;
    }

    if (updateError) {
      return new Response(`Failed to update candidate: ${updateError.message}`, {
        status: 500,
        headers: corsHeaders,
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        settingsApplied: Boolean(aiAgentSettings),
        scoringStrictness,
        aiWritingSensitivity,
      }),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error) {
    if (payload.candidateId && authedUserId && supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
      });
      await supabase
        .from("candidates")
        .update({ analysis_status: "failed" })
        .eq("id", payload.candidateId)
        .eq("user_id", authedUserId);
    }

    const message = error instanceof Error ? error.message : String(error);
    return new Response(`AI analysis failed: ${message}`, {
      status: 500,
      headers: corsHeaders,
    });
  }
});
