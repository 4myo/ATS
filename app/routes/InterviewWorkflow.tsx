import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Briefcase,
  CheckCircle2,
  DollarSign,
  FileText,
  Loader2,
  Mail,
  Search,
  Send,
  XCircle,
} from "lucide-react";
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
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ScoreChip } from "../components/ScoreChip";
import { scoreBand, scoreBandText } from "../lib/score";
import { ListReportShell } from "../components/shell/ListReportShell";
import { StatStrip } from "../components/shell/StatStrip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { supabase } from "../lib/supabase";
import { logActivityEvent } from "../lib/activityLog";
import { fetchLinkedCandidateTranscripts } from "../lib/interviewTranscriptLinks";
import { useI18n } from "../lib/i18n";
import { matchesCandidateSearch } from "../lib/candidateIdentity";

type CandidateStage = "Applied" | "Screening" | "Interview" | "Offer" | "Accepted" | "Rejected";
type WorkflowFilter =
  | "all"
  | "first_round"
  | "negotiation"
  | "in_range"
  | "over_budget"
  | "accepted"
  | "rejected";

type NegotiationStatus = "in_range" | "borderline" | "over_budget" | "missing";

type OfferChecklistData = {
  interviewCompleted?: boolean;
  referencesChecked?: boolean;
  termsAligned?: boolean;
  internalApproval?: boolean;
  offerSent?: boolean;
  negotiationMinGross?: number | null;
  negotiationMaxGross?: number | null;
  candidateExpectedGross?: number | null;
  negotiationStatus?: NegotiationStatus;
  rejectionReason?: string | null;
  rejectionEmailBody?: string | null;
  acceptanceEmailBody?: string | null;
};

type CandidateRow = {
  id: string;
  full_name: string;
  job_title: string;
  email: string | null;
  stage: string | null;
  ats_score: number | null;
  interview_analysis_status?: string | null;
  interview_analysis_score?: number | null;
  offer_checklist?: unknown;
  offer_outcome?: string | null;
};

type WorkflowCandidate = {
  id: string;
  name: string;
  role: string;
  email: string | null;
  stage: CandidateStage;
  atsScore: number | null;
  interviewAnalysisStatus: string | null;
  interviewAnalysisScore: number | null;
  offerChecklist: OfferChecklistData;
  offerOutcome: string | null;
  transcriptCount: number;
};

type SalaryDraft = {
  min: string;
  max: string;
  expected: string;
};

type JobBudgetDraft = {
  min: string;
  max: string;
};

const candidateStages: CandidateStage[] = [
  "Applied",
  "Screening",
  "Interview",
  "Offer",
  "Accepted",
  "Rejected",
];

const workflowStages: CandidateStage[] = ["Interview", "Offer", "Accepted", "Rejected"];

const stageLabels: Record<CandidateStage, string> = {
  Applied: "Prijavljen",
  Screening: "Pregled",
  Interview: "Razgovor za ujemanje",
  Offer: "Ponudba / pogajanja",
  Accepted: "Sprejet",
  Rejected: "Zavrnjen",
};

const stageColors: Record<CandidateStage, string> = {
  Applied: "#06b6d4",
  Screening: "#8b5cf6",
  Interview: "#ec4899",
  Offer: "#f59e0b",
  Accepted: "#22c55e",
  Rejected: "#ef4444",
};

const negotiationLabels: Record<NegotiationStatus, string> = {
  in_range: "Znotraj budgeta",
  borderline: "Na meji",
  over_budget: "Presega budget",
  missing: "Čaka podatke",
};

// Budget status as one semantic accent, reusing the shared Badge variants.
const negotiationBadgeVariant: Record<
  NegotiationStatus,
  "success" | "warning" | "destructive" | "outline"
> = {
  in_range: "success",
  borderline: "warning",
  over_budget: "destructive",
  missing: "outline",
};

const jobBudgetStorageKey = "smart-ats-interview-workflow-job-budgets";

const skillMismatchRejectionMessage =
  "Hvala za vaš čas in zanimanje. Po pregledu razgovora smo se odločili, da profil trenutno ni najboljše ujemanje za zahtevani nabor veščin za to delovno mesto. Želimo vam veliko uspeha pri nadaljnjih priložnostih.";

const salaryRejectionMessage =
  "Hvala za odprt pogovor glede pričakovanj. Trenutno se vaša pričakovana bruto plača ne ujema z razpoložljivim budgetom za to delovno mesto, zato postopka ne moremo nadaljevati. Želimo vam veliko uspeha pri nadaljnjih priložnostih.";

const acceptanceMessage =
  "Z veseljem vas obveščamo, da ste uspešno zaključili izborni postopek. Vaša pričakovanja so znotraj dogovorjenega budgetnega ranga, zato nadaljujemo s končno potrditvijo in ponudbo.";

const normalizeOfferChecklist = (value: unknown): OfferChecklistData => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as OfferChecklistData;
};

const parseGrossAmount = (value: string) => {
  const normalized = value.replace(/[^\d.,-]/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const formatGrossAmount = (value?: number | null) =>
  typeof value === "number"
    ? new Intl.NumberFormat("sl-SI", {
        maximumFractionDigits: 0,
      }).format(value)
    : "";

const scoreValue = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;

const getNegotiationStatus = (
  minGross?: number | null,
  maxGross?: number | null,
  expectedGross?: number | null,
): NegotiationStatus => {
  if (typeof maxGross !== "number" || typeof expectedGross !== "number") return "missing";
  if (expectedGross <= maxGross) return "in_range";
  if (typeof minGross === "number" && expectedGross <= maxGross * 1.08) return "borderline";
  return "over_budget";
};

const getCandidateStatus = (candidate: WorkflowCandidate) =>
  candidate.offerChecklist.negotiationStatus ??
  getNegotiationStatus(
    candidate.offerChecklist.negotiationMinGross,
    candidate.offerChecklist.negotiationMaxGross,
    candidate.offerChecklist.candidateExpectedGross,
  );

const getLiveNegotiationStatus = (
  candidate: WorkflowCandidate,
  salaryDrafts: Record<string, SalaryDraft>,
  jobBudgetDraft?: JobBudgetDraft,
) => {
  const draft = salaryDrafts[candidate.id];
  const minGross =
    parseGrossAmount(draft?.min ?? "") ??
    parseGrossAmount(jobBudgetDraft?.min ?? "") ??
    candidate.offerChecklist.negotiationMinGross;
  const maxGross =
    parseGrossAmount(draft?.max ?? "") ??
    parseGrossAmount(jobBudgetDraft?.max ?? "") ??
    candidate.offerChecklist.negotiationMaxGross;
  const expectedGross =
    parseGrossAmount(draft?.expected ?? "") ?? candidate.offerChecklist.candidateExpectedGross;

  return getNegotiationStatus(minGross, maxGross, expectedGross);
};

const getCandidateScore = (candidate: WorkflowCandidate) =>
  scoreValue(candidate.interviewAnalysisScore) ?? scoreValue(candidate.atsScore);

const getMailto = (candidate: WorkflowCandidate, subject: string, body: string) =>
  `mailto:${candidate.email ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

const readStoredJobBudgets = () => {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(jobBudgetStorageKey);
    return raw ? (JSON.parse(raw) as Record<string, JobBudgetDraft>) : {};
  } catch {
    return {};
  }
};

export default function InterviewWorkflow() {
  const { tt } = useI18n();
  const [candidates, setCandidates] = useState<WorkflowCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [workflowFilter, setWorkflowFilter] = useState<WorkflowFilter>("all");
  const [jobFilter, setJobFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [salaryDrafts, setSalaryDrafts] = useState<Record<string, SalaryDraft>>({});
  const [jobBudgetDrafts, setJobBudgetDrafts] =
    useState<Record<string, JobBudgetDraft>>(readStoredJobBudgets);
  const [updatingCandidateId, setUpdatingCandidateId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(jobBudgetStorageKey, JSON.stringify(jobBudgetDrafts));
  }, [jobBudgetDrafts]);

  const loadCandidates = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);

    const { data, error } = await supabase
      .from("candidates")
      .select(
        "id, full_name, job_title, email, stage, ats_score, interview_analysis_status, interview_analysis_score, offer_checklist, offer_outcome",
      )
      .order("created_at", { ascending: false })
      .limit(160);

    if (error) {
      setMessage(`Kandidatov ni bilo mogoče naložiti: ${error.message}`);
      setIsLoading(false);
      return;
    }

    const rows = (data ?? []) as CandidateRow[];
    const transcriptMap = await fetchLinkedCandidateTranscripts(rows.map((row) => row.id));

    const nextCandidates = rows.map((row) => {
      const stage = candidateStages.includes(row.stage as CandidateStage)
        ? (row.stage as CandidateStage)
        : "Applied";

      return {
        id: row.id,
        name: row.full_name,
        role: row.job_title,
        email: row.email ?? null,
        stage,
        atsScore: row.ats_score,
        interviewAnalysisStatus: row.interview_analysis_status ?? null,
        interviewAnalysisScore:
          typeof row.interview_analysis_score === "number"
            ? row.interview_analysis_score
            : row.interview_analysis_score == null
              ? null
              : Number(row.interview_analysis_score),
        offerChecklist: normalizeOfferChecklist(row.offer_checklist),
        offerOutcome: row.offer_outcome ?? null,
        transcriptCount: transcriptMap[row.id]?.length ?? 0,
      };
    });

    setCandidates(nextCandidates);
    setSalaryDrafts((current) => {
      const next = { ...current };
      for (const candidate of nextCandidates) {
        if (next[candidate.id]) continue;
        next[candidate.id] = {
          min: formatGrossAmount(candidate.offerChecklist.negotiationMinGross),
          max: formatGrossAmount(candidate.offerChecklist.negotiationMaxGross),
          expected: formatGrossAmount(candidate.offerChecklist.candidateExpectedGross),
        };
      }
      return next;
    });
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  const jobOptions = useMemo(
    () => Array.from(new Set(candidates.map((candidate) => candidate.role).filter(Boolean))).sort(),
    [candidates],
  );
  const selectedJobBudget = jobFilter === "all" ? undefined : jobBudgetDrafts[jobFilter];

  const filteredCandidates = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return candidates.filter((candidate) => {
      const status = getLiveNegotiationStatus(
        candidate,
        salaryDrafts,
        jobBudgetDrafts[candidate.role],
      );
      const inWorkflow = workflowStages.includes(candidate.stage);

      if (!inWorkflow) return false;
      if (jobFilter !== "all" && candidate.role !== jobFilter) return false;
      if (normalizedSearch) {
        if (!matchesCandidateSearch({ candidateId: candidate.id, query: searchQuery, values: [candidate.name, candidate.role, candidate.email] })) return false;
      }
      if (workflowFilter === "first_round") return candidate.stage === "Interview";
      if (workflowFilter === "negotiation") return candidate.stage === "Offer";
      if (workflowFilter === "in_range") {
        return candidate.stage === "Offer" && (status === "in_range" || status === "borderline");
      }
      if (workflowFilter === "over_budget") {
        return candidate.stage === "Offer" && status === "over_budget";
      }
      if (workflowFilter === "accepted") return candidate.stage === "Accepted";
      if (workflowFilter === "rejected") return candidate.stage === "Rejected";
      return true;
    });
  }, [candidates, jobBudgetDrafts, jobFilter, salaryDrafts, searchQuery, workflowFilter]);

  const stats = useMemo(
    () => ({
      interview: candidates.filter((candidate) => candidate.stage === "Interview").length,
      offer: candidates.filter((candidate) => candidate.stage === "Offer").length,
      accepted: candidates.filter((candidate) => candidate.stage === "Accepted").length,
      overBudget: candidates.filter(
        (candidate) =>
          candidate.stage === "Offer" &&
          getLiveNegotiationStatus(candidate, salaryDrafts, jobBudgetDrafts[candidate.role]) ===
            "over_budget",
      ).length,
    }),
    [candidates, jobBudgetDrafts, salaryDrafts],
  );

  const updateCandidateWorkflow = async (
    candidate: WorkflowCandidate,
    updates: {
      stage?: CandidateStage;
      offerChecklist?: OfferChecklistData;
      offerOutcome?: string | null;
      successMessage: string;
    },
  ) => {
    setUpdatingCandidateId(candidate.id);
    setMessage(null);

    const nextStage = updates.stage ?? candidate.stage;
    const nextChecklist = {
      ...candidate.offerChecklist,
      ...(updates.offerChecklist ?? {}),
    };
    const nextOfferOutcome =
      updates.offerOutcome === undefined ? candidate.offerOutcome : updates.offerOutcome;
    const stageChanged = nextStage !== candidate.stage;
    const offerOutcomeChanged =
      updates.offerOutcome !== undefined && nextOfferOutcome !== candidate.offerOutcome;
    const offerTermsChanged = Boolean(
      updates.offerChecklist &&
        ("negotiationMinGross" in updates.offerChecklist ||
          "negotiationMaxGross" in updates.offerChecklist ||
          "candidateExpectedGross" in updates.offerChecklist ||
          "negotiationStatus" in updates.offerChecklist),
    );

    const { error } = await supabase
      .from("candidates")
      .update({
        stage: nextStage,
        offer_checklist: nextChecklist,
        offer_outcome: nextOfferOutcome ?? "pending",
      })
      .eq("id", candidate.id);

    setUpdatingCandidateId(null);

    if (error) {
      setMessage(`Poteka kandidata ni bilo mogoče posodobiti: ${error.message}`);
      return;
    }

    setCandidates((current) =>
      current.map((item) =>
        item.id === candidate.id
          ? {
              ...item,
              stage: nextStage,
              offerChecklist: nextChecklist,
              offerOutcome: nextOfferOutcome,
            }
          : item,
      ),
    );

    if (stageChanged) {
      void logActivityEvent({
        action: "candidate_stage_changed",
        entityType: "candidate",
        entityId: candidate.id,
        entityLabel: candidate.name,
        fromValue: candidate.stage,
        toValue: nextStage,
        metadata: {
          job_title: candidate.role,
          source: "interview_workflow",
          offer_outcome: nextOfferOutcome,
        },
      });
    }

    if (offerTermsChanged) {
      void logActivityEvent({
        action: "candidate_offer_terms_updated",
        entityType: "candidate",
        entityId: candidate.id,
        entityLabel: candidate.name,
        fromValue: candidate.offerChecklist.negotiationStatus ?? null,
        toValue: nextChecklist.negotiationStatus ?? null,
        metadata: {
          job_title: candidate.role,
          source: "interview_workflow",
          negotiation_min_gross: nextChecklist.negotiationMinGross ?? null,
          negotiation_max_gross: nextChecklist.negotiationMaxGross ?? null,
          candidate_expected_gross: nextChecklist.candidateExpectedGross ?? null,
        },
      });
    }

    if (offerOutcomeChanged && !stageChanged) {
      void logActivityEvent({
        action: "offer_outcome_changed",
        entityType: "candidate",
        entityId: candidate.id,
        entityLabel: candidate.name,
        fromValue: candidate.offerOutcome ?? null,
        toValue: nextOfferOutcome ?? null,
        metadata: { job_title: candidate.role, source: "interview_workflow" },
      });
    }

    setMessage(updates.successMessage);
  };

  const moveCandidateToOffer = (candidate: WorkflowCandidate) =>
    updateCandidateWorkflow(candidate, {
      stage: "Offer",
      offerOutcome: "pending",
      offerChecklist: {
        interviewCompleted: true,
        rejectionReason: null,
        rejectionEmailBody: null,
      },
      successMessage: `${candidate.name} je premaknjen v fazo Ponudba in bo viden tudi na strani Ponudbe.`,
    });

  const rejectCandidateForSkillFit = (candidate: WorkflowCandidate) =>
    updateCandidateWorkflow(candidate, {
      stage: "Rejected",
      offerOutcome: "declined",
      offerChecklist: {
        interviewCompleted: true,
        rejectionReason: "skill_profile_mismatch",
        rejectionEmailBody: skillMismatchRejectionMessage,
      },
      successMessage: `${candidate.name} je zavrnjen z razlogom neujemanja profila veščin.`,
    });

  const saveNegotiation = (candidate: WorkflowCandidate) => {
    const draft = salaryDrafts[candidate.id] ?? { min: "", max: "", expected: "" };
    const jobBudget = jobBudgetDrafts[candidate.role];
    const minGross = parseGrossAmount(draft.min) ?? parseGrossAmount(jobBudget?.min ?? "");
    const maxGross = parseGrossAmount(draft.max) ?? parseGrossAmount(jobBudget?.max ?? "");
    const expectedGross = parseGrossAmount(draft.expected);
    const status = getNegotiationStatus(minGross, maxGross, expectedGross);

    void updateCandidateWorkflow(candidate, {
      stage: "Offer",
      offerOutcome: "pending",
      offerChecklist: {
        negotiationMinGross: minGross,
        negotiationMaxGross: maxGross,
        candidateExpectedGross: expectedGross,
        negotiationStatus: status,
      },
      successMessage: `Pogajanja za ${candidate.name} so shranjena: ${negotiationLabels[status]}.`,
    });
  };

  const saveSelectedJobBudget = async () => {
    if (jobFilter === "all") {
      setMessage("Najprej izberi eno delovno mesto.");
      return;
    }

    const budget = jobBudgetDrafts[jobFilter];
    const minGross = parseGrossAmount(budget?.min ?? "");
    const maxGross = parseGrossAmount(budget?.max ?? "");

    if (minGross == null || maxGross == null || minGross > maxGross) {
      setMessage("Vnesi veljaven min in max bruto budget za izbrano pozicijo.");
      return;
    }

    const candidatesToUpdate = candidates.filter(
      (candidate) => candidate.role === jobFilter && candidate.stage === "Offer",
    );

    if (!candidatesToUpdate.length) {
      setMessage("Za to pozicijo ni kandidatov v fazi ponudbe/pogajanj.");
      return;
    }

    setUpdatingCandidateId("job-budget");
    setMessage(null);

    const updates = await Promise.all(
      candidatesToUpdate.map((candidate) => {
        const draft = salaryDrafts[candidate.id];
        const expectedGross =
          parseGrossAmount(draft?.expected ?? "") ??
          candidate.offerChecklist.candidateExpectedGross ??
          null;
        const status = getNegotiationStatus(minGross, maxGross, expectedGross);
        const nextChecklist = {
          ...candidate.offerChecklist,
          negotiationMinGross: minGross,
          negotiationMaxGross: maxGross,
          candidateExpectedGross: expectedGross,
          negotiationStatus: status,
        };

        return supabase
          .from("candidates")
          .update({
            offer_checklist: nextChecklist,
            offer_outcome: candidate.offerOutcome ?? "pending",
          })
          .eq("id", candidate.id)
          .then(({ error }) => ({ candidate, nextChecklist, error }));
      }),
    );

    setUpdatingCandidateId(null);

    const failed = updates.find((update) => update.error);
    if (failed?.error) {
      setMessage(`Budgeta ni bilo mogoče shraniti: ${failed.error.message}`);
      return;
    }

    setCandidates((current) =>
      current.map((candidate) => {
        const update = updates.find((item) => item.candidate.id === candidate.id);
        return update ? { ...candidate, offerChecklist: update.nextChecklist } : candidate;
      }),
    );
    setSalaryDrafts((current) => {
      const next = { ...current };
      for (const candidate of candidatesToUpdate) {
        next[candidate.id] = {
          min: formatGrossAmount(minGross),
          max: formatGrossAmount(maxGross),
          expected:
            next[candidate.id]?.expected ??
            formatGrossAmount(candidate.offerChecklist.candidateExpectedGross),
        };
      }
      return next;
    });
    setMessage(`Budget ${formatGrossAmount(minGross)}-${formatGrossAmount(maxGross)} bruto je shranjen za ${candidatesToUpdate.length} kandidatov.`);
  };

  const acceptNegotiatedCandidate = (candidate: WorkflowCandidate) =>
    updateCandidateWorkflow(candidate, {
      stage: "Accepted",
      offerOutcome: "accepted",
      offerChecklist: {
        offerSent: true,
        termsAligned: true,
        internalApproval: true,
        acceptanceEmailBody: acceptanceMessage,
        rejectionReason: null,
        rejectionEmailBody: null,
      },
      successMessage: `${candidate.name} je označen kot sprejet.`,
    });

  const rejectNegotiatedCandidate = (candidate: WorkflowCandidate) =>
    updateCandidateWorkflow(candidate, {
      stage: "Rejected",
      offerOutcome: "declined",
      offerChecklist: {
        rejectionReason: "salary_expectation_over_budget",
        rejectionEmailBody: salaryRejectionMessage,
      },
      successMessage: `${candidate.name} je zavrnjen, ker pričakovanja presegajo budget.`,
    });

  return (
    <ListReportShell
      title={tt("Potek razgovorov")}
      subtitle={tt("Operativni pregled prvega kroga, odločitev, ponudb in plačnih pogajanj z jasnim lastništvom naslednjega koraka.")}
      actions={
        <>
          <Button type="button" variant="outline" onClick={() => void loadCandidates()}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {tt("Osveži")}
          </Button>
          <Button asChild type="button" variant="outline">
            <Link to="/interviews">
              <FileText className="mr-2 h-4 w-4" />
              {tt("Studio razgovorov")}
            </Link>
          </Button>
        </>
      }
    >
        {message ? (
          <div className="rounded-md border border-border bg-card px-4 py-3 text-sm text-foreground">
            {message}
          </div>
        ) : null}

        <StatStrip
          items={[
            { label: tt("Prvi krog"), value: stats.interview, detail: tt("Kandidati v razgovoru") },
            { label: tt("Pogajanja"), value: stats.offer, detail: tt("Aktivne ponudbe") },
            { label: tt("Presega budget"), value: stats.overBudget, detail: tt("Potrebna odločitev") },
            { label: tt("Sprejeti"), value: stats.accepted, detail: tt("Zaključen proces") },
          ]}
        />

        <section className="rounded-md border border-border bg-card p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(14rem,1fr)_minmax(14rem,1fr)_minmax(18rem,1.3fr)]">
            <Select value={workflowFilter} onValueChange={(value) => setWorkflowFilter(value as WorkflowFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tt("Vsi v procesu")}</SelectItem>
                <SelectItem value="first_round">{tt("Razgovor za ujemanje")}</SelectItem>
                <SelectItem value="negotiation">{tt("Ponudba / pogajanja")}</SelectItem>
                <SelectItem value="in_range">{tt("Znotraj budgeta")}</SelectItem>
                <SelectItem value="over_budget">{tt("Presega budget")}</SelectItem>
                <SelectItem value="accepted">{tt("Sprejeti")}</SelectItem>
                <SelectItem value="rejected">{tt("Zavrnjeni")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={jobFilter} onValueChange={setJobFilter}>
              <SelectTrigger>
                <SelectValue placeholder={tt("Delovno mesto")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tt("Vsa delovna mesta")}</SelectItem>
                {jobOptions.map((jobTitle) => (
                  <SelectItem key={jobTitle} value={jobTitle}>
                    {jobTitle}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-cyan-500"
                placeholder={tt("Išči kandidata, vlogo, email ali ID")}
              />
            </label>
          </div>
          <div className="mt-4 grid gap-3 rounded-md border border-border bg-muted/20 p-3 lg:grid-cols-[minmax(10rem,0.6fr)_minmax(10rem,0.6fr)_auto_minmax(0,1fr)] lg:items-end">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Min bruto budget pozicije
              <input
                value={selectedJobBudget?.min ?? ""}
                onChange={(event) => {
                  if (jobFilter === "all") return;
                  setJobBudgetDrafts((current) => ({
                    ...current,
                    [jobFilter]: {
                      ...(current[jobFilter] ?? { min: "", max: "" }),
                      min: event.target.value,
                    },
                  }));
                }}
                disabled={jobFilter === "all"}
                className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                inputMode="decimal"
                placeholder="npr. 2800"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Max bruto budget pozicije
              <input
                value={selectedJobBudget?.max ?? ""}
                onChange={(event) => {
                  if (jobFilter === "all") return;
                  setJobBudgetDrafts((current) => ({
                    ...current,
                    [jobFilter]: {
                      ...(current[jobFilter] ?? { min: "", max: "" }),
                      max: event.target.value,
                    },
                  }));
                }}
                disabled={jobFilter === "all"}
                className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                inputMode="decimal"
                placeholder="npr. 3600"
              />
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() => void saveSelectedJobBudget()}
              disabled={jobFilter === "all" || updatingCandidateId === "job-budget"}
              className="gap-2"
            >
              {updatingCandidateId === "job-budget" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <DollarSign className="h-4 w-4" />
              )}
              Shrani budget pozicije
            </Button>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {tt("Budget velja za izbrano delovno mesto. Kandidatu spodaj vpišeš samo koliko želi; graf takoj pokaže, kdo je znotraj cone in kdo je over budget.")}
            </p>
          </div>
        </section>

        {isLoading ? (
          <div className="flex min-h-80 items-center justify-center rounded-md border border-border bg-card text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Nalagam potek razgovorov...
          </div>
        ) : (
          <>
            <section className="rounded-md border border-border bg-card p-4">
              <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Akcije po kandidatu</h2>
                  <p className="text-sm text-muted-foreground">
                    {tt("Tu se urejajo ponudbe, plačna pogajanja in zavrnitveni ali sprejemni emaili.")}
                  </p>
                </div>
                <Badge variant="secondary">{filteredCandidates.length} prikazanih</Badge>
              </div>

              <div className="grid gap-3">
                {filteredCandidates.length ? (
                  filteredCandidates.map((candidate) => {
                    const candidateJobBudget = jobBudgetDrafts[candidate.role];
                    const draft = salaryDrafts[candidate.id] ?? {
                      min: "",
                      max: "",
                      expected: "",
                    };
                    const status = getLiveNegotiationStatus(candidate, salaryDrafts, candidateJobBudget);
                    const score = getCandidateScore(candidate);
                    const isUpdating = updatingCandidateId === candidate.id;
                    const canAccept = status === "in_range" || status === "borderline";
                    const canRejectBySalary = status === "over_budget";

                    return (
                      <article
                        key={candidate.id}
                        className="grid gap-4 rounded-md border border-border bg-background p-4 dark:bg-muted/15 lg:grid-cols-[minmax(15rem,0.75fr)_minmax(0,1.45fr)] 2xl:grid-cols-[minmax(16rem,0.75fr)_minmax(0,1fr)_minmax(12rem,0.42fr)]"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              to={`/applicants/${candidate.id}`}
                              className="truncate text-base font-semibold text-foreground hover:text-cyan-500"
                            >
                              {candidate.name}
                            </Link>
                            <Badge variant="outline">{stageLabels[candidate.stage]}</Badge>
                          </div>
                          <p className="mt-1 truncate text-sm text-muted-foreground">
                            {candidate.role}
                          </p>
                          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                            <div className="rounded-md border border-border bg-muted/20 p-2">
                              <div className="text-muted-foreground">Ocena</div>
                              <div
                                className={
                                  score == null
                                    ? "font-semibold text-muted-foreground"
                                    : `font-semibold ${scoreBandText[scoreBand(score)]}`
                                }
                              >
                                {score == null ? "-" : `${score}%`}
                              </div>
                            </div>
                            <div className="rounded-md border border-border bg-muted/20 p-2">
                              <div className="text-muted-foreground">Transkripti</div>
                              <div className="font-semibold text-foreground">
                                {candidate.transcriptCount}
                              </div>
                            </div>
                            <div className="rounded-md border border-border bg-muted/20 p-2">
                              <div className="text-muted-foreground">Budget</div>
                              <div
                                className={
                                  status === "over_budget"
                                    ? "font-semibold text-red-500"
                                    : status === "missing"
                                      ? "font-semibold text-muted-foreground"
                                      : "font-semibold text-emerald-500"
                                }
                              >
                                {negotiationLabels[status]}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="min-w-0">
                          {candidate.stage === "Offer" ? (
                            <div className="grid min-w-0 gap-3 rounded-md border border-border bg-muted/20 p-3 sm:grid-cols-3">
                              <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
                                Min bruto budget
                                <input
                                  value={draft.min || candidateJobBudget?.min || ""}
                                  onChange={(event) =>
                                    setSalaryDrafts((current) => ({
                                      ...current,
                                      [candidate.id]: { ...draft, min: event.target.value },
                                    }))
                                  }
                                  className="h-9 min-w-0 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                                  inputMode="decimal"
                                  placeholder="2800"
                                />
                              </label>
                              <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
                                Max bruto budget
                                <input
                                  value={draft.max || candidateJobBudget?.max || ""}
                                  onChange={(event) =>
                                    setSalaryDrafts((current) => ({
                                      ...current,
                                      [candidate.id]: { ...draft, max: event.target.value },
                                    }))
                                  }
                                  className="h-9 min-w-0 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                                  inputMode="decimal"
                                  placeholder="3600"
                                />
                              </label>
                              <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
                                {tt("Kandidat pričakuje bruto")}
                                <input
                                  value={draft.expected}
                                  onChange={(event) =>
                                    setSalaryDrafts((current) => ({
                                      ...current,
                                      [candidate.id]: { ...draft, expected: event.target.value },
                                    }))
                                  }
                                  className="h-9 min-w-0 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                                  inputMode="decimal"
                                  placeholder="4000"
                                />
                              </label>
                            </div>
                          ) : (
                            <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                              {candidate.stage === "Interview"
                                ? tt("Prvi krog: po razgovoru kandidata premakni v ponudbo ali zavrni z razlogom profila veščin.")
                                : tt("Končni status je zabeležen. Email lahko pripraviš iz akcij na desni.")}
                            </div>
                          )}
                        </div>

                        <div className="grid content-center gap-2 lg:col-span-2 lg:grid-cols-3 2xl:col-span-1 2xl:grid-cols-1">
                          {candidate.stage === "Interview" ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                className="justify-start gap-2"
                                disabled={isUpdating}
                                onClick={() => void moveCandidateToOffer(candidate)}
                              >
                                {isUpdating ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Send className="h-4 w-4" />
                                )}
                                {tt("Pošlji v ponudbo")}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="justify-start gap-2 text-red-600 hover:text-red-700"
                                disabled={isUpdating}
                                onClick={() => void rejectCandidateForSkillFit(candidate)}
                              >
                                <XCircle className="h-4 w-4" />
                                {tt("Zavrni profil")}
                              </Button>
                            </>
                          ) : null}

                          {candidate.stage === "Offer" ? (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="justify-start gap-2"
                                disabled={isUpdating}
                                onClick={() => saveNegotiation(candidate)}
                              >
                                <DollarSign className="h-4 w-4" />
                                {tt("Shrani rangiranje")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="justify-start gap-2"
                                disabled={isUpdating || !canAccept}
                                onClick={() => void acceptNegotiatedCandidate(candidate)}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                                {tt("Sprejmi")}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="justify-start gap-2 text-red-600 hover:text-red-700"
                                disabled={isUpdating || !canRejectBySalary}
                                onClick={() => void rejectNegotiatedCandidate(candidate)}
                              >
                                <XCircle className="h-4 w-4" />
                                {tt("Zavrni budget")}
                              </Button>
                            </>
                          ) : null}

                          {candidate.stage === "Accepted" ? (
                            <a
                              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-foreground transition hover:bg-muted"
                              href={getMailto(
                                candidate,
                                tt("Uspešno zaključen izborni postopek"),
                                candidate.offerChecklist.acceptanceEmailBody ?? acceptanceMessage,
                              )}
                            >
                              <Mail className="h-4 w-4" />
                              {tt("Sprejemni email")}
                            </a>
                          ) : null}

                          {candidate.stage === "Rejected" ? (
                            <a
                              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-foreground transition hover:bg-muted"
                              href={getMailto(
                                candidate,
                                tt("Odločitev glede prijave"),
                                candidate.offerChecklist.rejectionEmailBody ??
                                  skillMismatchRejectionMessage,
                              )}
                            >
                              <Mail className="h-4 w-4" />
                              {tt("Zavrnitveni email")}
                            </a>
                          ) : null}
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    {tt("Ni kandidatov za izbrane filtre.")}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
    </ListReportShell>
  );
}
