import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { CheckCircle2, Eye, FileText, Loader2, Send, XCircle } from "lucide-react";
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
  offer_checklist: Record<string, boolean> | null;
  offer_outcome: string | null;
  offer_sent_at: string | null;
  offer_summary: string | null;
};

type CandidateWithDocument = OfferCandidate & {
  latestDocument: OfferDocument | null;
};

const candidateSelect =
  "id, full_name, job_title, stage, email, ats_score, offer_checklist, offer_outcome, offer_sent_at, offer_summary";

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
  });
  const [error, setError] = useState<string | null>(null);

  const loadOffers = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const { data: candidateRows, error: candidateError } = await supabase
      .from("candidates")
      .select(candidateSelect)
      .in("stage", ["Offer", "Accepted", "Rejected"])
      .order("created_at", { ascending: false });

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
    const hasActiveOfferFilter = Object.values(offerStatusFilters).some(Boolean);
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
        <div className="grid min-w-[220px] gap-1.5">
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
        <div className="grid min-w-[520px] flex-1 gap-1.5">
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
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-l border-border pl-4">
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

            return (
              <div
                key={candidate.id}
                className="surface-card grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(14rem,0.45fr)_auto]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-semibold text-foreground">
                      {candidate.full_name}
                    </h2>
                    <Badge variant={outcome === "accepted" ? "secondary" : isSent ? "secondary" : "default"}>
                      {outcome === "accepted"
                        ? t("offerOutcomeAccepted")
                        : outcome === "declined"
                          ? t("offerOutcomeDeclined")
                          : isSent
                            ? t("offerStatusSent")
                            : t("offerStatusPreparing")}
                    </Badge>
                    {candidate.latestDocument && !isSent ? (
                      <Badge variant="outline">{t("offerDraftReady")}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {candidate.job_title}
                    {candidate.ats_score == null
                      ? ""
                      : ` · ${Math.round(Number(candidate.ats_score))}% ${t("match")}`}
                  </p>
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                    {candidate.offer_summary || t("offerSummaryUnavailable")}
                  </p>
                </div>

                <div className="grid content-start gap-1 text-sm text-muted-foreground">
                  <span>
                    {t("offerSentDate")}:{" "}
                    <span className="font-medium text-foreground">
                      {candidate.offer_sent_at || "-"}
                    </span>
                  </span>
                  <span>
                    {t("offerLatestDocument")}:{" "}
                    <span className="font-medium text-foreground">
                      {candidate.latestDocument?.created_at
                        ? new Date(candidate.latestDocument.created_at).toLocaleDateString()
                        : "-"}
                    </span>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDraftCandidate(candidate)}
                    disabled={isGenerating}
                    className="gap-2"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    {candidate.latestDocument ? t("editOfferData") : t("enterOfferData")}
                  </Button>
                  {candidate.latestDocument ? (
                    <>
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
                        className="gap-2"
                      >
                        <Eye className="h-4 w-4" />
                        {t("preview")}
                      </Button>
                      {!isSent ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => markOfferSent(candidate)}
                          className="gap-2"
                        >
                          <Send className="h-4 w-4" />
                          {t("markOfferSent")}
                        </Button>
                      ) : null}
                      {isSent && outcome === "pending" ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => updateOfferOutcome(candidate, "accepted")}
                            className="gap-2 text-emerald-600 hover:text-emerald-700"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            {t("markOfferAccepted")}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => updateOfferOutcome(candidate, "declined")}
                            className="gap-2 text-red-600 hover:text-red-700"
                          >
                            <XCircle className="h-4 w-4" />
                            {t("markOfferDeclined")}
                          </Button>
                        </>
                      ) : null}
                    </>
                  ) : null}
                  <Button asChild type="button" variant="ghost" size="sm">
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
