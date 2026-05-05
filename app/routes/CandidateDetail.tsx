import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useLocation } from "react-router";
import type { Stage } from "../store";
import { supabase } from "../lib/supabase";
import { getAiWritingSignal } from "../lib/aiWritingSignal";
import { ScoreRing } from '../components/ScoreRing';
import { 
  ArrowLeft, ThumbsUp, ThumbsDown,
  CheckCircle, XCircle, Clock, Bot, FileText, Eye, Loader2
} from 'lucide-react';
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer 
} from 'recharts';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Button } from "../components/ui/button";
import {
  OfferDraftDialog,
} from "../components/OfferDraftDialog";
import { OfferPreviewDialog } from "../components/OfferPreviewDialog";
import { useI18n } from "../lib/i18n";
import { updateCachedApplicants } from "../lib/candidateListCache";
import {
  getJobCapacityForTitle,
  increaseJobOpeningsForTitle,
  syncJobStatusForTitle,
} from "../lib/jobCache";
import { type OfferDocument, type OfferInputs } from "../lib/offerDocument";

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
  skills: string[] | null;
  analysis_summary: string | null;
  analysis_strengths: string[] | null;
  analysis_concerns: string[] | null;
  resume_path: string | null;
  ai_writing_score: number | null;
  ai_writing_label: string | null;
  ai_writing_notes: string[] | null;
  interview_questions: string[] | null;
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
  "id, full_name, job_title, stage, email, location, years_experience, ats_score, skills, analysis_summary, analysis_strengths, analysis_concerns, resume_path, skill_profile";

const candidateSelectWithAiWriting =
  `${baseCandidateSelect}, ai_writing_score, ai_writing_label, ai_writing_notes`;

const candidateSelectWithInterviewQuestions =
  `${candidateSelectWithAiWriting}, interview_questions`;

const candidateSelectWithOfferPreparation =
  `${candidateSelectWithInterviewQuestions}, offer_summary, offer_checklist, offer_outcome, offer_sent_at, offer_response_due_at`;

export default function CandidateDetail() {
  const { id } = useParams();
  const location = useLocation();
  const { t, stageLabel } = useI18n();
  const [candidate, setCandidate] = useState<CandidateDetailRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStage, setIsUpdatingStage] = useState(false);
  const [isOpeningCv, setIsOpeningCv] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  const [cvError, setCvError] = useState<string | null>(null);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [offerDocument, setOfferDocument] = useState<OfferDocument | null>(null);
  const [jobCapacity, setJobCapacity] = useState<JobCapacity | null>(null);
  const [isGeneratingOffer, setIsGeneratingOffer] = useState(false);
  const [isOfferPreviewOpen, setIsOfferPreviewOpen] = useState(false);
  const [isOfferDraftOpen, setIsOfferDraftOpen] = useState(false);
  const [pendingOfferSentAfterDraft, setPendingOfferSentAfterDraft] = useState(false);
  const returnToFromState =
    typeof location.state?.returnTo === "string" ? location.state.returnTo : null;
  const returnToFromQuery = new URLSearchParams(location.search).get("returnTo");
  const candidateBackPath = [returnToFromState, returnToFromQuery].find(
    (path) => path?.startsWith("/") && !path.startsWith("//"),
  ) ?? "/applicants";

  useEffect(() => {
    let isMounted = true;

    const loadCandidate = async () => {
      if (!id) return;

      const result = await supabase
        .from("candidates")
        .select(candidateSelectWithOfferPreparation)
        .eq("id", id)
        .single();

      const shouldRetryWithoutOfferPreparation =
        result.error &&
        (result.error.message?.includes("offer_") ||
          result.error.details?.includes("offer_"));

      const interviewResult = shouldRetryWithoutOfferPreparation
        ? await supabase
            .from("candidates")
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
            .from("candidates")
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
            .from("candidates")
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
        offer_summary: null,
        offer_checklist: defaultOfferChecklist,
        offer_outcome: "pending",
        offer_sent_at: null,
        offer_response_due_at: null,
        ...fallbackResult.data,
        stage: shouldMarkReviewed ? "Screening" : loadedStage,
      } as CandidateDetailRecord;

      setCandidate(nextCandidate);
      setIsLoading(false);

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
        }
      }
    };

    loadCandidate();

    return () => {
      isMounted = false;
    };
  }, [id]);

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
    const fallbackSignal = getAiWritingSignal({
        name: candidate?.full_name,
        role: candidate?.job_title,
        analysisSummary: candidate?.analysis_summary,
        strengths: candidate?.analysis_strengths,
        concerns: candidate?.analysis_concerns,
        skills: candidate?.skills,
        yearsExperience: candidate?.years_experience,
        atsScore: candidate?.ats_score,
    });

    return {
      score: Math.round(Number(candidate?.ai_writing_score ?? fallbackSignal.score)),
      label: candidate?.ai_writing_label ?? fallbackSignal.label,
      tone:
        (candidate?.ai_writing_score ?? fallbackSignal.score) >= 68
          ? "high"
          : (candidate?.ai_writing_score ?? fallbackSignal.score) >= 38
            ? "medium"
            : "low",
      notes:
        candidate?.ai_writing_notes?.length
          ? candidate.ai_writing_notes
          : fallbackSignal.notes,
    };
  }, [candidate]);

  const interviewQuestions = useMemo(
    () => (candidate?.interview_questions ?? []).slice(0, 3),
    [candidate],
  );
  const offerChecklist = useMemo(
    () => ({
      ...defaultOfferChecklist,
      ...(candidate?.offer_checklist ?? {}),
    }),
    [candidate],
  );
  const isInterviewStage = candidate?.stage === "Interview";
  const isOfferStage = candidate?.stage === "Offer" || candidate?.stage === "Accepted";
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
        const confirmed = window.confirm(
          `To delo ima trenutno ${latestCapacity.acceptedCount}/${latestCapacity.openings} sprejetih kandidatov. Sprejem tega kandidata bi presegel kapaciteto. Želite povečati število mest na ${nextAcceptedCount} in nadaljevati?`,
        );

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
      updateCachedApplicants((applicants) =>
        applicants.map((applicant) =>
          applicant.id === candidate.id
            ? { ...applicant, stage: nextStage }
            : applicant,
        ),
      );
      if (previousStage === "Accepted" || nextStage === "Accepted") {
        await syncJobStatusForTitle(candidate.job_title);
        const capacity = await getJobCapacityForTitle(candidate.job_title);
        setJobCapacity(capacity);
      }
    }

    setIsUpdatingStage(false);
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

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">{t("loadingCandidate")}</div>;
  }

  if (!candidate) {
    return <div className="p-8 text-center text-muted-foreground">{t("candidateNotFound")}</div>;
  }

   return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex-none border-b border-border bg-card px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link to={candidateBackPath} className="rounded-full p-2 text-muted-foreground hover:bg-muted">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-foreground">{candidate.full_name}</h1>
              <p className="text-sm text-muted-foreground">{t("appliedFor")} <span className="font-medium text-foreground">{candidate.job_title}</span></p>
              {cvError ? (
                <p className="mt-1 text-xs text-red-500">{cvError}</p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-4">
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
            <div className="min-w-44">
              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                {t("currentStage")}
              </p>
              <Select
                value={candidate.stage}
                onValueChange={(value) => handleStageChange(value as Stage)}
                disabled={isUpdatingStage}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["Screening", "Interview", "Offer", "Accepted", "Rejected"] as Stage[]).map(
                    (stageOption) => (
                      <SelectItem
                        key={stageOption}
                        value={stageOption}
                        disabled={stageOption === "Offer" && isJobClosedForCandidate}
                      >
                        {stageLabel(stageOption)}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
              {stageError ? (
                <p className="mt-1 text-xs text-red-500">{stageError}</p>
              ) : isUpdatingStage ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("updatingStage")}
                </p>
              ) : null}
            </div>
            <div className="max-w-56 text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("aiReviewScore")}
              </p>
              <p className="mt-1 text-xs leading-snug text-muted-foreground">
                {t("aiScoreReviewAidNote")}
              </p>
            </div>
            <ScoreRing score={candidate.ats_score ?? 0} size="md" />
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Content (Scrollable) */}
        <div className="flex-1 space-y-8 overflow-y-auto p-8">
          {isJobClosedForCandidate ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              To delovno mesto je zaprto ali zapolnjeno
              {jobCapacity
                ? ` (${jobCapacity.acceptedCount}/${jobCapacity.openings} sprejetih).`
                : "."}{" "}
              Za novo ponudbo povečajte število mest ali kandidata prestavite na drugo aktivno delo.
            </div>
          ) : jobCapacity && jobCapacity.acceptedCount > jobCapacity.openings ? (
            <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
              Delovno mesto presega kapaciteto: {jobCapacity.acceptedCount}/{jobCapacity.openings} sprejetih kandidatov.
            </div>
          ) : null}
           
           {/* Top Stats */}
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="surface-card p-6 lg:col-span-2">
                 <h2 className="mb-4 flex items-center text-lg font-semibold text-foreground">
                   <div className="mr-3 rounded-md bg-muted p-1.5 text-foreground">
                     <Clock className="h-5 w-5" />
                   </div>
                   {t("aiAnalysisSummary")}
                 </h2>
                 <p className="mb-6 leading-relaxed text-muted-foreground">
                  {candidate.analysis_summary ?? t("aiAnalysisPending")}
                </p>
                 
                  <Accordion
                    type="multiple"
                    defaultValue={["strengths", "concerns"]}
                    className="grid grid-cols-1 md:grid-cols-2 gap-6"
                  >
                    <AccordionItem value="strengths" className="border-none">
                      <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-100">
                        <AccordionTrigger className="py-0 hover:no-underline">
                          <span className="text-sm font-bold text-emerald-800 flex items-center">
                            <ThumbsUp className="h-4 w-4 mr-2" />
                            {t("strengths")}
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="pt-3">
                          <ul className="space-y-2">
                            {(candidate.analysis_strengths ?? []).map((pro, i) => (
                              <li key={i} className="flex items-start text-sm text-emerald-700">
                                <CheckCircle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0 opacity-70" />
                                {pro}
                              </li>
                            ))}
                          </ul>
                        </AccordionContent>
                      </div>
                    </AccordionItem>
                    <AccordionItem value="concerns" className="border-none">
                      <div className="bg-red-50 rounded-lg p-4 border border-red-100">
                        <AccordionTrigger className="py-0 hover:no-underline">
                          <span className="text-sm font-bold text-red-800 flex items-center">
                            <ThumbsDown className="h-4 w-4 mr-2" />
                            {t("potentialConcerns")}
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="pt-3">
                          <ul className="space-y-2">
                            {(candidate.analysis_concerns ?? []).map((con, i) => (
                              <li key={i} className="flex items-start text-sm text-red-700">
                                <XCircle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0 opacity-70" />
                                {con}
                              </li>
                            ))}
                          </ul>
                        </AccordionContent>
                      </div>
                    </AccordionItem>
                  </Accordion>
              </div>

              <div className="surface-card p-6">
                {isInterviewStage ? (
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
                  </>
                ) : isOfferStage ? (
                  <>
                    <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-foreground">
                      <Bot className="h-5 w-5 text-emerald-500" />
                      {t("offerPreparation")}
                    </h2>
                    <p className="mb-5 text-sm text-muted-foreground">
                      {t("offerPreparationSubtitle")}
                    </p>

                    <div className="rounded-md border border-border bg-muted/35 p-4">
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
                      <div className="space-y-2">
                        {offerChecklistItems.map((item) => (
                          <label
                            key={item.key}
                            className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground dark:bg-muted/30"
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

                    <div className="mt-5 rounded-md border border-border bg-muted/35 p-4">
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

                    <div className="mt-5 grid gap-3">
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

                    <div className="mt-5 rounded-md border border-border bg-muted/35 p-4">
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
              </div>

           </div>


        </div>

        {!isInterviewStage && !isOfferStage ? (
        <aside className="hidden w-[22rem] overflow-y-auto border-l border-border bg-card p-6 xl:block">
          <div className="surface-card bg-background/45 p-6">
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
                <div className="text-right">
                  <div className="text-4xl font-semibold leading-none text-foreground">
                    {aiWritingSignal.score}
                  </div>
                  <div className="text-xs text-muted-foreground">/100</div>
                </div>
              </div>

              <div className="h-3 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500"
                  style={{ width: `${aiWritingSignal.score}%` }}
                />
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                <span
                  className={
                    aiWritingSignal.tone === "high"
                      ? "font-medium text-pink-500"
                      : aiWritingSignal.tone === "medium"
                        ? "font-medium text-purple-500"
                        : "font-medium text-green-500"
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
                      <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-cyan-400" />
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-5 rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                {t("aiWritingProofNote")}
              </div>
            </>
          </div>
        </aside>
        ) : null}
      </div>
      <OfferDraftDialog
        candidateName={candidate.full_name}
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

      <OfferPreviewDialog
        candidateName={candidate.full_name}
        document={offerDocument}
        open={isOfferPreviewOpen}
        onDocumentChange={setOfferDocument}
        onOpenChange={setIsOfferPreviewOpen}
      />
    </div>
  );
}
