import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { clsx } from "clsx";
import { CheckCircle2, Eye, FileText, Loader2, Plus, Search, Send, UserRound, XCircle } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { StatStrip } from "../components/shell/StatStrip";
import { scoreBand, scoreBandText } from "../lib/score";
import { useConfirm } from "../lib/confirm";
import { Checkbox } from "../components/ui/checkbox";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
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
import {
  createOfferDocument,
  offerDocumentStyles,
  offerTemplates,
  type OfferDocument,
  type OfferInputs,
} from "../lib/offerDocument";
import { logActivityEvent } from "../lib/activityLog";
import { matchesCandidateSearch } from "../lib/candidateIdentity";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type OfferCandidate = {
  id: string;
  full_name: string;
  job_title: string;
  stage: string | null;
  email: string | null;
  ats_score: number | null;
  interview_analysis_status?: string | null;
  interview_analysis_score?: number | null;
  offer_checklist: Record<string, unknown> | null;
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

const getNumberChecklistValue = (
  checklist: CandidateWithDocument["offer_checklist"],
  key: string,
) => {
  const value = checklist?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const formatGrossAmount = (value: number | null) =>
  typeof value === "number"
    ? new Intl.NumberFormat("sl-SI", {
        maximumFractionDigits: 0,
      }).format(value)
    : null;

const getNegotiationLabel = (candidate: CandidateWithDocument, tt: (value: string) => string) => {
  const status = candidate.offer_checklist?.negotiationStatus;
  if (status === "in_range") return tt("Znotraj budgeta");
  if (status === "borderline") return tt("Na meji");
  if (status === "over_budget") return tt("Presega budget");
  if (status === "missing") return tt("Čaka podatke");
  return null;
};

const getNegotiationTone = (candidate: CandidateWithDocument) => {
  const status = candidate.offer_checklist?.negotiationStatus;
  if (status === "over_budget") return "text-red-500";
  if (status === "in_range" || status === "borderline") return "text-emerald-500";
  return "text-muted-foreground";
};

const offersViewStorageKey = "smart-ats-offers-view-state";
const activeOfferDraftStorageKey = "smart-ats-offers-active-draft-candidate";

const defaultOfferWorkspaceFilters = {
  offer: false,
  preparing: false,
  sent: false,
  accepted: false,
  declined: false,
  archived: false,
};

type OffersViewState = {
  jobFilter: string;
  offerStatusFilters: typeof defaultOfferWorkspaceFilters;
};

const readOffersViewState = (): Partial<OffersViewState> | null => {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(offersViewStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

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

function OfferActionSteps({
  candidate,
  disabled,
  t,
  tt,
  onPrepare,
  onSend,
}: {
  candidate: CandidateWithDocument;
  disabled: boolean;
  t: ReturnType<typeof useI18n>["t"];
  tt: ReturnType<typeof useI18n>["tt"];
  onPrepare: () => void;
  onSend: () => void;
}) {
  const currentStep = getOfferProgressStep(candidate);
  const steps = [t("offerStatusPreparing"), t("offerDraftReady"), t("offerStatusSent")];

  return (
    <div className="grid min-h-[5.5rem] content-center gap-3 rounded-xl bg-muted/30 p-3">
      <ol className="flex items-center">
        {steps.map((label, index) => {
          const isDone = index < currentStep;
          const isCurrent = index === currentStep;
          const isLast = index === steps.length - 1;
          return (
            <li key={label} className="flex min-w-0 flex-1 items-center">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    isCurrent
                      ? "bg-primary text-primary-foreground"
                      : isDone
                        ? "bg-emerald-500 text-white"
                        : "border border-border text-muted-foreground"
                  }`}
                >
                  {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span
                  className={`truncate text-xs font-medium ${
                    isCurrent ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </span>
              </div>
              {!isLast ? (
                <span
                  className={`mx-2 h-px min-w-3 flex-1 ${
                    index < currentStep ? "bg-emerald-500/50" : "bg-border"
                  }`}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      {!disabled && currentStep < 2 ? (
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={currentStep === 0 ? onPrepare : onSend}>
            {currentStep === 0 ? tt("Pripravi osnutek") : tt("Označi kot poslano")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export default function Offers() {
  const { t, tt } = useI18n();
  const confirm = useConfirm();
  const restoredViewState = useMemo(() => readOffersViewState(), []);
  const [candidates, setCandidates] = useState<CandidateWithDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [generatingCandidateId, setGeneratingCandidateId] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<
    (OfferDocument & { candidateName?: string }) | null
  >(null);
  const [draftCandidate, setDraftCandidate] = useState<CandidateWithDocument | null>(null);
  const [isPresetSetupOpen, setIsPresetSetupOpen] = useState(false);
  const [jobFilter, setJobFilter] = useState(restoredViewState?.jobFilter ?? "all");
  const [searchQuery, setSearchQuery] = useState("");
  const [offerStatusFilters, setOfferStatusFilters] = useState({
    ...defaultOfferWorkspaceFilters,
    ...(restoredViewState?.offerStatusFilters ?? {}),
  });
  const [error, setError] = useState<string | null>(null);

  const loadOffers = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const candidateResult = await supabase
      .from("candidates_secure")
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
        .from("candidates_secure")
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
        .from("offer_documents_secure")
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

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.sessionStorage.setItem(
      offersViewStorageKey,
      JSON.stringify({ jobFilter, offerStatusFilters }),
    );
  }, [jobFilter, offerStatusFilters]);

  useEffect(() => {
    if (draftCandidate || candidates.length === 0 || typeof window === "undefined") return;

    const draftCandidateId = window.sessionStorage.getItem(activeOfferDraftStorageKey);
    const candidate = candidates.find((item) => item.id === draftCandidateId);
    if (candidate) {
      setDraftCandidate(candidate);
    }
  }, [candidates, draftCandidate]);

  const openDraftCandidate = (candidate: CandidateWithDocument) => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(activeOfferDraftStorageKey, candidate.id);
    }
    setDraftCandidate(candidate);
  };

  const closeDraftCandidate = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(activeOfferDraftStorageKey);
    }
    setDraftCandidate(null);
  };

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
        .filter((candidate) => matchesCandidateSearch({ candidateId: candidate.id, query: searchQuery, values: [candidate.full_name, candidate.job_title, candidate.email] }))
        .filter((candidate) => jobFilter === "all" || candidate.job_title === jobFilter)
        .filter((candidate) => matchesOfferStatusFilters(candidate)),
    [candidates, jobFilter, offerStatusFilters, searchQuery],
  );

  const budgetChartData = useMemo(
    () =>
      filteredCandidates
        .map((candidate) => ({
          id: candidate.id,
          name: candidate.full_name,
          expected:
            getNumberChecklistValue(candidate.offer_checklist, "candidateExpectedGross") ?? 0,
          max: getNumberChecklistValue(candidate.offer_checklist, "negotiationMaxGross") ?? 0,
          status: String(candidate.offer_checklist?.negotiationStatus ?? "missing"),
        }))
        .filter((item) => item.expected > 0 || item.max > 0)
        .slice(0, 10),
    [filteredCandidates],
  );

  const budgetStatusStats = useMemo(
    () => ({
      inRange: filteredCandidates.filter((candidate) => {
        const status = candidate.offer_checklist?.negotiationStatus;
        return status === "in_range" || status === "borderline";
      }).length,
      overBudget: filteredCandidates.filter(
        (candidate) => candidate.offer_checklist?.negotiationStatus === "over_budget",
      ).length,
      missing: filteredCandidates.filter(
        (candidate) => !candidate.offer_checklist?.negotiationStatus || candidate.offer_checklist?.negotiationStatus === "missing",
      ).length,
    }),
    [filteredCandidates],
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

      const generatedDocument = createOfferDocument({
        candidateName: candidate.full_name,
        jobTitle: candidate.job_title,
        inputs: offerInputs,
      });
      // content/inputs are encrypted at rest: insert the row without the
      // plaintext sensitive columns, then write the real values via the RPC.
      const { data, error: insertError } = await supabase
        .from("offer_documents")
        .insert({
          user_id: sessionData.session.user.id,
          candidate_id: candidate.id,
          title: generatedDocument.title,
          status: "draft",
          generated_by: sessionData.session.user.id,
        })
        .select("id, title, status, created_at")
        .single();
      if (insertError || !data) {
        throw new Error(insertError?.message || t("offerDocumentGenerateFailed"));
      }
      const { error: offerEncError } = await supabase.rpc(
        "offer_document_set_secure",
        {
          p_id: data.id,
          p_content: generatedDocument.content,
          p_inputs: generatedDocument.inputs,
        },
      );
      if (offerEncError) {
        throw new Error(offerEncError.message || t("offerDocumentGenerateFailed"));
      }
      const document = {
        ...data,
        content: generatedDocument.content,
        inputs: generatedDocument.inputs,
      } as OfferDocument;
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
      closeDraftCandidate();
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
        const confirmed = await confirm({
          title: tt("Delo je zapolnjeno"),
          description:
            tt("To delo ima trenutno") +
            ` ${capacity.acceptedCount}/${capacity.openings} ` +
            tt("sprejetih kandidatov. Sprejem tega kandidata bi presegel kapaciteto. Želite povečati število mest na") +
            ` ${nextAcceptedCount} ` +
            tt("in nadaljevati?"),
          confirmLabel: tt("Poveči in nadaljuj"),
        });

        if (!confirmed) {
          setError(tt("Sprejem kandidata je bil preklican, ker je delo zapolnjeno."));
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
      action: "offer_archived",
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
        <Badge variant="secondary">{tt("Komercialna odločitev")}</Badge>
      </div>

      <StatStrip
        items={[
          { label: t("offerWorkspaceTotal"), value: stats.total },
          { label: t("offerWorkspaceDue"), value: stats.due },
          { label: t("offerWorkspaceDrafts"), value: stats.withDraft },
          { label: t("offerWorkspaceSent"), value: stats.sent },
          { label: t("offerOutcomeAccepted"), value: stats.accepted },
          { label: t("offerOutcomeDeclined"), value: stats.declined },
        ]}
      />

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">{tt("Knjižnica ponudb")}</h2>
            <p className="text-sm text-muted-foreground">
              {tt("Predloge uporabljajo vnaprej odobreno besedilo. Podatki kandidata se vstavijo brez AI generiranja.")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={() => setIsPresetSetupOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              {tt("Nova predloga")}
            </Button>
            {offerDocumentStyles.map((style) => <Badge key={style.id} variant="outline">{style.name}</Badge>)}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {offerTemplates.map((template, index) => (
            <div key={template.id} className="flex min-h-28 items-start gap-3 rounded-lg border border-border bg-background p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-semibold text-primary">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{tt(template.name)}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{tt(template.description)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-border bg-card p-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.45fr)]">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">{tt("Budget kandidatov")}</h2>
              <p className="text-sm text-muted-foreground">
                {tt("Primerjava bruto pričakovanja kandidata z največjim budgetom pozicije.")}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" />{tt("Pričakovanje")}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />{tt("Max budget")}</span>
            </div>
          </div>
          {budgetChartData.length ? (
            <div className="h-[300px] min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
                <BarChart data={budgetChartData} layout="vertical" margin={{ top: 0, right: 24, bottom: 10, left: 18 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(value) => `${Math.round(Number(value) / 100) / 10}k`} />
                  <YAxis type="category" dataKey="name" width={112} tick={{ fill: "var(--foreground)", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value) => `${new Intl.NumberFormat("sl-SI").format(Number(value))} €`} />
                  <Bar dataKey="max" name={tt("Max budget")} fill="#cbd5e1" radius={[0, 3, 3, 0]} maxBarSize={14} />
                  <Bar dataKey="expected" name={tt("Pričakovanje")} radius={[0, 3, 3, 0]} maxBarSize={14}>
                    {budgetChartData.map((item) => (
                      <Cell
                        key={item.id}
                        fill={item.status === "over_budget" ? "#ef4444" : item.status === "missing" ? "#94a3b8" : "#10b981"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[220px] items-center justify-center rounded-md bg-muted/25 text-sm text-muted-foreground">
              {tt("Dodaj pričakovanje kandidata in budget pozicije za prikaz grafa.")}
            </div>
          )}
        </div>

        <div className="grid content-start gap-3 border-t border-border pt-4 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
          <h3 className="text-sm font-semibold text-foreground">{tt("Budget status")}</h3>
          <div className="grid gap-2">
            <div className="flex items-center justify-between rounded-md bg-emerald-500/10 px-3 py-2.5">
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{tt("Znotraj budgeta")}</span>
              <span className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{budgetStatusStats.inRange}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-red-500/10 px-3 py-2.5">
              <span className="text-sm font-medium text-red-700 dark:text-red-300">{tt("Presega budget")}</span>
              <span className="text-lg font-semibold tabular-nums text-red-700 dark:text-red-300">{budgetStatusStats.overBudget}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2.5">
              <span className="text-sm font-medium text-muted-foreground">{tt("Manjkajo podatki")}</span>
              <span className="text-lg font-semibold tabular-nums text-foreground">{budgetStatusStats.missing}</span>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {tt("Rdeče vrstice zahtevajo odločitev ali novo pogajanje. Zelene so znotraj potrjenega razpona.")}
          </p>
        </div>
      </section>

      {error ? (
        <div className="surface-card border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="surface-card flex flex-wrap items-end gap-3 p-3">
        <div className="grid min-w-[min(100%,15rem)] flex-1 gap-1.5">
          <Label>{tt("Išči kandidata")}</Label>
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={tt("Ime, email ali ID kandidata")} className="h-10 pl-9"/></div>
        </div>
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
            <div
              className={clsx(
                "flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-2 transition-opacity sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0",
                !offerStatusFilters.offer && "pointer-events-none opacity-45",
              )}
              aria-disabled={!offerStatusFilters.offer}
            >
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <Checkbox
                  className="border-border bg-background shadow-sm dark:border-muted-foreground dark:bg-background"
                  checked={offerStatusFilters.preparing}
                  disabled={!offerStatusFilters.offer}
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
                  disabled={!offerStatusFilters.offer}
                  onCheckedChange={(checked) =>
                    toggleOfferStatusFilter("sent", checked === true)
                  }
                />
                {tt("Poslana, čaka odgovor")}
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <Checkbox
                  className="border-border bg-background shadow-sm dark:border-muted-foreground dark:bg-background"
                  checked={offerStatusFilters.accepted}
                  disabled={!offerStatusFilters.offer}
                  onCheckedChange={(checked) =>
                    toggleOfferStatusFilter("accepted", checked === true)
                  }
                />
                {tt("Sprejeta ponudba")}
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <Checkbox
                  className="border-border bg-background shadow-sm dark:border-muted-foreground dark:bg-background"
                  checked={offerStatusFilters.declined}
                  disabled={!offerStatusFilters.offer}
                  onCheckedChange={(checked) =>
                    toggleOfferStatusFilter("declined", checked === true)
                  }
                />
                {tt("Zavrnjena ponudba")}
              </label>
            </div>
          </div>
        </div>
        <div className="grid min-w-[min(100%,10rem)] flex-1 gap-1.5 sm:ml-auto sm:flex-none">
          <Label>{tt("Prikaz")}</Label>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm dark:bg-muted/30">
            <Checkbox
              className="border-border bg-background shadow-sm dark:border-muted-foreground dark:bg-background"
              checked={offerStatusFilters.archived}
              onCheckedChange={(checked) =>
                toggleOfferStatusFilter("archived", checked === true)
              }
            />
            {tt("Arhivirano")}
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
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="hidden grid-cols-[minmax(15rem,1.2fr)_8rem_minmax(12rem,0.9fr)_minmax(10rem,0.75fr)_minmax(19rem,1.25fr)] items-center border-b border-border bg-muted/35 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
            <span>{tt("Kandidat")}</span>
            <span>{tt("Ocena")}</span>
            <span>{tt("Budget")}</span>
            <span>{tt("Status")}</span>
            <span className="text-right">{tt("Akcije")}</span>
          </div>
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
            const negotiationLabel = getNegotiationLabel(candidate, tt);
            const negotiationTone = getNegotiationTone(candidate);
            const expectedGross = formatGrossAmount(
              getNumberChecklistValue(candidate.offer_checklist, "candidateExpectedGross"),
            );
            const maxGross = formatGrossAmount(
              getNumberChecklistValue(candidate.offer_checklist, "negotiationMaxGross"),
            );

            return (
              <div
                key={candidate.id}
                className="grid gap-3 border-b border-border px-4 py-3 last:border-b-0 lg:grid-cols-[minmax(15rem,1.2fr)_8rem_minmax(12rem,0.9fr)_minmax(10rem,0.75fr)_minmax(19rem,1.25fr)] lg:items-center"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold uppercase text-primary">
                    {candidate.full_name ? getInitials(candidate.full_name) : (
                      <UserRound className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/applicants/${candidate.id}?returnTo=${encodeURIComponent("/offers")}`}
                        className="truncate text-sm font-semibold text-foreground hover:text-primary hover:underline"
                      >
                        {candidate.full_name}
                      </Link>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{candidate.job_title}</p>
                  </div>
                </div>

                <div className="grid gap-0.5 text-xs">
                  <span className={`font-semibold ${atsScore == null ? "text-muted-foreground" : scoreBandText[scoreBand(atsScore)]}`}>
                    ATS {atsScore == null ? "—" : `${atsScore}%`}
                  </span>
                  <span className={interviewAnalysisScore == null ? "text-muted-foreground" : `font-semibold ${scoreBandText[scoreBand(interviewAnalysisScore)]}`}>
                    {tt("CV + razgovor")} {interviewAnalysisScore == null ? "—" : `${interviewAnalysisScore}%`}
                  </span>
                </div>

                <div className="min-w-0 text-xs">
                  <p className={`font-semibold ${negotiationTone}`}>{negotiationLabel ?? tt("Čaka podatke")}</p>
                  <p className="mt-0.5 truncate text-muted-foreground">
                    {expectedGross ? `${tt("Želi")} ${expectedGross} €` : tt("Pričakovanje ni vneseno")}
                    {maxGross ? ` · Max ${maxGross} €` : ""}
                  </p>
                </div>

                <Badge
                  variant={outcome === "accepted" ? "success" : outcome === "declined" ? "destructive" : isSent ? "secondary" : "outline"}
                  className="w-fit"
                >
                  {statusLabel}
                </Badge>

                <div className="flex flex-wrap items-center justify-start gap-1 lg:justify-end">
                  {isSent && outcome === "pending" ? (
                    <>
                      <Button type="button" variant="outline" size="sm" onClick={() => updateOfferOutcome(candidate, "accepted")} className="gap-1.5 text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> {tt("Sprejmi")}
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => updateOfferOutcome(candidate, "declined")} className="gap-1.5 text-red-700">
                        <XCircle className="h-3.5 w-3.5" /> {tt("Zavrni")}
                      </Button>
                    </>
                  ) : null}
                  {!isSent && candidate.latestDocument ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => void markOfferSent(candidate)} className="gap-1.5">
                      <Send className="h-3.5 w-3.5" /> {tt("Označi poslano")}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openDraftCandidate(candidate)}
                    disabled={isGenerating}
                    className="gap-1.5"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-3.5 w-3.5" />
                    )}
                    {candidate.latestDocument ? tt("Uredi") : tt("Vnesi ponudbo")}
                  </Button>
                  {candidate.latestDocument ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setSelectedDocument({
                          ...candidate.latestDocument!,
                          candidateName: candidate.full_name,
                        })
                      }
                      className="gap-1.5"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {t("preview")}
                    </Button>
                  ) : null}
                  {outcome === "accepted" || outcome === "declined" ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => updateOfferArchive(candidate, !isOfferArchived(candidate))}>
                      {isOfferArchived(candidate) ? tt("Odstrani iz arhiva") : tt("Arhiviraj")}
                    </Button>
                  ) : null}
                  <Button asChild type="button" variant="ghost" size="sm" className="px-2">
                    <Link
                      to={`/applicants/${candidate.id}?returnTo=${encodeURIComponent("/offers")}`}
                      state={{ returnTo: "/offers" }}
                    >
                      {tt("Odpri")}
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <OfferDraftDialog
        presetOnly
        isGenerating={false}
        open={isPresetSetupOpen}
        onOpenChange={setIsPresetSetupOpen}
        onPresetSaved={() => setIsPresetSetupOpen(false)}
      />

      <OfferDraftDialog
        candidateName={draftCandidate?.full_name}
        candidateEmail={draftCandidate?.email}
        jobTitle={draftCandidate?.job_title}
        draftKey={draftCandidate ? `smart-ats-offer-draft-${draftCandidate.id}` : undefined}
        error={error}
        initialInputs={draftCandidate?.latestDocument?.inputs}
        isGenerating={Boolean(draftCandidate && generatingCandidateId === draftCandidate.id)}
        open={Boolean(draftCandidate)}
        onOpenChange={(open) => !open && closeDraftCandidate()}
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
