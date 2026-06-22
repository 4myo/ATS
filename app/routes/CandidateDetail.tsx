import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useParams, Link, useLocation, useNavigate } from "react-router";
import type { Stage } from "../store";
import { supabase } from "../lib/supabase";
import { ScoreRing } from '../components/ScoreRing';
import {
  ArrowLeft, ThumbsUp, ThumbsDown,
  CheckCircle, XCircle, Clock, Bot, FileText, Eye, Loader2, Upload,
  Link as LinkIcon, Mail, MapPin, Phone, Wrench, ChevronDown, AlertTriangle, Save
} from 'lucide-react';
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer 
} from 'recharts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Textarea } from "../components/ui/textarea";
import {
  OfferDraftDialog,
} from "../components/OfferDraftDialog";
import { OfferPreviewDialog } from "../components/OfferPreviewDialog";
import { ObjectPageShell, type ObjectPageAnchor } from "../components/shell/ObjectPageShell";
import { WorkflowStepper } from "../components/shell/WorkflowStepper";
import {
  checkTransition,
  isTerminalStage,
  nextStage as getNextStage,
} from "../lib/candidateWorkflow";
import { scoreBand, scoreBandText, scoreBandChip } from "../lib/score";
import { useConfirm } from "../lib/confirm";
import { useI18n } from "../lib/i18n";
import { updateCachedApplicants } from "../lib/candidateListCache";
import { enqueueAiAnalysisRetry } from "../lib/aiAnalysisQueue";
import { convertPdfToImage, extractPdfText } from "../lib/pdf";
import {
  getJobCapacityForTitle,
  increaseJobOpeningsForTitle,
  syncJobStatusForTitle,
} from "../lib/jobCache";
import {
  fetchLinkedCandidateTranscripts,
  type LinkedCandidateTranscript,
} from "../lib/interviewTranscriptLinks";
import { type OfferDocument, type OfferInputs } from "../lib/offerDocument";
import { logActivityEvent } from "../lib/activityLog";
import {
  getLocationPath,
  getPreviousAppNavigationPath,
} from "../lib/appNavigationHistory";

type OfferChecklist = {
  interviewCompleted: boolean;
  referencesChecked: boolean;
  termsAligned: boolean;
  internalApproval: boolean;
  offerSent: boolean;
};

type CandidateDetailRecord = {
  id: string;
  full_name: string;
  job_title: string;
  stage: Stage;
  email: string | null;
  location: string | null;
  years_experience: number | null;
  ats_score: number | null;
  analysis_status: "not_analyzed" | "pending_ai" | "complete" | "failed" | null;
  skills: string[] | null;
  analysis_summary: string | null;
  analysis_strengths: string[] | null;
  analysis_concerns: string[] | null;
  resume_path: string | null;
  resume_preview_url: string | null;
  ai_writing_score: number | null;
  ai_writing_label: string | null;
  ai_writing_notes: string[] | null;
  interview_questions: string[] | null;
  interview_analysis_status: "none" | "pending" | "complete" | "failed" | null;
  interview_analysis_score: number | null;
  interview_analysis_summary: string | null;
  interview_analysis_strengths: string[] | null;
  interview_analysis_concerns: string[] | null;
  interview_analysis_questions: string[] | null;
  interview_analysis_transcript_ids: string[] | null;
  interview_analysis_updated_at: string | null;
  offer_summary: string | null;
  offer_checklist: Partial<OfferChecklist> | null;
  offer_outcome: string | null;
  offer_sent_at: string | null;
  offer_response_due_at: string | null;
  skill_profile: Record<string, number> | null;
};

type JobCapacity = {
  id: string;
  title: string;
  status: string;
  openings: number;
  acceptedCount: number;
};

const defaultOfferChecklist: OfferChecklist = {
  interviewCompleted: false,
  referencesChecked: false,
  termsAligned: false,
  internalApproval: false,
  offerSent: false,
};

const baseCandidateSelect =
  "id, full_name, job_title, stage, email, location, years_experience, ats_score, analysis_status, skills, analysis_summary, analysis_strengths, analysis_concerns, resume_path, resume_preview_url, skill_profile";

const candidateSelectWithAiWriting =
  `${baseCandidateSelect}, ai_writing_score, ai_writing_label, ai_writing_notes`;

const candidateSelectWithInterviewQuestions =
  `${candidateSelectWithAiWriting}, interview_questions`;

const candidateSelectWithOfferPreparation =
  `${candidateSelectWithInterviewQuestions}, offer_summary, offer_checklist, offer_outcome, offer_sent_at, offer_response_due_at`;

const extractFirstUrl = (value?: string | null) =>
  value?.match(/https?:\/\/[^\s)]+/i)?.[0]?.replace(/[.,;]+$/, "") ?? null;

const extractPhone = (value?: string | null) =>
  value?.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0]?.replace(/\s+/g, " ").trim() ?? null;

export default function CandidateDetail() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { t, tt, stageLabel } = useI18n();
  const confirm = useConfirm();
  const resumeInputRef = useRef<HTMLInputElement | null>(null);
  const [candidate, setCandidate] = useState<CandidateDetailRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStage, setIsUpdatingStage] = useState(false);
  const [isOpeningCv, setIsOpeningCv] = useState(false);
  const [isUploadingCv, setIsUploadingCv] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  const [cvError, setCvError] = useState<string | null>(null);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [offerDocument, setOfferDocument] = useState<OfferDocument | null>(null);
  const [jobCapacity, setJobCapacity] = useState<JobCapacity | null>(null);
  const [linkedTranscripts, setLinkedTranscripts] = useState<LinkedCandidateTranscript[]>([]);
  const [isAnalyzingInterview, setIsAnalyzingInterview] = useState(false);
  const [interviewAnalysisError, setInterviewAnalysisError] = useState<string | null>(null);
  const [isGeneratingOffer, setIsGeneratingOffer] = useState(false);
  const [isOfferPreviewOpen, setIsOfferPreviewOpen] = useState(false);
  const [isOfferDraftOpen, setIsOfferDraftOpen] = useState(false);
  const [isInterviewStartOpen, setIsInterviewStartOpen] = useState(false);
  const [manualInterviewText, setManualInterviewText] = useState("");
  const [isCreatingInterviewTranscript, setIsCreatingInterviewTranscript] = useState(false);
  const [pendingOfferSentAfterDraft, setPendingOfferSentAfterDraft] = useState(false);
  const [canRenderDesktopAside, setCanRenderDesktopAside] = useState(false);
  const [isReanalyzingCandidate, setIsReanalyzingCandidate] = useState(false);
  const [showFullAnalysis, setShowFullAnalysis] = useState(false);
  const [activeCandidateSection, setActiveCandidateSection] = useState("overview");
  const [isSavingCandidateWork, setIsSavingCandidateWork] = useState(false);
  const [isCandidateWorkSaved, setIsCandidateWorkSaved] = useState(false);
  const returnToFromState =
    typeof location.state?.returnTo === "string" ? location.state.returnTo : null;
  const returnToFromQuery = new URLSearchParams(location.search).get("returnTo");
  const candidateBackPath = [returnToFromState, returnToFromQuery].find(
    (path) => path?.startsWith("/") && !path.startsWith("//"),
  ) ?? "/applicants";
  const goBackToPreviousAppLocation = () => {
    navigate(
      getPreviousAppNavigationPath(getLocationPath(location), candidateBackPath),
    );
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1280px)");
    const syncDesktopAside = () => setCanRenderDesktopAside(mediaQuery.matches);

    syncDesktopAside();
    mediaQuery.addEventListener("change", syncDesktopAside);

    return () => {
      mediaQuery.removeEventListener("change", syncDesktopAside);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadCandidate = async () => {
      if (!id) return;

      const result = await supabase
        .from("candidates_secure")
        .select(candidateSelectWithOfferPreparation)
        .eq("id", id)
        .single();

      const shouldRetryWithoutOfferPreparation =
        result.error &&
        (result.error.message?.includes("offer_") ||
          result.error.details?.includes("offer_"));

      const interviewResult = shouldRetryWithoutOfferPreparation
        ? await supabase
            .from("candidates_secure")
            .select(candidateSelectWithInterviewQuestions)
            .eq("id", id)
            .single()
        : result;

      const shouldRetryWithoutInterviewQuestions =
        interviewResult.error &&
        (interviewResult.error.message?.includes("interview_questions") ||
          interviewResult.error.details?.includes("interview_questions"));

      const aiWritingResult = shouldRetryWithoutInterviewQuestions
        ? await supabase
            .from("candidates_secure")
            .select(candidateSelectWithAiWriting)
            .eq("id", id)
            .single()
        : interviewResult;

      const shouldRetryWithoutAiWriting =
        aiWritingResult.error &&
        (aiWritingResult.error.message?.includes("ai_writing") ||
          aiWritingResult.error.details?.includes("ai_writing"));

      const fallbackResult = shouldRetryWithoutAiWriting
        ? await supabase
            .from("candidates_secure")
            .select(baseCandidateSelect)
            .eq("id", id)
            .single()
        : aiWritingResult;

      if (!isMounted) return;

      if (fallbackResult.error) {
        setCandidate(null);
        setIsLoading(false);
        return;
      }

      const loadedStage = (fallbackResult.data.stage as Stage) ?? "Applied";
      const shouldMarkReviewed = loadedStage === "Applied";
      const nextCandidate = {
        ai_writing_score: null,
        ai_writing_label: null,
        ai_writing_notes: [],
        interview_questions: [],
        interview_analysis_status: "none",
        interview_analysis_score: null,
        interview_analysis_summary: null,
        interview_analysis_strengths: [],
        interview_analysis_concerns: [],
        interview_analysis_questions: [],
        interview_analysis_transcript_ids: [],
        interview_analysis_updated_at: null,
        offer_summary: null,
        offer_checklist: defaultOfferChecklist,
        offer_outcome: "pending",
        offer_sent_at: null,
        offer_response_due_at: null,
        ...fallbackResult.data,
        stage: shouldMarkReviewed ? "Screening" : loadedStage,
      } as CandidateDetailRecord;

      setCandidate(nextCandidate);
      setIsCandidateWorkSaved(false);
      setIsLoading(false);

      const { data: interviewAnalysisData, error: interviewAnalysisError } =
        await supabase
          .from("candidates_secure")
          .select(
            "interview_analysis_status, interview_analysis_score, interview_analysis_summary, interview_analysis_strengths, interview_analysis_concerns, interview_analysis_questions, interview_analysis_transcript_ids, interview_analysis_updated_at",
          )
          .eq("id", id)
          .single();

      if (
        isMounted &&
        !interviewAnalysisError &&
        interviewAnalysisData
      ) {
        setCandidate((current) =>
          current
            ? {
                ...current,
                ...interviewAnalysisData,
              }
            : current,
        );
      }

      const capacity = await getJobCapacityForTitle(nextCandidate.job_title);
      if (isMounted) {
        setJobCapacity(capacity);
      }

      if (nextCandidate.stage === "Offer") {
        const { data: latestDocument } = await supabase
          .from("offer_documents")
          .select("id, title, content, inputs, status, created_at")
          .eq("candidate_id", nextCandidate.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (isMounted && latestDocument) {
          setOfferDocument(latestDocument as OfferDocument);
        }
      }

      if (shouldMarkReviewed) {
        const { error } = await supabase
          .from("candidates")
          .update({ stage: "Screening" })
          .eq("id", fallbackResult.data.id);

        if (error && isMounted) {
          setStageError(error.message || t("failedStageUpdate"));
        } else {
          updateCachedApplicants((applicants) =>
            applicants.map((applicant) =>
              applicant.id === fallbackResult.data.id
                ? { ...applicant, stage: "Screening" }
                : applicant,
            ),
          );
          void logActivityEvent({
            action: "candidate_stage_changed",
            entityType: "candidate",
            entityId: fallbackResult.data.id,
            entityLabel: fallbackResult.data.full_name,
            fromValue: "Applied",
            toValue: "Screening",
            metadata: { job_title: fallbackResult.data.job_title, automatic: true },
          });
        }
      }
    };

    loadCandidate();

    return () => {
      isMounted = false;
    };
  }, [id]);

  useEffect(() => {
    let isMounted = true;

    const loadLinkedTranscripts = async () => {
      if (!candidate?.id) {
        setLinkedTranscripts([]);
        return;
      }

      const linkedByCandidate = await fetchLinkedCandidateTranscripts([candidate.id]);
      if (isMounted) {
        setLinkedTranscripts(linkedByCandidate[candidate.id] ?? []);
      }
    };

    void loadLinkedTranscripts();

    return () => {
      isMounted = false;
    };
  }, [candidate?.id]);

  const radarData = useMemo(() => {
    if (!candidate) {
      return [
        { subject: t("technical"), A: 0, fullMark: 100 },
        { subject: t("collaboration"), A: 0, fullMark: 100 },
        { subject: t("communication"), A: 0, fullMark: 100 },
        { subject: t("experience"), A: 0, fullMark: 100 },
        { subject: t("leadership"), A: 0, fullMark: 100 },
        { subject: t("problemSolving"), A: 0, fullMark: 100 },
      ];
    }

    const profile = candidate.skill_profile;
    if (profile) {
      return [
        { subject: t("technical"), A: profile.technical ?? 0, fullMark: 100 },
        {
          subject: t("collaboration"),
          A: profile.collaboration ?? profile.culture ?? 0,
          fullMark: 100,
        },
        { subject: t("communication"), A: profile.communication ?? 0, fullMark: 100 },
        { subject: t("experience"), A: profile.experience ?? 0, fullMark: 100 },
        { subject: t("leadership"), A: profile.leadership ?? 0, fullMark: 100 },
        { subject: t("problemSolving"), A: profile.problem_solving ?? 0, fullMark: 100 },
      ];
    }

    const score = candidate.ats_score ?? 0;
    const years = Number(candidate.years_experience ?? 0);

    return [
      { subject: t("technical"), A: score, fullMark: 100 },
      { subject: t("collaboration"), A: Math.max(score - 10, 0), fullMark: 100 },
      {
        subject: t("communication"),
        A: Math.min(score + 5, 100),
        fullMark: 100,
      },
      { subject: t("experience"), A: Math.min(years * 10, 100), fullMark: 100 },
      { subject: t("leadership"), A: Math.max(score - 20, 0), fullMark: 100 },
      { subject: t("problemSolving"), A: Math.max(score - 5, 0), fullMark: 100 },
    ];
  }, [candidate, t]);

  const aiWritingSignal = useMemo(() => {
    const hasAnalyzedCv =
      Boolean(candidate?.resume_path) && candidate?.analysis_status === "complete";

    if (!hasAnalyzedCv || typeof candidate?.ai_writing_score !== "number") {
      return null;
    }

    const score = Math.max(
      0,
      Math.min(100, Math.round(Number(candidate.ai_writing_score))),
    );

    return {
      score,
      label:
        candidate.ai_writing_label ??
        (score >= 68
          ? t("highAiWritingSignal")
          : score >= 38
            ? t("mixedAuthorshipSignal")
            : t("lowAiWritingSignal")),
      tone: score >= 68 ? "high" : score >= 38 ? "medium" : "low",
      notes:
        candidate?.ai_writing_notes?.length
          ? candidate.ai_writing_notes
          : [t("aiWritingSignalNoNotes")],
    };
  }, [candidate, t]);

  const interviewQuestions = useMemo(
    () => (candidate?.interview_questions ?? []).slice(0, 3),
    [candidate],
  );
  const hasStoredInterviewAnalysis =
    candidate?.interview_analysis_status === "complete" &&
    candidate.interview_analysis_score != null;
  const hasLinkedTranscripts = linkedTranscripts.length > 0;
  const hasCvAnalysis = candidate?.analysis_status === "complete";
  const hasCandidateAiScore =
    candidate?.analysis_status === "complete" && typeof candidate.ats_score === "number";
  const canReanalyzeCandidate =
    Boolean(candidate?.resume_path) &&
    (candidate?.analysis_status === "complete" || candidate?.analysis_status === "failed");
  const displayedCombinedScore = hasStoredInterviewAnalysis
    ? candidate?.interview_analysis_score ?? null
    : null;
  // Single source of truth for the headline score: prefer the most complete
  // basis (CV + interview) once it exists, otherwise the CV-only score. The
  // delta turns a lower post-interview score into an insight, not a conflict.
  const cvOnlyScore =
    hasCandidateAiScore && typeof candidate?.ats_score === "number"
      ? Math.round(candidate.ats_score)
      : null;
  const headlineScore =
    displayedCombinedScore != null ? Math.round(displayedCombinedScore) : cvOnlyScore;
  const headlineScoreBasis =
    displayedCombinedScore != null ? tt("CV + razgovor") : tt("Samo CV");
  const headlineScoreDelta =
    displayedCombinedScore != null && cvOnlyScore != null
      ? Math.round(displayedCombinedScore) - cvOnlyScore
      : null;
  const displayedInterviewSummary =
    candidate?.interview_analysis_summary || "";
  const displayedInterviewStrengths =
    candidate?.interview_analysis_strengths?.length
      ? candidate.interview_analysis_strengths
      : [];
  const displayedInterviewConcerns =
    candidate?.interview_analysis_concerns?.length
      ? candidate.interview_analysis_concerns
      : [];
  const displayedInterviewQuestions =
    candidate?.interview_analysis_questions?.length
      ? candidate.interview_analysis_questions
      : [];

  // --- Decision surface: verdict + merged (de-duplicated) strengths/concerns ---
  const normalizeText = (value: string) => value.trim().toLowerCase();
  const firstSentence = (text: string) => {
    const trimmed = text.trim();
    const match = trimmed.match(/^.*?[.!?](\s|$)/);
    return match ? match[0].trim() : trimmed;
  };
  const interviewConfirmedSet = new Set(displayedInterviewStrengths.map(normalizeText));
  const interviewOpenSet = new Set(displayedInterviewConcerns.map(normalizeText));
  const mergedStrengths = (() => {
    const cv = candidate?.analysis_strengths ?? [];
    const seen = new Set(cv.map(normalizeText));
    const extra = displayedInterviewStrengths.filter((item) => !seen.has(normalizeText(item)));
    return [...cv, ...extra].map((text) => ({
      text,
      confirmed: interviewConfirmedSet.has(normalizeText(text)),
    }));
  })();
  const mergedConcerns = (() => {
    const cv = candidate?.analysis_concerns ?? [];
    const seen = new Set(cv.map(normalizeText));
    const extra = displayedInterviewConcerns.filter((item) => !seen.has(normalizeText(item)));
    return [...cv, ...extra].map((text) => ({
      text,
      open: interviewOpenSet.has(normalizeText(text)),
    }));
  })();
  const verdictBand = headlineScore == null ? null : scoreBand(headlineScore);
  const verdictLabel =
    verdictBand === "strong"
      ? tt("Primeren za razgovor")
      : verdictBand === "medium"
        ? tt("Potrebuje dodatno potrditev")
        : verdictBand === "weak"
          ? tt("Pod pragom")
          : null;
  const verdictReason =
    (verdictBand === "weak"
      ? candidate?.analysis_concerns?.[0] ?? mergedConcerns[0]?.text
      : candidate?.analysis_strengths?.[0] ?? mergedStrengths[0]?.text) ??
    (candidate?.analysis_summary ? firstSentence(candidate.analysis_summary) : null);
  const offerChecklist = useMemo(
    () => ({
      ...defaultOfferChecklist,
      ...(candidate?.offer_checklist ?? {}),
    }),
    [candidate],
  );
  const candidateSourceUrl = useMemo(
    () => extractFirstUrl(candidate?.analysis_summary),
    [candidate?.analysis_summary],
  );
  const candidatePhone = useMemo(
    () => extractPhone(candidate?.analysis_summary),
    [candidate?.analysis_summary],
  );
  const isOfferStage = candidate?.stage === "Offer" || candidate?.stage === "Accepted";
  useEffect(() => {
    if (
      (activeCandidateSection === "offer" && !isOfferStage) ||
      (activeCandidateSection === "signal" && !canRenderDesktopAside)
    ) {
      setActiveCandidateSection("overview");
    }
  }, [activeCandidateSection, canRenderDesktopAside, isOfferStage]);
  const defaultInterviewTranscriptTitle = candidate
    ? `${candidate.full_name} razgovor ${linkedTranscripts.length + 1}`
    : "Razgovor 1";
  const isJobAtCapacity = Boolean(
    jobCapacity && jobCapacity.acceptedCount >= jobCapacity.openings,
  );
  const isJobClosedForCandidate = Boolean(
    jobCapacity &&
      ((jobCapacity.status ?? "active") === "inactive" || isJobAtCapacity) &&
      candidate?.stage !== "Accepted",
  );
  const todayIso = new Date().toISOString().slice(0, 10);
  const offerChecklistItems: Array<{ key: keyof OfferChecklist; label: string }> = [
    { key: "interviewCompleted", label: t("offerChecklistInterviewCompleted") },
    { key: "referencesChecked", label: t("offerChecklistReferencesChecked") },
    { key: "termsAligned", label: t("offerChecklistTermsAligned") },
    { key: "internalApproval", label: t("offerChecklistInternalApproval") },
    { key: "offerSent", label: t("offerChecklistOfferSent") },
  ];

  const saveCandidateWork = async () => {
    if (!candidate) return;

    setIsSavingCandidateWork(true);
    setStageError(null);
    setOfferError(null);

    const { error } = await supabase
      .from("candidates")
      .update({
        stage: candidate.stage,
        offer_checklist: offerChecklist,
        offer_outcome: candidate.offer_outcome ?? "pending",
        offer_sent_at: candidate.offer_sent_at,
        offer_response_due_at: candidate.offer_response_due_at,
      })
      .eq("id", candidate.id);

    setIsSavingCandidateWork(false);
    if (error) {
      setStageError(`Dela ni bilo mogoče shraniti: ${error.message}`);
      return;
    }

    setIsCandidateWorkSaved(true);
  };

  const analyzeCvWithInterview = async () => {
    if (!candidate) return;

    const transcriptText = linkedTranscripts
      .map((transcript) => transcript.transcriptText.trim())
      .filter(Boolean)
      .join("\n\n---\n\n");

    if (!transcriptText) {
      setInterviewAnalysisError("Kandidat še nima povezanega transkripta z besedilom.");
      return;
    }

    setIsAnalyzingInterview(true);
    setInterviewAnalysisError(null);

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw new Error(t("signedInRequiredCandidate"));
      }

      setCandidate((current) =>
        current ? { ...current, interview_analysis_status: "pending" } : current,
      );

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-candidate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sessionData.session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            candidateId: candidate.id,
            jobTitle: candidate.job_title,
            analysisMode: "cv_interview",
            transcriptText,
            transcriptIds: linkedTranscripts.map((transcript) => transcript.id),
          }),
        },
      );

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = await response.json();
      const analysis = payload?.interviewAnalysis;
      if (!analysis) {
        throw new Error("AI analiza razgovora ni vrnila rezultata.");
      }

      setCandidate((current) =>
        current
          ? {
              ...current,
              interview_analysis_status: "complete",
              interview_analysis_score: analysis.interview_analysis_score ?? null,
              interview_analysis_summary: analysis.interview_analysis_summary ?? "",
              interview_analysis_strengths: analysis.interview_analysis_strengths ?? [],
              interview_analysis_concerns: analysis.interview_analysis_concerns ?? [],
              interview_analysis_questions: analysis.interview_analysis_questions ?? [],
              interview_analysis_transcript_ids:
                analysis.interview_analysis_transcript_ids ?? [],
              interview_analysis_updated_at:
                analysis.interview_analysis_updated_at ?? new Date().toISOString(),
            }
          : current,
      );

      if (payload?.stored === false) {
        setInterviewAnalysisError(
          "Analiza je izračunana za ta pogled, vendar v bazi še manjkajo interview_analysis stolpci iz docs/supabase-schema.sql.",
        );
      }
    } catch (error) {
      setCandidate((current) =>
        current ? { ...current, interview_analysis_status: "failed" } : current,
      );
      setInterviewAnalysisError(
        error instanceof Error ? error.message : "AI analiza razgovora ni uspela.",
      );
    } finally {
      setIsAnalyzingInterview(false);
    }
  };

  const reanalyzeCandidate = async () => {
    if (!candidate) return;
    if (!candidate.resume_path) {
      setCvError(t("reanalyzeNeedsCv"));
      return;
    }

    setIsReanalyzingCandidate(true);
    setCvError(null);
    setCandidate((current) =>
      current ? { ...current, analysis_status: "pending_ai" } : current,
    );
    updateCachedApplicants((applicants) =>
      applicants.map((applicant) =>
        applicant.id === candidate.id
          ? { ...applicant, analysisStatus: "pending_ai" }
          : applicant,
      ),
    );

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw new Error(t("signedInRequiredCandidate"));
      }

      const { error: statusError } = await supabase
        .from("candidates")
        .update({ analysis_status: "pending_ai" })
        .eq("id", candidate.id);

      if (statusError) {
        throw statusError;
      }

      const { data: signedResume, error: signedResumeError } =
        await supabase.storage
          .from("resumes")
          .createSignedUrl(candidate.resume_path, 60 * 10);

      if (signedResumeError || !signedResume?.signedUrl) {
        throw signedResumeError ?? new Error(t("failedCvOpen"));
      }

      const resumeResponse = await fetch(signedResume.signedUrl);
      if (!resumeResponse.ok) {
        throw new Error(t("failedCvOpen"));
      }

      const resumeBlob = await resumeResponse.blob();
      const resumeFile = new File([resumeBlob], "candidate-resume.pdf", {
        type: resumeBlob.type || "application/pdf",
      });
      const resumeText = (await extractPdfText(resumeFile)).trim();
      if (!resumeText) {
        throw new Error(t("resumeExtractFailed"));
      }

      const analysisResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-candidate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            candidateId: candidate.id,
            jobTitle: candidate.job_title,
            resumeText,
          }),
        },
      );

      if (!analysisResponse.ok) {
        const message = await analysisResponse.text();
        enqueueAiAnalysisRetry({
          candidateId: candidate.id,
          candidateName: candidate.full_name,
          jobTitle: candidate.job_title,
          jobDescription: "",
          resumeText,
          lastError: message || t("analysisQueuedForRetry"),
        });
        setCvError(t("analysisQueuedForRetry"));
        return;
      }

      const { data: refreshed } = await supabase
        .from("candidates_secure")
        .select(candidateSelectWithOfferPreparation)
        .eq("id", candidate.id)
        .single();

      if (refreshed) {
        setCandidate((current) =>
          current
            ? ({ ...current, ...refreshed } as CandidateDetailRecord)
            : (refreshed as CandidateDetailRecord),
        );
        updateCachedApplicants((applicants) =>
          applicants.map((applicant) =>
            applicant.id === candidate.id
              ? {
                  ...applicant,
                  aiScore:
                    typeof refreshed.ats_score === "number"
                      ? refreshed.ats_score
                      : applicant.aiScore,
                  analysisStatus: refreshed.analysis_status ?? applicant.analysisStatus,
                  skills: refreshed.skills ?? applicant.skills,
                  summary: refreshed.analysis_summary ?? applicant.summary,
                  analysisStrengths:
                    refreshed.analysis_strengths ?? applicant.analysisStrengths,
                  analysisConcerns:
                    refreshed.analysis_concerns ?? applicant.analysisConcerns,
                }
              : applicant,
          ),
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("failedCandidateSave");
      setCvError(message);
      setCandidate((current) =>
        current ? { ...current, analysis_status: "failed" } : current,
      );
      updateCachedApplicants((applicants) =>
        applicants.map((applicant) =>
          applicant.id === candidate.id
            ? { ...applicant, analysisStatus: "failed" }
            : applicant,
        ),
      );
    } finally {
      setIsReanalyzingCandidate(false);
    }
  };

  const generateOfferDocument = async (offerInputs: OfferInputs) => {
    if (!candidate) return null;
    if (isJobClosedForCandidate) {
      setOfferError(
        "To delovno mesto je zaprto ali zapolnjeno. Pred novo ponudbo povečajte število mest ali kandidata prestavite na drugo aktivno delo.",
      );
      return null;
    }

    setIsGeneratingOffer(true);
    setOfferError(null);

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw new Error(t("signedInRequiredCandidate"));
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-offer`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ candidateId: candidate.id, offerInputs }),
        },
      );

      if (!response.ok) {
        throw new Error((await response.text()) || response.statusText);
      }

      const result = await response.json();
      const nextDocument = result.document as OfferDocument;
      setOfferDocument(nextDocument);
      setIsCandidateWorkSaved(false);
      void logActivityEvent({
        action: "offer_document_created",
        entityType: "offer_document",
        entityId: nextDocument.id,
        entityLabel: nextDocument.title,
        toValue: nextDocument.status ?? "draft",
        metadata: { candidate_id: candidate.id, candidate_name: candidate.full_name },
      });
      setIsOfferDraftOpen(false);

      if (pendingOfferSentAfterDraft) {
        setPendingOfferSentAfterDraft(false);
        await updateOfferChecklist("offerSent", true, nextDocument);
      }

      return nextDocument;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("offerDocumentGenerateFailed");
      setOfferError(message);
      return null;
    } finally {
      setIsGeneratingOffer(false);
    }
  };

  const updateOfferChecklist = async (
    key: keyof OfferChecklist,
    checked: boolean,
    generatedOfferDocument?: OfferDocument,
  ) => {
    if (!candidate) return;
    if (key === "offerSent" && checked && !isCandidateWorkSaved) {
      setOfferError("Pred pošiljanjem ponudbe klikni »Shrani delo«.");
      return;
    }
    if (key === "offerSent" && checked && isJobClosedForCandidate) {
      setOfferError(
        "Ponudbe ni mogoče poslati, ker je delovno mesto zaprto ali zapolnjeno.",
      );
      return;
    }

    if (key === "offerSent" && checked && !offerDocument && !generatedOfferDocument) {
      setPendingOfferSentAfterDraft(true);
      setIsOfferDraftOpen(true);
      return;
    }

    const previousCandidate = candidate;
    const nextChecklist = { ...offerChecklist, [key]: checked };
    const datePatch =
      key === "offerSent" && checked && !candidate.offer_sent_at
        ? { offer_sent_at: new Date().toISOString().slice(0, 10) }
        : {};

    setCandidate({
      ...candidate,
      offer_checklist: nextChecklist,
      ...datePatch,
    });
    setIsCandidateWorkSaved(false);
    setOfferError(null);

    const { error } = await supabase
      .from("candidates")
      .update({
        offer_checklist: nextChecklist,
        ...datePatch,
      })
      .eq("id", candidate.id);

    if (error) {
      setCandidate(previousCandidate);
      setOfferError(error.message || t("failedOfferUpdate"));
    } else {
      const activeOfferDocument = generatedOfferDocument ?? offerDocument;
      if (key === "offerSent" && activeOfferDocument) {
        const nextDocumentStatus = checked ? "sent" : "draft";
        const { error: documentError } = await supabase
          .from("offer_documents")
          .update({ status: nextDocumentStatus })
          .eq("id", activeOfferDocument.id);

        if (documentError) {
          setOfferError(documentError.message || t("failedOfferUpdate"));
        } else {
          setOfferDocument({
            ...activeOfferDocument,
            status: nextDocumentStatus,
          });
          void logActivityEvent({
            action: "offer_sent",
            entityType: "offer_document",
            entityId: activeOfferDocument.id,
            entityLabel: activeOfferDocument.title,
            fromValue: checked ? "draft" : "sent",
            toValue: nextDocumentStatus,
            metadata: { candidate_id: candidate.id, candidate_name: candidate.full_name },
          });
        }
      }

      updateCachedApplicants((applicants) =>
        applicants.map((applicant) =>
          applicant.id === candidate.id
            ? {
                ...applicant,
                offerChecklist: { offerSent: Boolean(nextChecklist.offerSent) },
                offerSentAt:
                  "offer_sent_at" in datePatch
                    ? datePatch.offer_sent_at ?? null
                    : applicant.offerSentAt,
              }
            : applicant,
        ),
      );
    }
  };

  const updateOfferDate = async (
    field: "offer_sent_at" | "offer_response_due_at",
    value: string,
  ) => {
    if (!candidate) return;

    if (value && value < todayIso) {
      setOfferError(t("offerDateCannotBePast"));
      return;
    }

    const previousCandidate = candidate;
    setCandidate({ ...candidate, [field]: value || null });
    setIsCandidateWorkSaved(false);
    setOfferError(null);

    const { error } = await supabase
      .from("candidates")
      .update({ [field]: value || null })
      .eq("id", candidate.id);

    if (error) {
      setCandidate(previousCandidate);
      setOfferError(error.message || t("failedOfferUpdate"));
    } else {
      updateCachedApplicants((applicants) =>
        applicants.map((applicant) =>
          applicant.id === candidate.id
            ? {
                ...applicant,
                offerSentAt:
                  field === "offer_sent_at" ? value || null : applicant.offerSentAt,
              }
            : applicant,
        ),
      );
    }
  };

  const updateOfferOutcome = async (outcome: "accepted" | "declined") => {
    if (!candidate) return;
    if (!isCandidateWorkSaved) {
      setOfferError("Pred potrditvijo izida ponudbe klikni »Shrani delo«.");
      return;
    }

    let nextJobCapacity = jobCapacity;
    if (outcome === "accepted") {
      const latestCapacity = await getJobCapacityForTitle(candidate.job_title);
      nextJobCapacity = latestCapacity;
      setJobCapacity(latestCapacity);

      const alreadyAccepted = candidate.stage === "Accepted";
      const nextAcceptedCount =
        (latestCapacity?.acceptedCount ?? 0) + (alreadyAccepted ? 0 : 1);
      const wouldExceedCapacity = latestCapacity
        ? (latestCapacity.status ?? "active") === "inactive" ||
          nextAcceptedCount > latestCapacity.openings
        : false;

      if (latestCapacity && wouldExceedCapacity) {
        const confirmed = await confirm({
          title: tt("Delo je zapolnjeno"),
          description: `To delo ima trenutno ${latestCapacity.acceptedCount}/${latestCapacity.openings} sprejetih kandidatov. Sprejem tega kandidata bi presegel kapaciteto. Želite povečati število mest na ${nextAcceptedCount} in nadaljevati?`,
          confirmLabel: tt("Poveči in nadaljuj"),
        });

        if (!confirmed) {
          setOfferError("Sprejem kandidata je bil preklican, ker je delo zapolnjeno.");
          return;
        }

        nextJobCapacity = await increaseJobOpeningsForTitle(
          candidate.job_title,
          nextAcceptedCount,
        );
        setJobCapacity(nextJobCapacity);
      }
    }

    const nextStage: Stage = outcome === "accepted" ? "Accepted" : "Rejected";
    const nextChecklist = { ...offerChecklist, offerSent: true };
    const sentDate = candidate.offer_sent_at ?? new Date().toISOString().slice(0, 10);
    const previousCandidate = candidate;

    setCandidate({
      ...candidate,
      stage: nextStage,
      offer_outcome: outcome,
      offer_checklist: nextChecklist,
      offer_sent_at: sentDate,
    });
    setIsCandidateWorkSaved(false);
    setOfferError(null);

    const [{ error: candidateError }, { error: documentError }] = await Promise.all([
      supabase
        .from("candidates")
        .update({
          stage: nextStage,
          offer_outcome: outcome,
          offer_checklist: nextChecklist,
          offer_sent_at: sentDate,
        })
        .eq("id", candidate.id),
      offerDocument
        ? supabase
            .from("offer_documents")
            .update({ status: outcome === "accepted" ? "accepted" : "declined" })
            .eq("id", offerDocument.id)
        : Promise.resolve({ error: null }),
    ]);

    if (candidateError || documentError) {
      setCandidate(previousCandidate);
      setOfferError(candidateError?.message || documentError?.message || t("failedOfferUpdate"));
      return;
    }

    if (offerDocument) {
      setOfferDocument({
        ...offerDocument,
        status: outcome === "accepted" ? "accepted" : "declined",
      });
    }
    void logActivityEvent({
      action: "offer_outcome_changed",
      entityType: "candidate",
      entityId: candidate.id,
      entityLabel: candidate.full_name,
      fromValue: previousCandidate.offer_outcome ?? "pending",
      toValue: outcome,
      metadata: {
        job_title: candidate.job_title,
        offer_document_id: offerDocument?.id ?? null,
      },
    });

    updateCachedApplicants((applicants) =>
      applicants.map((applicant) =>
        applicant.id === candidate.id
          ? {
              ...applicant,
              stage: nextStage,
              offerOutcome: outcome,
              offerChecklist: { offerSent: true },
              offerSentAt: sentDate,
            }
          : applicant,
      ),
    );

    if (outcome === "accepted" || previousCandidate.stage === "Accepted") {
      await syncJobStatusForTitle(candidate.job_title);
      const capacity = await getJobCapacityForTitle(candidate.job_title);
      setJobCapacity(capacity);
    }
  };

  const handleStageChange = async (nextStage: Stage) => {
    if (!candidate || nextStage === candidate.stage) return;

    if (nextStage === "Offer" && isJobClosedForCandidate) {
      setStageError(
        "Kandidata ni mogoče premakniti v fazo ponudbe, ker je delovno mesto zaprto ali zapolnjeno.",
      );
      return;
    }

    if (nextStage === "Accepted") {
      await updateOfferOutcome("accepted");
      return;
    }

    const previousStage = candidate.stage;
    setCandidate({ ...candidate, stage: nextStage });
    setIsUpdatingStage(true);
    setStageError(null);

    const { error } = await supabase
      .from("candidates")
      .update({ stage: nextStage })
      .eq("id", candidate.id);

    if (error) {
      setCandidate({ ...candidate, stage: previousStage });
      setStageError(error.message || t("failedStageUpdate"));
    } else {
      setIsCandidateWorkSaved(false);
      updateCachedApplicants((applicants) =>
        applicants.map((applicant) =>
          applicant.id === candidate.id
            ? { ...applicant, stage: nextStage }
          : applicant,
        ),
      );
      void logActivityEvent({
        action: "candidate_stage_changed",
        entityType: "candidate",
        entityId: candidate.id,
        entityLabel: candidate.full_name,
        fromValue: previousStage,
        toValue: nextStage,
        metadata: { job_title: candidate.job_title },
      });
      if (previousStage === "Accepted") {
        await syncJobStatusForTitle(candidate.job_title);
        const capacity = await getJobCapacityForTitle(candidate.job_title);
        setJobCapacity(capacity);
      }
    }

    setIsUpdatingStage(false);
  };

  // Guarded entry point used by the stepper + footer: enforces the strict-guided
  // transition rules and confirms backward / reject / reopen moves before
  // delegating to handleStageChange.
  const attemptStageChange = async (target: Stage) => {
    if (!candidate) return;
    if (!isCandidateWorkSaved) {
      setStageError(tt("Pred spremembo faze klikni »Shrani delo«."));
      return;
    }

    const check = checkTransition(candidate.stage, target);
    if (!check.allowed) {
      if (check.kind === "blocked") {
        setStageError(tt("Faze ni mogoče preskočiti — premikaj po korakih."));
      }
      return;
    }

    if (target === "Offer" && isJobClosedForCandidate) {
      setStageError(
        "Kandidata ni mogoče premakniti v fazo ponudbe, ker je delovno mesto zaprto ali zapolnjeno.",
      );
      return;
    }

    if (check.requiresConfirm) {
      const message =
        check.kind === "reopen"
          ? tt("Ponovno odpreti tega kandidata in spremeniti fazo?")
          : check.kind === "reject"
            ? tt("Označiti kandidata kot zavrnjenega?")
            : tt("Premakniti kandidata nazaj v prejšnjo fazo?");
      if (!(await confirm({ description: message }))) return;
    }

    setStageError(null);
    await handleStageChange(target);
    if (target === "Interview") setActiveCandidateSection("interview");
    else if (target === "Offer") setActiveCandidateSection("offer");
    else setActiveCandidateSection("overview");
  };

  const handleOpenCv = async () => {
    if (!candidate?.resume_path) {
      setCvError(t("cvUnavailable"));
      return;
    }

    setIsOpeningCv(true);
    setCvError(null);

    const pdfWindow = window.open("", "_blank");
    if (pdfWindow) {
      pdfWindow.opener = null;
      pdfWindow.document.title = t("openingCv");
      const message = pdfWindow.document.createElement("p");
      message.textContent = t("openingCv");
      message.style.fontFamily = "sans-serif";
      message.style.color = "#444";
      pdfWindow.document.body.replaceChildren(message);
    }

    const { data, error } = await supabase.storage
      .from("resumes")
      .createSignedUrl(candidate.resume_path, 60 * 10);

    if (error || !data?.signedUrl) {
      if (pdfWindow) {
        pdfWindow.close();
      }
      setCvError(error?.message || t("failedCvOpen"));
      setIsOpeningCv(false);
      return;
    }

    if (pdfWindow) {
      pdfWindow.location.href = data.signedUrl;
    } else {
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    }

    setIsOpeningCv(false);
  };

  const handleUploadCv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !candidate) return;

    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      setCvError(t("resumePdfOnly"));
      return;
    }

    setIsUploadingCv(true);
    setCvError(null);
    setCandidate((current) =>
      current ? { ...current, analysis_status: "pending_ai" } : current,
    );

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw new Error(t("signedInRequiredCandidate"));
      }

      const [conversion, extractedText] = await Promise.all([
        convertPdfToImage(file),
        extractPdfText(file).catch(() => ""),
      ]);
      const resumeText = extractedText.trim() ? extractedText : conversion.ocrText ?? "";
      if (!resumeText.trim()) {
        throw new Error(t("resumeExtractFailed"));
      }

      const fileExt = file.name.split(".").pop() || "pdf";
      const filePath = `${sessionData.session.user.id}/${crypto.randomUUID()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(filePath, file, { upsert: false });

      if (uploadError) {
        throw uploadError;
      }

      const { error: updateError } = await supabase
        .from("candidates")
        .update({
          resume_path: filePath,
          resume_preview_url: conversion.imageUrl || null,
          analysis_status: "pending_ai",
        })
        .eq("id", candidate.id);

      if (updateError) {
        throw updateError;
      }

      setCandidate((current) =>
        current
          ? {
              ...current,
              resume_path: filePath,
              resume_preview_url: conversion.imageUrl || null,
              analysis_status: "pending_ai",
            }
          : current,
      );
      updateCachedApplicants((applicants) =>
        applicants.map((applicant) =>
          applicant.id === candidate.id
            ? {
                ...applicant,
                avatar: conversion.imageUrl || applicant.avatar,
                analysisStatus: "pending_ai",
              }
            : applicant,
        ),
      );

      const analysisResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-candidate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            candidateId: candidate.id,
            jobTitle: candidate.job_title,
            resumeText,
          }),
        },
      );

      if (!analysisResponse.ok) {
        const message = await analysisResponse.text();
        enqueueAiAnalysisRetry({
          candidateId: candidate.id,
          candidateName: candidate.full_name,
          jobTitle: candidate.job_title,
          jobDescription: "",
          resumeText,
          lastError: message || t("analysisQueuedForRetry"),
        });
        setCvError(t("analysisQueuedForRetry"));
        return;
      }

      const { data: refreshed } = await supabase
        .from("candidates_secure")
        .select(candidateSelectWithOfferPreparation)
        .eq("id", candidate.id)
        .single();

      if (refreshed) {
        setCandidate((current) =>
          current
            ? ({ ...current, ...refreshed } as CandidateDetailRecord)
            : (refreshed as CandidateDetailRecord),
        );
        updateCachedApplicants((applicants) =>
          applicants.map((applicant) =>
            applicant.id === candidate.id
              ? {
                  ...applicant,
                  aiScore:
                    typeof refreshed.ats_score === "number"
                      ? refreshed.ats_score
                      : applicant.aiScore,
                  analysisStatus: refreshed.analysis_status ?? applicant.analysisStatus,
                  skills: refreshed.skills ?? applicant.skills,
                  summary: refreshed.analysis_summary ?? applicant.summary,
                  analysisStrengths:
                    refreshed.analysis_strengths ?? applicant.analysisStrengths,
                  analysisConcerns:
                    refreshed.analysis_concerns ?? applicant.analysisConcerns,
                }
              : applicant,
          ),
        );
      }
    } catch (error) {
      setCvError(error instanceof Error ? error.message : t("failedCandidateSave"));
      setCandidate((current) =>
        current ? { ...current, analysis_status: "failed" } : current,
      );
    } finally {
      setIsUploadingCv(false);
    }
  };

  const openCandidateInterviewStudio = (transcriptId?: string) => {
    if (!candidate) return;
    const params = new URLSearchParams({
      mode: "candidate",
      candidateId: candidate.id,
      finish: "1",
    });
    if (transcriptId) params.set("transcriptId", transcriptId);
    navigate(`/interviews?${params.toString()}`);
  };

  const createManualInterviewTranscript = async () => {
    if (!candidate) return;

    setIsCreatingInterviewTranscript(true);
    setInterviewAnalysisError(null);

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw new Error(t("signedInRequiredCandidate"));
      }

      const transcriptId = crypto.randomUUID();
      const { error } = await supabase
        .from("interview_transcripts")
        .insert({
          id: transcriptId,
          user_id: sessionData.session.user.id,
          title: defaultInterviewTranscriptTitle,
          transcript_text:
            manualInterviewText.trim() ||
            "Ročno dodan transkript. Vsebino dopolnite v Studiu razgovorov.",
          duration_seconds: 0,
          status: "complete",
          source: "manual",
        });

      if (error) {
        throw error;
      }

      setIsInterviewStartOpen(false);
      openCandidateInterviewStudio(transcriptId);
    } catch (error) {
      setInterviewAnalysisError(
        error instanceof Error ? error.message : "Transkripta ni bilo mogoče ustvariti.",
      );
    } finally {
      setIsCreatingInterviewTranscript(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">{t("loadingCandidate")}</div>;
  }

  if (!candidate) {
    return <div className="p-8 text-center text-muted-foreground">{t("candidateNotFound")}</div>;
  }

   const candidateAnchors: ObjectPageAnchor[] = [
      { id: "overview", label: tt("Pregled") },
      { id: "skills", label: t("skillsProfile") },
      { id: "interview", label: tt("Razgovor") },
      ...(canRenderDesktopAside
        ? [{ id: "signal", label: t("cvAiWritingSignal") }]
        : []),
      ...(isOfferStage
        ? [{ id: "offer", label: t("offerPreparation") }]
        : []),
    ];

    return (
    <ObjectPageShell
      anchors={candidateAnchors}
      navigationMode="tabs"
      activeSection={activeCandidateSection}
      onSectionChange={setActiveCandidateSection}
      stepper={
        <WorkflowStepper
          current={candidate.stage}
          getLabel={(stage) => stageLabel(stage)}
          onSelect={attemptStageChange}
        />
      }
      footer={
        <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
          <div className="min-h-5 text-xs">
            {stageError ? (
              <span className="text-red-500">{stageError}</span>
            ) : isUpdatingStage ? (
              <span className="text-muted-foreground">{t("updatingStage")}</span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={isCandidateWorkSaved ? "outline" : "default"}
              onClick={() => void saveCandidateWork()}
              disabled={isSavingCandidateWork}
              className="gap-2"
            >
              {isSavingCandidateWork ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isSavingCandidateWork
                ? tt("Shranjevanje …")
                : isCandidateWorkSaved
                  ? tt("Delo shranjeno")
                  : tt("Shrani delo")}
            </Button>
            {isTerminalStage(candidate.stage) ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => attemptStageChange("Screening")}
                disabled={isUpdatingStage}
              >
                {tt("Ponovno odpri")}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => attemptStageChange("Rejected")}
                  disabled={isUpdatingStage}
                >
                  {tt("Zavrni")}
                </Button>
                {getNextStage(candidate.stage) ? (
                  <Button
                    type="button"
                    onClick={() => attemptStageChange(getNextStage(candidate.stage)!)}
                    disabled={isUpdatingStage}
                  >
                    {tt("Premakni v")}: {stageLabel(getNextStage(candidate.stage)!)}
                  </Button>
                ) : null}
              </>
            )}
          </div>
        </div>
      }
      header={
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <button
              type="button"
              onClick={goBackToPreviousAppLocation}
              className="rounded-full p-2 text-muted-foreground hover:bg-muted"
              aria-label={t("back")}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="break-words text-xl font-bold text-foreground">{candidate.full_name}</h1>
              <p className="text-sm text-muted-foreground">{t("appliedFor")} <span className="font-medium text-foreground">{candidate.job_title}</span></p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {candidate.email ? (
                  <a
                    href={`mailto:${candidate.email}`}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-1 hover:text-foreground"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {candidate.email}
                  </a>
                ) : null}
                {candidatePhone ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-1">
                    <Phone className="h-3.5 w-3.5" />
                    {candidatePhone}
                  </span>
                ) : null}
                {candidate.location ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {candidate.location}
                  </span>
                ) : null}
                {candidateSourceUrl ? (
                  <a
                    href={candidateSourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-1 hover:text-foreground"
                  >
                    <LinkIcon className="h-3.5 w-3.5" />
                    {t("profileSource")}
                  </a>
                ) : null}
              </div>
              {cvError ? (
                <p className="mt-1 text-xs text-red-500">{cvError}</p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:gap-4">
            <input
              ref={resumeInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleUploadCv}
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleOpenCv}
              disabled={isOpeningCv || !candidate.resume_path}
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              {isOpeningCv ? t("openingCv") : t("showCv")}
            </Button>
            {!candidate.resume_path ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => resumeInputRef.current?.click()}
                disabled={isUploadingCv}
                className="gap-2"
              >
                {isUploadingCv ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {isUploadingCv ? t("uploadingResume") : t("uploadResumePdf")}
              </Button>
            ) : null}
            <div className="max-w-64 text-left sm:text-right">
              <div className="flex flex-col gap-2 sm:items-end">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t("aiReviewScore")}
                  </p>
                  <p className="mt-1 text-xs leading-snug text-muted-foreground">
                    {t("aiScoreReviewAidNote")}
                  </p>
                </div>
                {canReanalyzeCandidate ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="relative z-10 gap-2"
                    onClick={() => void reanalyzeCandidate()}
                    disabled={isReanalyzingCandidate}
                  >
                    <Wrench
                      className={`h-4 w-4 ${isReanalyzingCandidate ? "animate-spin" : ""}`}
                    />
                    {isReanalyzingCandidate ? t("reanalyzingCandidate") : t("reanalyzeCandidate")}
                  </Button>
                ) : null}
              </div>
            </div>
            {isReanalyzingCandidate || candidate.analysis_status === "pending_ai" ? (
              <span className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-border bg-muted text-sm font-semibold text-muted-foreground">
                {isReanalyzingCandidate ? (
                  <Wrench className="h-5 w-5 animate-spin" />
                ) : (
                  "..."
                )}
              </span>
            ) : headlineScore != null ? (
              <div className="flex flex-col items-center gap-1">
                <ScoreRing score={headlineScore} size="md" />
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {headlineScoreBasis}
                </p>
                {headlineScoreDelta != null && headlineScoreDelta !== 0 ? (
                  <p
                    className={`text-[10px] font-semibold ${
                      headlineScoreDelta < 0
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {headlineScoreDelta > 0 ? "+" : "−"}
                    {Math.abs(headlineScoreDelta)} {tt("po razgovoru")}
                  </p>
                ) : null}
              </div>
            ) : (
              <span className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-border bg-muted px-2 text-center text-[10px] font-semibold text-muted-foreground">
                {t("notScored")}
              </span>
            )}
          </div>
        </div>
      }
    >
      {/* Verdict hero strip — the focal point under the stepper */}
      {headlineScore != null ? (
        <section className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-center lg:gap-6">
          <div className="flex shrink-0 flex-col">
            <div className="flex items-baseline gap-1">
              <span
                className={`text-4xl font-bold tabular-nums ${verdictBand ? scoreBandText[verdictBand] : ""}`}
              >
                {headlineScore}
              </span>
              <span className="text-sm text-muted-foreground">/ 100</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {headlineScoreBasis}
              {headlineScoreDelta != null && headlineScoreDelta !== 0
                ? ` · ${headlineScoreDelta > 0 ? "+" : "−"}${Math.abs(headlineScoreDelta)} ${tt("po razgovoru")}`
                : ""}
            </span>
          </div>
          <div className="hidden h-12 w-px shrink-0 bg-border lg:block" />
          <div className="min-w-0 flex-1">
            {verdictLabel && verdictBand ? (
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${scoreBandChip[verdictBand]}`}
              >
                {verdictLabel}
              </span>
            ) : null}
            {verdictReason ? (
              <p className="mt-2 text-sm text-muted-foreground">{verdictReason}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {isJobClosedForCandidate ? (
            <div className="flex items-start gap-2 rounded-lg border border-border border-l-2 border-l-amber-500 bg-muted/30 p-3 text-sm text-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>
                To delovno mesto je zaprto ali zapolnjeno
                {jobCapacity
                  ? ` (${jobCapacity.acceptedCount}/${jobCapacity.openings} sprejetih).`
                  : "."}{" "}
                Za novo ponudbo povečajte število mest ali kandidata prestavite na drugo aktivno delo.
              </span>
            </div>
          ) : jobCapacity && jobCapacity.acceptedCount > jobCapacity.openings ? (
            <div className="flex items-start gap-2 rounded-lg border border-border border-l-2 border-l-red-500 bg-muted/30 p-3 text-sm text-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <span>
                Delovno mesto presega kapaciteto: {jobCapacity.acceptedCount}/{jobCapacity.openings} sprejetih kandidatov.
              </span>
            </div>
          ) : null}
          {!candidate.resume_path ? (
            <div className="flex items-start gap-2 rounded-lg border border-border border-l-2 border-l-amber-500 bg-muted/30 p-3 text-sm text-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>
                Ta kandidat še nima naloženega CV-ja. Analiza iz Lov na talente lahko upošteva
                samo priložena dokazila, javno dostopne/profile podatke ali opombe s privolitvijo,
                zato je CV + razgovor primerjava omejena, dokler ne naložite CV PDF-ja.
              </span>
            </div>
          ) : null}
           
      {activeCandidateSection === "overview" ? (
      <section
        id="overview"
        role="tabpanel"
        aria-labelledby="overview-tab"
        className="scroll-mt-4 px-1 py-2 sm:px-2"
      >
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-foreground">
          <Clock className="h-5 w-5 text-muted-foreground" />
          {t("aiAnalysisSummary")}
        </h2>
        <p className="mb-5 text-sm text-muted-foreground">
          {tt("Prednosti, pomisleki in primerjava ocen CV ↔ razgovor.")}
        </p>

        {/* CV → CV+razgovor comparison */}
        {hasStoredInterviewAnalysis && cvOnlyScore != null && displayedCombinedScore != null ? (
          <div className="mb-6 rounded-lg border border-border bg-muted/25 p-4">
            <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span>{tt("Samo CV")}</span>
              <span>{tt("CV + razgovor")}</span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span className="shrink-0 text-2xl font-bold tabular-nums text-muted-foreground">
                {cvOnlyScore}%
              </span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/30"
                  style={{ width: `${cvOnlyScore}%` }}
                />
                <div
                  className={`absolute inset-y-0 left-0 rounded-full ${
                    headlineScoreDelta != null && headlineScoreDelta < 0
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.round(displayedCombinedScore)}%` }}
                />
              </div>
              <span
                className={`shrink-0 text-2xl font-bold tabular-nums ${
                  scoreBandText[scoreBand(Math.round(displayedCombinedScore))]
                }`}
              >
                {Math.round(displayedCombinedScore)}%
              </span>
            </div>
            {headlineScoreDelta != null && headlineScoreDelta !== 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                <span
                  className={`font-semibold ${
                    headlineScoreDelta < 0
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {headlineScoreDelta > 0 ? "+" : "−"}
                  {Math.abs(headlineScoreDelta)} {tt("po razgovoru")}
                </span>
                {displayedInterviewSummary
                  ? ` — ${firstSentence(displayedInterviewSummary)}`
                  : ` — ${tt("Ocena je posodobljena po analizi razgovora.")}`}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Merged, calm strengths / concerns — accent on neutral surface */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border border-l-2 border-l-emerald-500 bg-card p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <ThumbsUp className="h-4 w-4 text-emerald-500" />
              {t("strengths")}
            </h3>
            <ul className="space-y-2">
              {mergedStrengths.length ? (
                mergedStrengths.map((item, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-foreground">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span>
                      {item.text}
                      {item.confirmed ? (
                        <span className="ml-2 inline-flex items-center rounded-full bg-emerald-500/10 px-1.5 py-px text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                          ✓ {tt("potrjeno v razgovoru")}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))
              ) : (
                <li className="text-sm text-muted-foreground">{t("aiAnalysisPending")}</li>
              )}
            </ul>
          </div>
          <div className="rounded-lg border border-border border-l-2 border-l-red-500 bg-card p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <ThumbsDown className="h-4 w-4 text-red-500" />
              {t("potentialConcerns")}
            </h3>
            <ul className="space-y-2">
              {mergedConcerns.length ? (
                mergedConcerns.map((item, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-foreground">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                    <span>
                      {item.text}
                      {item.open ? (
                        <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/10 px-1.5 py-px text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          {tt("odprto v razgovoru")}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))
              ) : (
                <li className="text-sm text-muted-foreground">{t("aiAnalysisPending")}</li>
              )}
            </ul>
          </div>
        </div>

        {/* Prompt to run combined analysis when a transcript is linked but unscored */}
        {hasLinkedTranscripts && !hasStoredInterviewAnalysis ? (
          <div className="mt-4 flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/20 p-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              {tt("Transkript je povezan, vendar CV + razgovor ocena še ni izračunana.")}
            </span>
            <Button
              type="button"
              size="sm"
              onClick={() => void analyzeCvWithInterview()}
              disabled={isAnalyzingInterview || !hasCvAnalysis || !candidate.resume_path}
            >
              {isAnalyzingInterview ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Bot className="mr-2 h-4 w-4" />
              )}
              {tt("Analiziraj CV + razgovor")}
            </Button>
          </div>
        ) : null}

        {interviewAnalysisError ? (
          <p className="mt-3 text-sm text-red-500">{interviewAnalysisError}</p>
        ) : null}

        {/* Progressive disclosure — full narrative, follow-ups, transcripts */}
        {candidate.analysis_summary ||
        displayedInterviewSummary ||
        displayedInterviewQuestions.length ||
        linkedTranscripts.length ? (
          <div className="mt-5 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setShowFullAnalysis((value) => !value)}
              aria-expanded={showFullAnalysis}
              className="inline-flex items-center gap-1 text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              {showFullAnalysis ? tt("Pokaži manj") : tt("Pokaži več")}
              <ChevronDown
                className={`h-4 w-4 transition-transform ${showFullAnalysis ? "rotate-180" : ""}`}
              />
            </button>

            {showFullAnalysis ? (
              <div className="mt-4 space-y-4">
                {candidate.analysis_summary ? (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {tt("Povzetek profila (CV)")}
                    </h4>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {candidate.analysis_summary}
                    </p>
                  </div>
                ) : null}
                {displayedInterviewSummary ? (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {tt("Povzetek razgovora")}
                    </h4>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {displayedInterviewSummary}
                    </p>
                  </div>
                ) : null}
                {displayedInterviewQuestions.length ? (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {tt("Nadaljnja vprašanja")}
                    </h4>
                    <ol className="space-y-1.5 text-sm text-foreground">
                      {displayedInterviewQuestions.map((question, index) => (
                        <li key={question}>
                          {index + 1}. {question}
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
                {linkedTranscripts.length ? (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {tt("Povezani transkripti")}
                    </h4>
                    {linkedTranscripts.map((transcript) => (
                      <details
                        key={transcript.id}
                        className="rounded-md border border-border bg-background p-3"
                      >
                        <summary className="cursor-pointer text-sm font-medium text-foreground">
                          {transcript.title}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {transcript.status}
                          </span>
                        </summary>
                        <p className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                          {transcript.transcriptText || tt("Transkript še nima besedila.")}
                        </p>
                      </details>
                    ))}
                  </div>
                ) : null}
                <Link
                  to="/interviews"
                  className="inline-flex h-9 items-center justify-center rounded-full border border-border px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  {tt("Odpri razgovore")}
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
      ) : null}

      {["skills", "interview", "offer"].includes(activeCandidateSection) ? (
      <section
        id={activeCandidateSection}
        role="tabpanel"
        aria-labelledby={`${activeCandidateSection}-tab`}
        className="scroll-mt-4 px-1 py-2 sm:px-2"
      >
                {activeCandidateSection === "interview" ? (
                  <>
                    <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-foreground">
                      <Bot className="h-5 w-5 text-cyan-500" />
                      {t("interviewQuestions")}
                    </h2>
                    <p className="mb-5 text-sm text-muted-foreground">
                      {t("interviewQuestionsSubtitle")}
                    </p>
                    {interviewQuestions.length ? (
                      <ol className="space-y-3">
                        {interviewQuestions.map((question, index) => (
                          <li
                            key={`${question}-${index}`}
                            className="rounded-md border border-border bg-muted/35 p-4 text-sm leading-relaxed text-foreground"
                          >
                            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-cyan-500">
                              {index + 1}. {t("question")}
                            </span>
                            {question}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <div className="rounded-md border border-border bg-muted/35 p-4 text-sm text-muted-foreground">
                        {t("interviewQuestionsUnavailable")}
                      </div>
                    )}
                    <div className="mt-5 rounded-md border border-border bg-muted/35 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">
                            Transkripti razgovora
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Povezani transkripti, ki se uporabijo za CV + razgovor analizo.
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setIsInterviewStartOpen(true)}
                          >
                            Ustvari razgovor
                          </Button>
                          <Link
                            to={`/interviews?mode=candidate&candidateId=${candidate.id}&finish=1`}
                            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                          >
                            Poveži
                          </Link>
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        {linkedTranscripts.length ? (
                          linkedTranscripts.map((transcript) => (
                            <details
                              key={transcript.id}
                              className="rounded-md border border-border bg-background p-3"
                            >
                              <summary className="cursor-pointer text-sm font-medium text-foreground">
                                {transcript.title}
                              </summary>
                              <p className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                                {transcript.transcriptText || "Transkript še nima besedila."}
                              </p>
                            </details>
                          ))
                        ) : (
                          <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                            Ta kandidat še nima vezanega transkripta. V Razgovorih dodajte kandidata in transkript na mrežo, ju povežite ter shranite mrežo.
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                ) : activeCandidateSection === "offer" ? (
                  <>
                    <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-foreground">
                      <Bot className="h-5 w-5 text-emerald-500" />
                      {t("offerPreparation")}
                    </h2>
                    <p className="mb-5 text-sm text-muted-foreground">
                      {t("offerPreparationSubtitle")}
                    </p>

                    <div className="border-l-2 border-emerald-500 pl-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("offerSuitabilitySummary")}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-foreground">
                        {candidate.offer_summary || t("offerSummaryUnavailable")}
                      </p>
                    </div>

                    <div className="mt-5">
                      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("offerChecklist")}
                      </h3>
                      <div className="divide-y divide-border border-y border-border">
                        {offerChecklistItems.map((item) => (
                          <label
                            key={item.key}
                            className="flex cursor-pointer items-center gap-3 px-1 py-3 text-sm text-foreground transition-colors hover:bg-muted/25"
                          >
                            <input
                              type="checkbox"
                              checked={offerChecklist[item.key]}
                              disabled={item.key === "offerSent" && isGeneratingOffer}
                              onChange={(event) =>
                                updateOfferChecklist(item.key, event.target.checked)
                              }
                              className="h-4 w-4 rounded border-border accent-primary"
                            />
                            {item.key === "offerSent" && isGeneratingOffer ? (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : null}
                            {item.label}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="mt-7 border-t border-border pt-5">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("offerDocument")}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {offerDocument
                          ? offerDocument.title
                          : t("offerDocumentMissing")}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setIsOfferDraftOpen(true)}
                          disabled={isGeneratingOffer || isJobClosedForCandidate}
                          className="gap-2"
                        >
                          {isGeneratingOffer ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <FileText className="h-4 w-4" />
                          )}
                          {offerDocument ? t("editOfferData") : t("enterOfferData")}
                        </Button>
                        {offerDocument ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setIsOfferPreviewOpen(true)}
                              className="gap-2"
                            >
                              <Eye className="h-4 w-4" />
                              {t("preview")}
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-7 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("offerDatesAndReminder")}
                      </h3>
                      <label className="grid gap-1.5 text-sm text-foreground">
                        <span>{t("offerSentDate")}</span>
                        <input
                          type="date"
                          min={todayIso}
                          value={candidate.offer_sent_at ?? ""}
                          onChange={(event) =>
                            updateOfferDate("offer_sent_at", event.target.value)
                          }
                          className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground dark:bg-muted/30"
                        />
                      </label>
                      <label className="grid gap-1.5 text-sm text-foreground">
                        <span>{t("offerResponseDueDate")}</span>
                        <input
                          type="date"
                          min={todayIso}
                          value={candidate.offer_response_due_at ?? ""}
                          onChange={(event) =>
                            updateOfferDate("offer_response_due_at", event.target.value)
                          }
                          className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground dark:bg-muted/30"
                        />
                      </label>
                    </div>

                    <div className="mt-7 border-t border-border pt-5">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("offerOutcome")}
                      </h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {candidate.offer_outcome === "accepted"
                          ? t("offerOutcomeAccepted")
                          : candidate.offer_outcome === "declined"
                            ? t("offerOutcomeDeclined")
                            : t("offerOutcomePending")}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => updateOfferOutcome("accepted")}
                          disabled={!offerChecklist.offerSent}
                          className="text-emerald-600 hover:text-emerald-700"
                        >
                          {t("markOfferAccepted")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => updateOfferOutcome("declined")}
                          disabled={!offerChecklist.offerSent}
                          className="text-red-600 hover:text-red-700"
                        >
                          {t("markOfferDeclined")}
                        </Button>
                      </div>
                    </div>

                    {offerError ? (
                      <p className="mt-4 text-sm text-red-500">{offerError}</p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <h2 className="mb-4 text-lg font-semibold text-foreground">{t("skillsProfile")}</h2>
                    <div className="h-64 min-h-[256px] w-full">
                      <ResponsiveContainer width="100%" height="100%" minHeight={256}>
                        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                          <PolarGrid stroke="var(--border)" />
                          <PolarAngleAxis dataKey="subject" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                          <PolarRadiusAxis
                            angle={30}
                            domain={[0, (dataMax: number) => Math.max(dataMax, 1)]}
                            tick={false}
                            axisLine={false}
                          />
                          <Radar
                            name="Candidate"
                            dataKey="A"
                            stroke="#06b6d4"
                            strokeWidth={2}
                            fill="#8b5cf6"
                            fillOpacity={0.36}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(candidate.skills ?? []).slice(0, 5).map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </>
                )}
      </section>
      ) : null}

      {activeCandidateSection === "signal" && candidateAnchors.some((anchor) => anchor.id === "signal") ? (
        <section id="signal" role="tabpanel" aria-labelledby="signal-tab" className="scroll-mt-4 px-1 py-2 sm:px-2">
            <>
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                    <Bot className="h-5 w-5 text-cyan-500" />
                    {t("cvAiWritingSignal")}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("aiWritingSignalDescription")}
                  </p>
                </div>
                {aiWritingSignal ? (
                  <div className="text-right">
                    <div className="text-4xl font-semibold leading-none text-foreground">
                      {aiWritingSignal.score}
                    </div>
                    <div className="text-xs text-muted-foreground">/100</div>
                  </div>
                ) : null}
              </div>

              {aiWritingSignal ? (
                <>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${
                        aiWritingSignal.tone === "high"
                          ? "bg-red-500"
                          : aiWritingSignal.tone === "medium"
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                      }`}
                      style={{ width: `${aiWritingSignal.score}%` }}
                    />
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                    <span
                      className={
                        aiWritingSignal.tone === "high"
                          ? "font-medium text-red-600 dark:text-red-400"
                          : aiWritingSignal.tone === "medium"
                            ? "font-medium text-amber-600 dark:text-amber-400"
                            : "font-medium text-emerald-600 dark:text-emerald-400"
                      }
                    >
                      {aiWritingSignal.label}
                    </span>
                    <span className="text-muted-foreground">{t("reviewCue")}</span>
                  </div>

                  <div className="mt-5 border-t border-border pt-5">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("signalNotes")}
                    </h3>
                    <ul className="space-y-3 text-sm text-muted-foreground">
                      {aiWritingSignal.notes.map((note) => (
                        <li key={note} className="flex gap-2">
                          <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-muted-foreground/40" />
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-5 rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                    {t("aiWritingProofNote")}
                  </div>
                </>
              ) : (
                <div className="rounded-md border border-dashed border-border bg-muted/30 p-4">
                  <p className="text-sm font-semibold text-foreground">
                    {t("aiWritingSignalUnavailable")}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {t("aiWritingSignalUnavailableDescription")}
                  </p>
                </div>
              )}
            </>
        </section>
      ) : null}
      <OfferDraftDialog
        candidateName={candidate.full_name}
        draftKey={`smart-ats-offer-draft-${candidate.id}`}
        error={offerError}
        initialInputs={offerDocument?.inputs}
        isGenerating={isGeneratingOffer}
        open={isOfferDraftOpen}
        onOpenChange={(open) => {
          setIsOfferDraftOpen(open);
          if (!open) setPendingOfferSentAfterDraft(false);
        }}
        onGenerate={generateOfferDocument}
      />

      <Dialog open={isInterviewStartOpen} onOpenChange={setIsInterviewStartOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ustvari razgovor za kandidata</DialogTitle>
            <DialogDescription>
              Ustvari ročni transkript ali odpri Studio razgovorov za snemanje. Studio bo že odprt na tem kandidatu.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="rounded-md border border-border bg-muted/35 p-3 text-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Ime transkripta
              </div>
              <div className="mt-1 font-medium text-foreground">
                {defaultInterviewTranscriptTitle}
              </div>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground">Ročni transkript</label>
              <Textarea
                value={manualInterviewText}
                onChange={(event) => setManualInterviewText(event.target.value)}
                placeholder="Prilepite zapiske ali besedilo transkripta..."
                className="min-h-32"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => openCandidateInterviewStudio()}
            >
              Snemaj v studiu
            </Button>
            <Button
              type="button"
              onClick={createManualInterviewTranscript}
              disabled={isCreatingInterviewTranscript}
            >
              {isCreatingInterviewTranscript ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Ustvari in odpri studio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OfferPreviewDialog
        candidateName={candidate.full_name}
        document={offerDocument}
        open={isOfferPreviewOpen}
        onDocumentChange={setOfferDocument}
        onOpenChange={setIsOfferPreviewOpen}
      />
    </ObjectPageShell>
  );
}
