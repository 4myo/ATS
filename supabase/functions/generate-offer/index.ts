// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type GenerateOfferPayload = {
  candidateId: string;
  offerInputs?: Record<string, unknown>;
};

const supabaseUrl =
  Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const openAiApiKey = Deno.env.get("OPENAI_API_KEY") || "";
const openAiModel = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const offerSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "content"],
  properties: {
    title: { type: "string" },
    content: { type: "string" },
  },
};

const getBearerToken = (req: Request) => {
  const authorization = req.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
};

const limitText = (value?: string | null, maxChars = 4500) => {
  const text = (value ?? "").trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[skrajsano]` : text;
};

const allowedInputKeys = [
  "salary",
  "bonus",
  "contractType",
  "startDate",
  "workModel",
  "benefits",
  "acceptanceDeadline",
  "signer",
  "companyName",
  "extraNotes",
  "tone",
];

const sanitizeOfferInputs = (inputs?: Record<string, unknown>) => {
  const sanitized: Record<string, string> = {};

  for (const key of allowedInputKeys) {
    const value = inputs?.[key];
    if (typeof value !== "string") continue;

    const trimmed = value
      .replace(/[<>]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, key === "benefits" || key === "extraNotes" ? 1200 : 240);

    if (trimmed) sanitized[key] = trimmed;
  }

  return sanitized;
};

const formatInputValue = (
  inputs: Record<string, string>,
  key: string,
  placeholder: string,
) => inputs[key] || `[${placeholder}]`;

const extractOpenAiText = (response: any) => {
  if (typeof response?.output_text === "string") return response.output_text;

  const content = response?.output
    ?.flatMap((item: any) => item?.content ?? [])
    ?.map((item: any) => item?.text ?? "")
    ?.join("");

  return typeof content === "string" ? content : "";
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

  let payload: GenerateOfferPayload;
  try {
    payload = (await req.json()) as GenerateOfferPayload;
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

    const authedUserId = authData.user.id;
    const { data: candidate, error: candidateError } = await supabase
      .from("candidates")
      .select(
        "id, user_id, full_name, job_title, stage, location, years_experience, skills, ats_score, analysis_summary, analysis_strengths, analysis_concerns, offer_summary",
      )
      .eq("id", payload.candidateId)
      .eq("user_id", authedUserId)
      .single();

    if (candidateError || !candidate) {
      return new Response("Candidate not found", {
        status: 404,
        headers: corsHeaders,
      });
    }

    if (candidate.stage !== "Offer") {
      return new Response("Candidate must be in Offer stage", {
        status: 409,
        headers: corsHeaders,
      });
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ count: userHourlyCount }, { count: candidateDailyCount }] =
      await Promise.all([
        supabase
          .from("offer_documents")
          .select("id", { count: "exact", head: true })
          .eq("user_id", authedUserId)
          .gte("created_at", oneHourAgo),
        supabase
          .from("offer_documents")
          .select("id", { count: "exact", head: true })
          .eq("user_id", authedUserId)
          .eq("candidate_id", payload.candidateId)
          .gte("created_at", oneDayAgo),
      ]);

    if ((userHourlyCount ?? 0) >= 10 || (candidateDailyCount ?? 0) >= 5) {
      return new Response("Offer generation rate limit reached", {
        status: 429,
        headers: corsHeaders,
      });
    }

    const { data: job } = await supabase
      .from("jobs")
      .select("id, title, type, location, description, status, openings")
      .eq("title", candidate.job_title)
      .eq("user_id", authedUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (job) {
      const { count: acceptedCount } = await supabase
        .from("candidates")
        .select("id", { count: "exact", head: true })
        .eq("user_id", authedUserId)
        .eq("job_title", candidate.job_title)
        .eq("stage", "Accepted");

      const openings = Math.max(1, Number(job.openings ?? 1));
      if ((job.status ?? "active") === "inactive" || (acceptedCount ?? 0) >= openings) {
        return new Response(
          "Cannot generate offer because this job is inactive or already filled.",
          {
            status: 409,
            headers: corsHeaders,
          },
        );
      }
    }

    const offerInputs = sanitizeOfferInputs(payload.offerInputs);

    const prompt = `Prepare a recruiter-editable job offer draft in Slovenian.

Rules:
- Return JSON only with title and content.
- The content must be a complete plain-text offer letter draft.
- Use the Structured offer inputs below where values are provided.
- Do not invent salary, bonus, benefits, start date, legal entity, signer, company name, or contract terms. When a value is missing, keep the matching placeholder in the draft.
- Do not include equity/share participation or probation period sections.
- In the closing signature, put the signer on one line and the company name directly below it. If either value is missing, use the matching placeholder.
- Do not claim the offer has been legally approved.
- Use the requested tone if provided; otherwise use a warm, professional tone.
- Include sections: greeting, role offered, why the candidate is selected, proposed terms placeholders, next steps, acceptance deadline placeholder, closing.
- Keep it concise enough to paste into an email or export as a text document.
- Do not mention protected characteristics or sensitive demographic assumptions.

Structured offer inputs:
Company name: ${formatInputValue(offerInputs, "companyName", "vnesite naziv podjetja")}
Salary: ${formatInputValue(offerInputs, "salary", "vnesite bruto placo ali razpon")}
Bonus: ${formatInputValue(offerInputs, "bonus", "vnesite bonus ali odstranite vrstico")}
Contract type: ${formatInputValue(offerInputs, "contractType", "vnesite tip pogodbe")}
Start date: ${formatInputValue(offerInputs, "startDate", "vnesite datum zacetka")}
Work model/location: ${formatInputValue(offerInputs, "workModel", "vnesite nacin dela")}
Benefits: ${formatInputValue(offerInputs, "benefits", "vnesite benefite")}
Acceptance deadline: ${formatInputValue(offerInputs, "acceptanceDeadline", "vnesite rok za odgovor")}
Signer: ${formatInputValue(offerInputs, "signer", "vnesite podpisnika")}
Tone: ${formatInputValue(offerInputs, "tone", "topel profesionalen")}
Extra recruiter notes: ${formatInputValue(offerInputs, "extraNotes", "brez dodatnih opomb")}

Candidate:
Name: ${candidate.full_name}
Role: ${candidate.job_title}
Location evidence: ${candidate.location ?? "unknown"}
Years experience: ${candidate.years_experience ?? "unknown"}
ATS score: ${candidate.ats_score ?? "not scored"}
Skills: ${(candidate.skills ?? []).join(", ") || "unknown"}
AI summary: ${limitText(candidate.analysis_summary, 1600)}
Strengths: ${(candidate.analysis_strengths ?? []).slice(0, 6).join("; ") || "unknown"}
Concerns for recruiter context only, do not over-emphasize in letter: ${(candidate.analysis_concerns ?? []).slice(0, 4).join("; ") || "none"}
Offer suitability summary: ${limitText(candidate.offer_summary, 900)}

Job:
Title: ${job?.title ?? candidate.job_title}
Type: ${job?.type ?? "unknown"}
Location: ${job?.location ?? "unknown"}
Description: ${limitText(job?.description, 2600)}`;

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
              "You prepare concise, recruiter-editable offer letter drafts. Return strict JSON only.",
          },
          { role: "user", content: prompt },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "offer_document",
            strict: true,
            schema: offerSchema,
          },
        },
        max_output_tokens: 1800,
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
    const parsed = JSON.parse(
      rawText.replace(/```json/gi, "").replace(/```/g, "").trim(),
    );

    const title =
      typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title.trim().slice(0, 180)
        : `Ponudba - ${candidate.full_name}`;
    const content =
      typeof parsed.content === "string" && parsed.content.trim()
        ? parsed.content.trim()
        : "";

    if (!content) {
      throw new Error("Generated offer document was empty.");
    }

    const { data: document, error: insertError } = await supabase
      .from("offer_documents")
      .insert({
        user_id: authedUserId,
        candidate_id: candidate.id,
        title,
        content,
        inputs: offerInputs,
        status: "draft",
        generated_by: authedUserId,
      })
      .select("id, title, content, inputs, status, created_at")
      .single();

    if (insertError || !document) {
      throw new Error(insertError?.message || "Failed to save offer document.");
    }

    return new Response(JSON.stringify({ ok: true, document }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(`Offer generation failed: ${message}`, {
      status: 500,
      headers: corsHeaders,
    });
  }
});
