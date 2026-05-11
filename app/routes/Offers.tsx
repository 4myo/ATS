import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { CheckCircle2, Eye, FileText, Loader2, Send, UserRound, XCircle } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import {
  getJobCapacityForTitle,
  increaseJobOpeningsForTitle,
  syncJobStatusForTitle,
} from "../lib/jobCache";
import { OfferDraftDialog } from "../components/OfferDraftDialog";
import { OfferPreviewDialog } from "../components/OfferPreviewDialog";
import { type OfferDocument, type OfferInputs } from "../lib/offerDocument";
import { logActivityEvent } from "../lib/activityLog";

type OfferCandidate = {
  id: string;
  full_name: string;
  job_title: string;
  stage: string | null;
  email: string | null;
  ats_score: number | null;
  interview_analysis_status?: string | null;
  interview_analysis_score?: number | null;
  offer_checklist: Record<string, boolean> | null;
  offer_outcome: string | null;
  offer_sent_at: string | null;
  offer_summary: string | null;
};

type CandidateWithDocument = OfferCandidate & {
  latestDocument: OfferDocument | null;
};

const candidateSelect =
  "id, full_name, job_title, stage, email, ats_score, interview_analysis_status, interview_analysis_score, offer_checklist, offer_outcome, offer_sent_at, offer_summary";
const candidateSelectWithoutInterviewAnalysis =
  "id, full_name, job_title, stage, email, ats_score, offer_checklist, offer_outcome, offer_sent_at, offer_summary";

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

const getOfferProgressStep = (candidate: CandidateWithDocument) => {
  if (candidate.offer_checklist?.offerSent) return 2;
  if (candidate.latestDocument) return 1;
  return 0;
};

const isOfferArchived = (candidate: CandidateWithDocument) =>
  Boolean(candidate.offer_checklist?.offerArchived);

const getOfferStatusLabel = (
  candidate: CandidateWithDocument,
  t: ReturnType<typeof useI18n>["t"],
) => {
  const outcome = candidate.offer_outcome ?? "pending";
  const isSent = Boolean(candidate.offer_checklist?.offerSent);

  if (outcome === "accepted") return t("offerOutcomeAccepted");
  if (outcome === "declined") return t("offerOutcomeDeclined");
  if (isSent) return t("offerStatusSent");
  if (candidate.latestDocument) return t("offerDraftReady");
  return t("offerStatusPreparing");
};

function OfferActionSlider({
  candidate,
  disabled,
  t,
  onPrepare,
  onSend,
}: {
  candidate: CandidateWithDocument;
  disabled: boolean;
  t: ReturnType<typeof useI18n>["t"];
  onPrepare: () => void;
  onSend: () => void;
}) {
  const currentStep = getOfferProgressStep(candidate);
  const [draftStep, setDraftStep] = useState(currentStep);

  useEffect(() => {
    setDraftStep(currentStep);
  }, [currentStep]);

  const handlePosition =
    draftStep === 0 ? "10px" : draftStep === 2 ? "calc(100% - 10px)" : "50%";

  const commitStep = (step = draftStep) => {
    if (disabled) return;
    if (step <= currentStep) return;
    if (step === 1) onPrepare();
    if (step === 2) onSend();
  };

  return (
    <div className="relative min-h-[5.5rem] rounded-md border border-border bg-muted/25 p-3">
      <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>{t("offerStatusPreparing")}</span>
        <span>{t("offerDraftReady")}</span>
        <span>{t("offerStatusSent")}</span>
      </div>
      <div className="relative h-12 overflow-hidden rounded-md border border-border bg-background shadow-inner">
        <div
          className="absolute inset-y-0 left-0 rounded-md bg-gradient-to-r from-fuchsia-500 to-emerald-200 transition-all duration-300"
          style={{ width: `${(draftStep / 2) * 100}%` }}
        />
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 text-xs font-semibold">
          <div className="flex items-center justify-center text-muted-foreground">
            Priprava
          </div>
          <div className="flex items-center justify-center text-white/90 drop-shadow">
            Vnesi podatke
          </div>
          <div className="flex items-center justify-center text-foreground/80">Poslano</div>
        </div>
        <div
          className="pointer-events-none absolute top-1/2 h-10 w-5 -translate-x-1/2 -translate-y-1/2 rounded-md border border-white/70 bg-background/90 shadow-lg transition-all duration-300"
          style={{ left: handlePosition }}
        >
          <span className="absolute left-1/2 top-1/2 h-6 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-b from-fuchsia-500 to-emerald-200" />
        </div>
        <input
          aria-label="Status ponudbe"
          type="range"
          min={0}
          max={2}
          step={1}
          value={draftStep}
          disabled={disabled}
          onChange={(event) => setDraftStep(Number(event.target.value))}
          onMouseUp={() => commitStep()}
          onTouchEnd={() => commitStep()}
          onKeyUp={(event) => {
            if (event.key === "Enter" || event.key === " ") commitStep();
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Primite navpično ročko in povlecite na sredino za pripravo ponudbe ali do konca za poslano.
      </p>
    </div>
  );
}

export default function Offers() {
  const { t } = useI18n();
  const [candidates, setCandidates] = useState<CandidateWithDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [generatingCandidateId, setGeneratingCandidateId] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<
    (OfferDocument & { candidateName?: string }) | null
  >(null);
  const [draftCandidate, setDraftCandidate] = useState<CandidateWithDocument | null>(null);
  const [jobFilter, setJobFilter] = useState("all");
  const [offerStatusFilters, setOfferStatusFilters] = useState({
    offer: false,
    preparing: false,
    sent: false,
    accepted: false,
    declined: false,
    archived: false,
  });
  const [error, setError] = useState<string | null>(null);

  const loadOffers = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const candidateResult = await supabase
      .from("candidates")
      .select(candidateSelect)
      .in("stage", ["Offer", "Accepted", "Rejected"])
      .order("created_at", { ascending: false });
    let candidateRows = candidateResult.data as Array<Record<string, unknown>> | null;
    let candidateError = candidateResult.error;

    if (
      candidateError &&
      (candidateError.message?.includes("interview_analysis") ||
        candidateError.details?.includes("interview_analysis"))
    ) {
      const retry = await supabase
        .from("candidates")
        .select(candidateSelectWithoutInterviewAnalysis)
        .in("stage", ["Offer", "Accepted", "Rejected"])
        .order("created_at", { ascending: false });
      candidateRows = retry.data as Array<Record<string, unknown>> | null;
      candidateError = retry.error;
    }

    if (candidateError) {
      setCandidates([]);
      setError(candidateError.message);
      setIsLoading(false);
      return;
    }

    const rows = ((candidateRows ?? []) as OfferCandidate[]).filter(
      (candidate) =>
        candidate.stage !== "Rejected" || candidate.offer_outcome === "declined",
    );
    const candidateIds = rows.map((candidate) => candidate.id);
    let documents: Array<OfferDocument & { candidate_id: string }> = [];

    if (candidateIds.length) {
      const { data: documentRows, error: documentError } = await supabase
        .from("offer_documents")
        .select("id, candidate_id, title, content, inputs, status, created_at")
        .in("candidate_id", candidateIds)
        .order("created_at", { ascending: false });

      if (documentError) {
        setError(documentError.message);
      } else {
        documents = (documentRows ?? []) as Array<OfferDocument & { candidate_id: string }>;
      }
    }

    const latestByCandidate = new Map<string, OfferDocument>();
    documents.forEach((document) => {
      if (!latestByCandidate.has(document.candidate_id)) {
        latestByCandidate.set(document.candidate_id, document);
      }
    });

    setCandidates(
      rows.map((candidate) => ({
        ...candidate,
        latestDocument: latestByCandidate.get(candidate.id) ?? null,
      })),
    );
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadOffers();
  }, [loadOffers]);

  const stats = useMemo(() => {
    const sent = candidates.filter((candidate) => candidate.offer_checklist?.offerSent).length;
    const accepted = candidates.filter((candidate) => candidate.offer_outcome === "accepted").length;
    const declined = candidates.filter((candidate) => candidate.offer_outcome === "declined").length;
    const withDraft = candidates.filter((candidate) => candidate.latestDocument).length;
    const due = candidates.filter(
      (candidate) =>
        (candidate.offer_outcome ?? "pending") === "pending" &&
        !candidate.offer_checklist?.offerSent,
    ).length;

    return {
      total: candidates.length,
      due,
      withDraft,
      sent,
      accepted,
      declined,
    };
  }, [candidates]);

  const jobOptions = useMemo(
    () => [...new Set(candidates.map((candidate) => candidate.job_title))].sort(),
    [candidates],
  );

  const toggleOfferStatusFilter = (
    filter: keyof typeof offerStatusFilters,
    checked: boolean,
  ) => {
    setOfferStatusFilters((current) => ({
      ...current,
      [filter]: checked,
      ...(filter === "offer" && !checked
        ? { preparing: false, sent: false, accepted: false, declined: false }
        : {}),
    }));
  };

  const matchesOfferStatusFilters = (candidate: CandidateWithDocument) => {
    const isArchived = isOfferArchived(candidate);
    if (offerStatusFilters.archived) return isArchived;
    if (isArchived) return false;

    const hasActiveOfferFilter = Object.entries(offerStatusFilters).some(
      ([key, value]) => key !== "archived" && value,
    );
    if (!hasActiveOfferFilter) return true;

    const offerSent = Boolean(candidate.offer_checklist?.offerSent);
    const outcome = candidate.offer_outcome ?? "pending";
    const hasActiveOfferSubFilter =
      offerStatusFilters.preparing ||
      offerStatusFilters.sent ||
      offerStatusFilters.accepted ||
      offerStatusFilters.declined;

    if (offerStatusFilters.offer && !hasActiveOfferSubFilter) {
      return true;
    }

    return (
      (offerStatusFilters.preparing && candidate.stage === "Offer" && !offerSent) ||
      (offerStatusFilters.sent && offerSent && outcome === "pending") ||
      (offerStatusFilters.accepted && outcome === "accepted") ||
      (offerStatusFilters.declined && outcome === "declined")
    );
  };

  const filteredCandidates = useMemo(
    () =>
      candidates
        .filter((candidate) => jobFilter === "all" || candidate.job_title === jobFilter)
        .filter((candidate) => matchesOfferStatusFilters(candidate)),
    [candidates, jobFilter, offerStatusFilters],
  );

  const generateOffer = async (candidate: OfferCandidate, offerInputs: OfferInputs) => {
    setGeneratingCandidateId(candidate.id);
    setError(null);

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
      const document = result.document as OfferDocument;
      void logActivityEvent({
        action: "offer_document_created",
        entityType: "offer_document",
        entityId: document.id,
        entityLabel: document.title,
        toValue: document.status ?? "draft",
        metadata: { candidate_id: candidate.id, candidate_name: candidate.full_name },
      });
      setCandidates((current) =>
        current.map((item) =>
          item.id === candidate.id ? { ...item, latestDocument: document } : item,
        ),
      );
      setSelectedDocument({ ...document, candidateName: candidate.full_name });
      setDraftCandidate(null);
      return document;
    } catch (generationError) {
      const message =
        generationError instanceof Error
          ? generationError.message
          : t("offerDocumentGenerateFailed");
      setError(message);
      return null;
    } finally {
      setGeneratingCandidateId(null);
    }
  };

  const updateDocument = (document: OfferDocument) => {
    void logActivityEvent({
      action: "offer_document_updated",
      entityType: "offer_document",
      entityId: document.id,
      entityLabel: document.title,
      toValue: document.status ?? "draft",
    });
    setSelectedDocument((current) =>
      current ? { ...document, candidateName: current.candidateName } : document,
    );
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.latestDocument?.id === document.id
          ? { ...candidate, latestDocument: document }
          : candidate,
      ),
    );
  };

  const markOfferSent = async (candidate: CandidateWithDocument) => {
    const nextChecklist = {
      ...(candidate.offer_checklist ?? {}),
      offerSent: true,
    };
    const sentDate = candidate.offer_sent_at ?? new Date().toISOString().slice(0, 10);

    const [{ error: updateError }, { error: documentError }] = await Promise.all([
      supabase
        .from("candidates")
        .update({
          offer_checklist: nextChecklist,
          offer_sent_at: sentDate,
        })
        .eq("id", candidate.id),
      candidate.latestDocument
        ? supabase
            .from("offer_documents")
            .update({ status: "sent" })
            .eq("id", candidate.latestDocument.id)
        : Promise.resolve({ error: null }),
    ]);

    if (updateError || documentError) {
      setError(updateError?.message || documentError?.message || t("failedOfferUpdate"));
      return;
    }

    setCandidates((current) =>
      current.map((item) =>
        item.id === candidate.id
          ? {
              ...item,
              offer_checklist: nextChecklist,
              offer_sent_at: sentDate,
              latestDocument: item.latestDocument
                ? { ...item.latestDocument, status: "sent" }
                : item.latestDocument,
            }
          : item,
      ),
    );
    void logActivityEvent({
      action: "offer_sent",
      entityType: "offer_document",
      entityId: candidate.latestDocument?.id ?? candidate.id,
      entityLabel: candidate.latestDocument?.title ?? candidate.full_name,
      fromValue: candidate.latestDocument?.status ?? "draft",
      toValue: "sent",
      metadata: { candidate_id: candidate.id, candidate_name: candidate.full_name },
    });
  };

  const updateOfferOutcome = async (
    candidate: CandidateWithDocument,
    outcome: "accepted" | "declined",
  ) => {
    if (outcome === "accepted") {
      const capacity = await getJobCapacityForTitle(candidate.job_title);
      const alreadyAccepted = candidate.stage === "Accepted";
      const nextAcceptedCount =
        (capacity?.acceptedCount ?? 0) + (alreadyAccepted ? 0 : 1);
      const wouldExceedCapacity = capacity
        ? (capacity.status ?? "active") === "inactive" ||
          nextAcceptedCount > capacity.openings
        : false;

      if (capacity && wouldExceedCapacity) {
        const confirmed = window.confirm(
          `To delo ima trenutno ${capacity.acceptedCount}/${capacity.openings} sprejetih kandidatov. Sprejem tega kandidata bi presegel kapaciteto. Želite povečati število mest na ${nextAcceptedCount} in nadaljevati?`,
        );

        if (!confirmed) {
          setError("Sprejem kandidata je bil preklican, ker je delo zapolnjeno.");
          return;
        }

        await increaseJobOpeningsForTitle(candidate.job_title, nextAcceptedCount);
      }
    }

    const nextStage = outcome === "accepted" ? "Accepted" : "Rejected";
    const documentStatus = outcome === "accepted" ? "accepted" : "declined";
    const nextChecklist = {
      ...(candidate.offer_checklist ?? {}),
      offerSent: true,
    };
    const sentDate = candidate.offer_sent_at ?? new Date().toISOString().slice(0, 10);

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
      candidate.latestDocument
        ? supabase
            .from("offer_documents")
            .update({ status: documentStatus })
            .eq("id", candidate.latestDocument.id)
        : Promise.resolve({ error: null }),
    ]);

    if (candidateError || documentError) {
      setError(candidateError?.message || documentError?.message || t("failedOfferUpdate"));
      return;
    }

    setCandidates((current) =>
      current
        .map((item) =>
          item.id === candidate.id
            ? {
                ...item,
                stage: nextStage,
                offer_outcome: outcome,
                offer_checklist: nextChecklist,
                offer_sent_at: sentDate,
                latestDocument: item.latestDocument
                  ? { ...item.latestDocument, status: documentStatus }
                  : item.latestDocument,
              }
            : item,
        ),
    );

    if (outcome === "accepted" || candidate.stage === "Accepted") {
      await syncJobStatusForTitle(candidate.job_title);
    }
    void logActivityEvent({
      action: "offer_outcome_changed",
      entityType: "candidate",
      entityId: candidate.id,
      entityLabel: candidate.full_name,
      fromValue: candidate.offer_outcome ?? "pending",
      toValue: outcome,
      metadata: {
        job_title: candidate.job_title,
        offer_document_id: candidate.latestDocument?.id ?? null,
      },
    });
  };

  const updateOfferArchive = async (
    candidate: CandidateWithDocument,
    archived: boolean,
  ) => {
    const nextChecklist = {
      ...(candidate.offer_checklist ?? {}),
      offerArchived: archived,
    };

    const { error: archiveError } = await supabase
      .from("candidates")
      .update({ offer_checklist: nextChecklist })
      .eq("id", candidate.id);

    if (archiveError) {
      setError(archiveError.message || t("failedOfferUpdate"));
      return;
    }

    setCandidates((current) =>
      current.map((item) =>
        item.id === candidate.id
          ? { ...item, offer_checklist: nextChecklist }
          : item,
      ),
    );

    void logActivityEvent({
      action: "offer_outcome_changed",
      entityType: "candidate",
      entityId: candidate.id,
      entityLabel: candidate.full_name,
      fromValue: archived ? "visible" : "archived",
      toValue: archived ? "archived" : "visible",
      metadata: {
        job_title: candidate.job_title,
        offer_document_id: candidate.latestDocument?.id ?? null,
      },
    });
  };

  return (
    <div className="page-container">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">{t("offers")}</h1>
          <p className="text-sm subtle-text">{t("offersSubtitle")}</p>
        </div>
      </div>

      <div className="grid max-w-5xl grid-cols-[repeat(auto-fit,minmax(8.75rem,1fr))] gap-3">
        {[
          { label: t("offerWorkspaceTotal"), value: stats.total },
          { label: t("offerWorkspaceDue"), value: stats.due },
          { label: t("offerWorkspaceDrafts"), value: stats.withDraft },
          { label: t("offerWorkspaceSent"), value: stats.sent },
          { label: t("offerOutcomeAccepted"), value: stats.accepted },
          { label: t("offerOutcomeDeclined"), value: stats.declined },
        ].map((stat) => (
          <div key={stat.label} className="surface-card min-h-24 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {stat.label}
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {error ? (
        <div className="surface-card border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="surface-card flex flex-wrap items-end gap-3 p-3">
        <div className="grid min-w-[min(100%,13rem)] flex-1 gap-1.5 sm:flex-none">
          <Label>{t("filterByJob")}</Label>
          <Select value={jobFilter} onValueChange={setJobFilter}>
            <SelectTrigger className="h-10 border-border bg-background shadow-sm dark:bg-muted/30">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allJobs")}</SelectItem>
              {jobOptions.map((jobTitle) => (
                <SelectItem key={jobTitle} value={jobTitle}>
                  {jobTitle}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid min-w-0 flex-[999_1_20rem] gap-1.5">
          <Label>{t("offerStatusFilters")}</Label>
          <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border bg-background px-3 py-2 shadow-sm dark:bg-muted/30">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
              <Checkbox
                className="border-border bg-background shadow-sm dark:border-muted-foreground dark:bg-background"
                checked={offerStatusFilters.offer}
                onCheckedChange={(checked) =>
                  toggleOfferStatusFilter("offer", checked === true)
                }
              />
              Ponudba
            </label>
            {offerStatusFilters.offer ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-2 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    className="border-border bg-background shadow-sm dark:border-muted-foreground dark:bg-background"
                    checked={offerStatusFilters.preparing}
                    onCheckedChange={(checked) =>
                      toggleOfferStatusFilter("preparing", checked === true)
                    }
                  />
                  {t("offerStatusPreparing")}
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    className="border-border bg-background shadow-sm dark:border-muted-foreground dark:bg-background"
                    checked={offerStatusFilters.sent}
                    onCheckedChange={(checked) =>
                      toggleOfferStatusFilter("sent", checked === true)
                    }
                  />
                  Poslana, čaka odgovor
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    className="border-border bg-background shadow-sm dark:border-muted-foreground dark:bg-background"
                    checked={offerStatusFilters.accepted}
                    onCheckedChange={(checked) =>
                      toggleOfferStatusFilter("accepted", checked === true)
                    }
                  />
                  Sprejeta ponudba
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    className="border-border bg-background shadow-sm dark:border-muted-foreground dark:bg-background"
                    checked={offerStatusFilters.declined}
                    onCheckedChange={(checked) =>
                      toggleOfferStatusFilter("declined", checked === true)
                    }
                  />
                  Zavrnjena ponudba
                </label>
              </div>
            ) : null}
          </div>
        </div>
        <div className="grid min-w-[min(100%,10rem)] flex-1 gap-1.5 sm:ml-auto sm:flex-none">
          <Label>Prikaz</Label>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm dark:bg-muted/30">
            <Checkbox
              className="border-border bg-background shadow-sm dark:border-muted-foreground dark:bg-background"
              checked={offerStatusFilters.archived}
              onCheckedChange={(checked) =>
                toggleOfferStatusFilter("archived", checked === true)
              }
            />
            Arhivirano
          </label>
        </div>
      </div>

      {isLoading ? (
        <div className="surface-card flex items-center justify-center border-dashed py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {t("loadingOffers")}
        </div>
      ) : candidates.length === 0 ? (
        <div className="surface-card border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("noOfferCandidates")}
        </div>
      ) : filteredCandidates.length === 0 ? (
        <div className="surface-card border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("noApplicants")}
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredCandidates.map((candidate) => {
            const isSent = Boolean(candidate.offer_checklist?.offerSent);
            const outcome = candidate.offer_outcome ?? "pending";
            const isGenerating = generatingCandidateId === candidate.id;
            const atsScore =
              candidate.ats_score == null
                ? null
                : Math.round(Number(candidate.ats_score));
            const interviewAnalysisScore =
              candidate.interview_analysis_status === "complete" &&
              candidate.interview_analysis_score != null
                ? Math.round(Number(candidate.interview_analysis_score))
                : null;
            const statusLabel = getOfferStatusLabel(candidate, t);

            return (
              <div
                key={candidate.id}
                className="surface-card grid gap-4 overflow-hidden p-4 xl:grid-cols-[minmax(19rem,0.9fr)_minmax(28rem,1.25fr)_minmax(13rem,0.45fr)]"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-gradient-to-br from-cyan-500/20 via-violet-500/20 to-emerald-500/20 text-lg font-semibold text-foreground">
                    {candidate.full_name ? getInitials(candidate.full_name) : (
                      <UserRound className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-semibold text-foreground">
                        {candidate.full_name}
                      </h2>
                      <Badge
                        variant={
                          outcome === "accepted" || isSent ? "secondary" : "default"
                        }
                      >
                        {statusLabel}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium text-muted-foreground">
                      {candidate.job_title}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      ATS score
                      <span className="ml-2 font-semibold text-foreground">
                        {atsScore == null ? "-" : `${atsScore}%`}
                      </span>
                    </p>
                    {interviewAnalysisScore != null ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        CV + razgovor AI
                        <span className="ml-2 font-semibold text-cyan-600 dark:text-cyan-300">
                          {interviewAnalysisScore}%
                        </span>
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="min-w-0">
                  {outcome === "accepted" || outcome === "declined" ? (
                    <div
                      className={`grid min-h-[5.5rem] content-center rounded-md border p-3 transition-all duration-300 ${
                        outcome === "accepted"
                          ? "border-emerald-500/30 bg-emerald-500/10"
                          : "border-red-500/30 bg-red-500/10"
                      }`}
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        {outcome === "accepted" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        {statusLabel}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Končni status ponudbe je zabeležen.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => updateOfferArchive(candidate, !isOfferArchived(candidate))}
                        className="mt-3 w-fit"
                      >
                        {isOfferArchived(candidate) ? "Odstrani iz arhiva" : "Arhiviraj kandidata"}
                      </Button>
                    </div>
                  ) : isSent ? (
                    <div className="grid min-h-[5.5rem] content-center gap-3 rounded-md border border-border bg-muted/25 p-3 transition-all duration-300">
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Send className="h-4 w-4 text-emerald-500" />
                        Ponudba je označena kot poslana
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => updateOfferOutcome(candidate, "accepted")}
                          className="gap-2 border-emerald-500/40 text-emerald-600 hover:text-emerald-700"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {t("markOfferAccepted")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => updateOfferOutcome(candidate, "declined")}
                          className="gap-2 border-red-500/40 text-red-600 hover:text-red-700"
                        >
                          <XCircle className="h-4 w-4" />
                          {t("markOfferDeclined")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <OfferActionSlider
                      candidate={candidate}
                      disabled={isGenerating}
                      t={t}
                      onPrepare={() => setDraftCandidate(candidate)}
                      onSend={() => {
                        if (candidate.latestDocument) {
                          void markOfferSent(candidate);
                        } else {
                          setDraftCandidate(candidate);
                        }
                      }}
                    />
                  )}
                </div>

                <div className="grid content-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDraftCandidate(candidate)}
                    disabled={isGenerating}
                    className="justify-start gap-2"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    {candidate.latestDocument ? t("editOfferData") : t("enterOfferData")}
                  </Button>
                  {candidate.latestDocument ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSelectedDocument({
                          ...candidate.latestDocument!,
                          candidateName: candidate.full_name,
                        })
                      }
                      className="justify-start gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      {t("preview")}
                    </Button>
                  ) : null}
                  <Button asChild type="button" variant="ghost" size="sm" className="justify-start">
                    <Link
                      to={`/applicants/${candidate.id}?returnTo=${encodeURIComponent("/offers")}`}
                      state={{ returnTo: "/offers" }}
                    >
                      {t("review")}
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <OfferDraftDialog
        candidateName={draftCandidate?.full_name}
        error={error}
        initialInputs={draftCandidate?.latestDocument?.inputs}
        isGenerating={Boolean(draftCandidate && generatingCandidateId === draftCandidate.id)}
        open={Boolean(draftCandidate)}
        onOpenChange={(open) => !open && setDraftCandidate(null)}
        onGenerate={(inputs) =>
          draftCandidate ? generateOffer(draftCandidate, inputs) : Promise.resolve(null)
        }
      />

      <OfferPreviewDialog
        candidateName={selectedDocument?.candidateName}
        document={selectedDocument}
        open={Boolean(selectedDocument)}
        onDocumentChange={updateDocument}
        onOpenChange={(open) => !open && setSelectedDocument(null)}
      />
    </div>
  );
}
