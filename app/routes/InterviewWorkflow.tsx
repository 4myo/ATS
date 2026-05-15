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

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{value}</div>
      {detail ? <p className="mt-1 text-sm text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function CandidateNode({ candidate }: { candidate: WorkflowCandidate }) {
  const status = getCandidateStatus(candidate);
  const score = getCandidateScore(candidate);

  return (
    <Link
      to={`/applicants/${candidate.id}`}
      className="block rounded-md border border-border bg-background p-3 transition hover:border-cyan-500/60 hover:bg-muted/30 dark:bg-muted/15"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{candidate.name}</div>
          <div className="truncate text-xs text-muted-foreground">{candidate.role}</div>
        </div>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-foreground">
          {score == null ? "-" : `${score}%`}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
        <span>{candidate.transcriptCount} transkriptov</span>
        <span className="text-right">{negotiationLabels[status]}</span>
      </div>
    </Link>
  );
}

function WorkflowGraph({ candidates }: { candidates: WorkflowCandidate[] }) {
  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Graf procesa razgovorov</h2>
          <p className="text-sm text-muted-foreground">
            Kandidati so razporejeni po fazah, od prvega kroga do končne odločitve.
          </p>
        </div>
        <Badge variant="secondary">{candidates.length} kandidatov</Badge>
      </div>

      <div className="grid gap-3 xl:grid-cols-4">
        {workflowStages.map((stage) => {
          const stageCandidates = candidates.filter((candidate) => candidate.stage === stage);
          return (
            <div key={stage} className="rounded-md border border-border bg-muted/20 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: stageColors[stage] }}
                  />
                  <h3 className="text-sm font-semibold text-foreground">{stageLabels[stage]}</h3>
                </div>
                <span className="text-sm font-semibold text-muted-foreground">
                  {stageCandidates.length}
                </span>
              </div>
              <div className="grid max-h-[26rem] gap-2 overflow-y-auto pr-1">
                {stageCandidates.length ? (
                  stageCandidates.map((candidate) => (
                    <CandidateNode key={candidate.id} candidate={candidate} />
                  ))
                ) : (
                  <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                    Ni kandidatov v tej fazi.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BudgetZoneOverview({
  candidates,
  jobTitle,
  jobBudget,
  salaryDrafts,
}: {
  candidates: WorkflowCandidate[];
  jobTitle: string;
  jobBudget?: JobBudgetDraft;
  salaryDrafts: Record<string, SalaryDraft>;
}) {
  const minGross = parseGrossAmount(jobBudget?.min ?? "");
  const maxGross = parseGrossAmount(jobBudget?.max ?? "");
  const rows = candidates
    .filter((candidate) => candidate.stage === "Offer")
    .map((candidate) => {
      const draft = salaryDrafts[candidate.id];
      const expectedGross =
        parseGrossAmount(draft?.expected ?? "") ?? candidate.offerChecklist.candidateExpectedGross;
      const status = getLiveNegotiationStatus(candidate, salaryDrafts, jobBudget);
      return {
        candidate,
        expectedGross,
        status,
      };
    })
    .sort((left, right) => (right.expectedGross ?? -1) - (left.expectedGross ?? -1));

  const maxScale = Math.max(
    maxGross ? maxGross * 1.25 : 0,
    minGross ? minGross * 1.4 : 0,
    ...rows.map((row) => row.expectedGross ?? 0),
    1,
  );
  const minLeft = minGross ? Math.min(100, Math.max(0, (minGross / maxScale) * 100)) : 0;
  const maxLeft = maxGross ? Math.min(100, Math.max(0, (maxGross / maxScale) * 100)) : 0;
  const zoneWidth = Math.max(0, maxLeft - minLeft);
  const inRange = rows.filter((row) => row.status === "in_range" || row.status === "borderline").length;
  const overBudget = rows.filter((row) => row.status === "over_budget").length;
  const missing = rows.filter((row) => row.status === "missing").length;

  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Budget cona za pozicijo</h2>
          <p className="text-sm text-muted-foreground">
            {jobTitle === "all"
              ? "Izberi eno delovno mesto, nastavi bruto min/max in primerjaj kandidate."
              : `${jobTitle}: zelena cona je bruto budget podjetja, točke so pričakovanja kandidatov.`}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
            <div className="font-semibold text-emerald-500">{inRange}</div>
            <div className="text-muted-foreground">v coni</div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
            <div className="font-semibold text-red-500">{overBudget}</div>
            <div className="text-muted-foreground">over</div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
            <div className="font-semibold text-muted-foreground">{missing}</div>
            <div className="text-muted-foreground">manjka</div>
          </div>
        </div>
      </div>

      {jobTitle === "all" ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Budget graf deluje po delovni poziciji. Izberi pozicijo v filtru zgoraj.
        </div>
      ) : rows.length ? (
        <div className="grid gap-3">
          <div className="relative h-12 rounded-md border border-border bg-muted/20 px-3">
            {maxGross ? (
              <div
                className="absolute top-2 h-8 rounded-md border border-emerald-500/40 bg-emerald-500/15"
                style={{ left: `${minLeft}%`, width: `${zoneWidth}%` }}
              />
            ) : null}
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              0
            </div>
            {minGross ? (
              <div
                className="absolute top-0 h-full border-l border-emerald-500"
                style={{ left: `${minLeft}%` }}
              >
                <span className="absolute left-1 top-1 text-[11px] font-semibold text-emerald-500">
                  min {formatGrossAmount(minGross)}
                </span>
              </div>
            ) : null}
            {maxGross ? (
              <div
                className="absolute top-0 h-full border-l border-emerald-500"
                style={{ left: `${maxLeft}%` }}
              >
                <span className="absolute left-1 bottom-1 text-[11px] font-semibold text-emerald-500">
                  max {formatGrossAmount(maxGross)}
                </span>
              </div>
            ) : null}
          </div>

          <div className="grid gap-2">
            {rows.map(({ candidate, expectedGross, status }) => {
              const left = expectedGross ? Math.min(100, Math.max(0, (expectedGross / maxScale) * 100)) : 0;
              return (
                <div
                  key={candidate.id}
                  className="grid gap-2 rounded-md border border-border bg-background p-3 dark:bg-muted/15 md:grid-cols-[15rem_minmax(0,1fr)_10rem]"
                >
                  <div className="min-w-0">
                    <Link
                      to={`/applicants/${candidate.id}`}
                      className="truncate text-sm font-semibold text-foreground hover:text-cyan-500"
                    >
                      {candidate.name}
                    </Link>
                    <div className="truncate text-xs text-muted-foreground">{candidate.role}</div>
                  </div>
                  <div className="relative h-8 rounded-md bg-muted/25">
                    {maxGross ? (
                      <div
                        className="absolute top-1 h-6 rounded bg-emerald-500/10"
                        style={{ left: `${minLeft}%`, width: `${zoneWidth}%` }}
                      />
                    ) : null}
                    {expectedGross ? (
                      <div
                        className={
                          status === "over_budget"
                            ? "absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-red-500 shadow"
                            : "absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-emerald-500 shadow"
                        }
                        style={{ left: `${left}%` }}
                        title={`${candidate.name}: ${formatGrossAmount(expectedGross)} bruto`}
                      />
                    ) : null}
                  </div>
                  <div
                    className={
                      status === "over_budget"
                        ? "text-right text-sm font-semibold text-red-500"
                        : status === "missing"
                          ? "text-right text-sm font-semibold text-muted-foreground"
                          : "text-right text-sm font-semibold text-emerald-500"
                    }
                  >
                    {expectedGross ? `${formatGrossAmount(expectedGross)} bruto` : "manjka vnos"}
                    <div className="text-[11px] font-medium text-muted-foreground">
                      {negotiationLabels[status]}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Za to pozicijo še ni kandidatov v fazi ponudbe/pogajanj.
        </div>
      )}
    </section>
  );
}

function CandidateCharts({
  candidates,
  salaryDrafts,
  jobBudget,
}: {
  candidates: WorkflowCandidate[];
  salaryDrafts: Record<string, SalaryDraft>;
  jobBudget?: JobBudgetDraft;
}) {
  const stageData = workflowStages.map((stage) => ({
    stage: stageLabels[stage],
    count: candidates.filter((candidate) => candidate.stage === stage).length,
    fill: stageColors[stage],
  }));

  const statusData = (["in_range", "borderline", "over_budget", "missing"] as NegotiationStatus[]).map(
    (status) => ({
      status: negotiationLabels[status],
      count: candidates.filter((candidate) => getLiveNegotiationStatus(candidate, salaryDrafts, jobBudget) === status)
        .length,
      fill:
        status === "over_budget"
          ? "#ef4444"
          : status === "missing"
            ? "#64748b"
            : "#22c55e",
    }),
  );

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      <section className="min-w-0 rounded-md border border-border bg-card p-4">
        <h2 className="text-base font-semibold text-foreground">Kandidati po fazah</h2>
        <div className="mt-4 h-72 min-h-72 min-w-0 overflow-hidden">
          <ResponsiveContainer width="100%" height={288} minWidth={0} minHeight={288}>
            <BarChart data={stageData} margin={{ left: 0, right: 8, top: 8, bottom: 24 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="stage" interval={0} angle={-12} textAnchor="end" height={56} />
              <YAxis allowDecimals={false} width={32} />
              <Tooltip cursor={{ fill: "rgba(148, 163, 184, 0.14)" }} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="min-w-0 rounded-md border border-border bg-card p-4">
        <h2 className="text-base font-semibold text-foreground">Budget status</h2>
        <div className="mt-4 h-72 min-h-72 min-w-0 overflow-hidden">
          <ResponsiveContainer width="100%" height={288} minWidth={0} minHeight={288}>
            <BarChart data={statusData} margin={{ left: 0, right: 8, top: 8, bottom: 24 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="status" interval={0} angle={-12} textAnchor="end" height={56} />
              <YAxis allowDecimals={false} width={32} />
              <Tooltip cursor={{ fill: "rgba(148, 163, 184, 0.14)" }} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {statusData.map((entry) => (
                  <Cell key={entry.status} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

export default function InterviewWorkflow() {
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
        const haystack = `${candidate.name} ${candidate.role} ${candidate.email ?? ""}`.toLowerCase();
        if (!haystack.includes(normalizedSearch)) return false;
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
    <main className="min-h-full overflow-y-auto bg-background p-4 sm:p-6">
      <div className="mx-auto grid max-w-7xl gap-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Briefcase className="h-4 w-4" />
              Razgovori
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              Potek razgovorov
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Ločena stran za prvi krog, ponudbe in plačna pogajanja. Faze kandidata ostanejo
              usklajene z vsemi stranmi, vključno s Ponudbami.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void loadCandidates()}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Osveži
            </Button>
            <Button asChild type="button" variant="outline">
              <Link to="/interviews">
                <FileText className="mr-2 h-4 w-4" />
                Studio razgovorov
              </Link>
            </Button>
          </div>
        </div>

        {message ? (
          <div className="rounded-md border border-border bg-card px-4 py-3 text-sm text-foreground">
            {message}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-4">
          <StatCard label="Prvi krog" value={stats.interview} detail="Kandidati v razgovoru" />
          <StatCard label="Pogajanja" value={stats.offer} detail="Aktivne ponudbe" />
          <StatCard label="Presega budget" value={stats.overBudget} detail="Potrebna odločitev" />
          <StatCard label="Sprejeti" value={stats.accepted} detail="Zaključen proces" />
        </div>

        <section className="rounded-md border border-border bg-card p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(14rem,1fr)_minmax(14rem,1fr)_minmax(18rem,1.3fr)]">
            <Select value={workflowFilter} onValueChange={(value) => setWorkflowFilter(value as WorkflowFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Vsi v procesu</SelectItem>
                <SelectItem value="first_round">Razgovor za ujemanje</SelectItem>
                <SelectItem value="negotiation">Ponudba / pogajanja</SelectItem>
                <SelectItem value="in_range">Znotraj budgeta</SelectItem>
                <SelectItem value="over_budget">Presega budget</SelectItem>
                <SelectItem value="accepted">Sprejeti</SelectItem>
                <SelectItem value="rejected">Zavrnjeni</SelectItem>
              </SelectContent>
            </Select>

            <Select value={jobFilter} onValueChange={setJobFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Delovno mesto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Vsa delovna mesta</SelectItem>
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
                placeholder="Išči kandidata, vlogo ali email"
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
              Budget velja za izbrano delovno mesto. Kandidatu spodaj vpišeš samo koliko želi;
              graf takoj pokaže, kdo je znotraj cone in kdo je over budget.
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
            <BudgetZoneOverview
              candidates={filteredCandidates}
              jobTitle={jobFilter}
              jobBudget={selectedJobBudget}
              salaryDrafts={salaryDrafts}
            />
            <CandidateCharts
              candidates={filteredCandidates}
              jobBudget={selectedJobBudget}
              salaryDrafts={salaryDrafts}
            />

            <section className="rounded-md border border-border bg-card p-4">
              <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Akcije po kandidatu</h2>
                  <p className="text-sm text-muted-foreground">
                    Tu se urejajo ponudbe, plačna pogajanja in zavrnitveni ali sprejemni emaili.
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
                              <div className="font-semibold text-foreground">
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
                                Kandidat pričakuje bruto
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
                                ? "Prvi krog: po razgovoru kandidata premakni v ponudbo ali zavrni z razlogom profila veščin."
                                : "Končni status je zabeležen. Email lahko pripraviš iz akcij na desni."}
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
                                Pošlji v ponudbo
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
                                Zavrni profil
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
                                Shrani rangiranje
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="justify-start gap-2"
                                disabled={isUpdating || !canAccept}
                                onClick={() => void acceptNegotiatedCandidate(candidate)}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                                Sprejmi
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
                                Zavrni budget
                              </Button>
                            </>
                          ) : null}

                          {candidate.stage === "Accepted" ? (
                            <a
                              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-foreground transition hover:bg-muted"
                              href={getMailto(
                                candidate,
                                "Uspešno zaključen izborni postopek",
                                candidate.offerChecklist.acceptanceEmailBody ?? acceptanceMessage,
                              )}
                            >
                              <Mail className="h-4 w-4" />
                              Sprejemni email
                            </a>
                          ) : null}

                          {candidate.stage === "Rejected" ? (
                            <a
                              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-foreground transition hover:bg-muted"
                              href={getMailto(
                                candidate,
                                "Odločitev glede prijave",
                                candidate.offerChecklist.rejectionEmailBody ??
                                  skillMismatchRejectionMessage,
                              )}
                            >
                              <Mail className="h-4 w-4" />
                              Zavrnitveni email
                            </a>
                          ) : null}
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    Ni kandidatov za izbrane filtre.
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
