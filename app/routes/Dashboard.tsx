import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { Applicant, Stage } from '../store';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ComposedChart,
  PieChart,
  Pie,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import { Users, Briefcase, TrendingUp, AlertCircle, CalendarDays, Send } from 'lucide-react';
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { dedupeCandidateRows } from "../lib/candidateRows";

type DashboardApplicant = Applicant & {
  createdAt: string | null;
  aiWritingScore: number | null;
  offerChecklist?: {
    offerSent?: boolean;
  };
  offerSentAt?: string | null;
  offerFollowUpAt?: string | null;
};

const dashboardCandidateSelect =
  "id, full_name, job_title, stage, email, location, years_experience, skills, ats_score, resume_path, resume_preview_url, analysis_summary, analysis_strengths, analysis_concerns, created_at";

const dashboardCandidateSelectWithAiWriting =
  `${dashboardCandidateSelect}, ai_writing_score`;

const dashboardCandidateSelectWithOffer =
  `${dashboardCandidateSelectWithAiWriting}, offer_checklist, offer_sent_at, offer_follow_up_at`;

export default function Dashboard() {
  const { t, stageLabel } = useI18n();
  const [applicants, setApplicants] = useState<DashboardApplicant[]>([]);
  const [jobsCount, setJobsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadDashboard = async () => {
      setIsLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        if (isMounted) {
          setApplicants([]);
          setJobsCount(0);
          setIsLoading(false);
        }
        return;
      }

      const [{ data: candidateRowsWithAi, error: candidateErrorWithAi }, { count: jobCount, error: jobError }] =
        await Promise.all([
          supabase
            .from("candidates")
            .select(dashboardCandidateSelectWithOffer)
            .order("created_at", { ascending: false }),
          supabase.from("jobs").select("id", { count: "exact", head: true }),
        ]);

      if (!isMounted) return;

      let candidateRows = candidateRowsWithAi as Array<Record<string, unknown>> | null;
      let candidateError = candidateErrorWithAi;

      if (
        candidateErrorWithAi &&
        (candidateErrorWithAi.message?.includes("offer_") ||
          candidateErrorWithAi.details?.includes("offer_"))
      ) {
        const retry = await supabase
          .from("candidates")
          .select(dashboardCandidateSelectWithAiWriting)
          .order("created_at", { ascending: false });

        if (!isMounted) return;
        candidateRows = retry.data as Array<Record<string, unknown>> | null;
        candidateError = retry.error;
      }

      if (
        candidateError &&
        (candidateError.message?.includes("ai_writing") ||
          candidateError.details?.includes("ai_writing"))
      ) {
        const retry = await supabase
          .from("candidates")
          .select(dashboardCandidateSelect)
          .order("created_at", { ascending: false });

        if (!isMounted) return;
        candidateRows = retry.data as Array<Record<string, unknown>> | null;
        candidateError = retry.error;
      }

      if (candidateError || jobError) {
        setApplicants([]);
        setJobsCount(jobCount ?? 0);
        setIsLoading(false);
        return;
      }

      const mapped = dedupeCandidateRows(candidateRows ?? []).map((row) => ({
        id: row.id,
        name: row.full_name,
        role: row.job_title,
        stage: (row.stage as Stage) ?? "Applied",
        aiScore: Number(row.ats_score ?? 0),
        skills: row.skills ?? [],
        experience: Number(row.years_experience ?? 0),
        location: row.location ?? "Location pending",
        avatar: row.resume_preview_url ?? "",
        email: row.email ?? "",
        phone: "",
        summary: row.analysis_summary ?? "",
        createdAt: row.created_at ?? null,
        aiWritingScore: row.ai_writing_score == null ? null : Number(row.ai_writing_score),
        offerChecklist: row.offer_checklist
          ? {
              offerSent: Boolean((row.offer_checklist as Record<string, boolean>).offerSent),
            }
          : undefined,
        offerSentAt: (row.offer_sent_at as string | null | undefined) ?? null,
        offerFollowUpAt: (row.offer_follow_up_at as string | null | undefined) ?? null,
        matchAnalysis: {
          pros: row.analysis_strengths ?? [],
          cons: row.analysis_concerns ?? [],
        },
      })) as DashboardApplicant[];

      setApplicants(mapped);
      setJobsCount(jobCount ?? 0);
      setIsLoading(false);
    };

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  const totalApplicants = applicants.length;
  const activeJobs = jobsCount;
  const avgScore = totalApplicants
    ? Math.round(applicants.reduce((acc, curr) => acc + curr.aiScore, 0) / totalApplicants)
    : 0;
  const candidatesNeedingReview = applicants.filter((applicant) =>
    ["Applied", "Screening"].includes(applicant.stage),
  ).length;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newApplicantsThisWeek = applicants.filter((applicant) => {
    if (!applicant.createdAt) return false;
    return new Date(applicant.createdAt).getTime() >= sevenDaysAgo;
  }).length;
  const offerApplicants = applicants.filter((applicant) => applicant.stage === "Offer");
  const sentOffersCount = offerApplicants.filter(
    (applicant) => applicant.offerChecklist?.offerSent,
  ).length;
  const preparingOffersCount = Math.max(offerApplicants.length - sentOffersCount, 0);
  const followUpsDueCount = offerApplicants.filter((applicant) => {
    if (!applicant.offerChecklist?.offerSent || !applicant.offerFollowUpAt) return false;
    return new Date(applicant.offerFollowUpAt).getTime() <= Date.now();
  }).length;

  const stageData = useMemo(
    () => [
      { stage: "Applied" as Stage, label: stageLabel("Applied"), value: applicants.filter((a) => a.stage === "Applied").length },
      { stage: "Screening" as Stage, label: stageLabel("Screening"), value: applicants.filter((a) => a.stage === "Screening").length },
      { stage: "Interview" as Stage, label: stageLabel("Interview"), value: applicants.filter((a) => a.stage === "Interview").length },
      { stage: "Offer" as Stage, label: stageLabel("Offer"), value: applicants.filter((a) => a.stage === "Offer").length },
      { stage: "Rejected" as Stage, label: stageLabel("Rejected"), value: applicants.filter((a) => a.stage === "Rejected").length },
    ],
    [applicants, stageLabel],
  );

  const stageCounts = useMemo(
    () =>
      stageData.reduce<Record<Stage, number>>(
        (acc, stage) => {
          acc[stage.stage] = stage.value;
          return acc;
        },
        { Applied: 0, Screening: 0, Interview: 0, Offer: 0, Rejected: 0 },
      ),
    [stageData],
  );

  const formatPercent = (value: number, total: number) =>
    total > 0 ? `${Math.round((value / total) * 100)}%` : "0%";

  const pipelineHealth = [
    {
      label: t("screeningToInterview"),
      value: formatPercent(
        stageCounts.Interview + stageCounts.Offer,
        stageCounts.Screening + stageCounts.Interview + stageCounts.Offer,
      ),
      detail: `${stageCounts.Interview + stageCounts.Offer} ${t("reachedInterview")}`,
      color: "#8b5cf6",
    },
    {
      label: t("interviewToOffer"),
      value: formatPercent(stageCounts.Offer, stageCounts.Interview + stageCounts.Offer),
      detail: `${stageCounts.Offer} ${stageCounts.Offer === 1 ? t("offerStageCandidate") : t("offerStageCandidates")}`,
      color: "#ec4899",
    },
    {
      label: t("offerRate"),
      value: formatPercent(stageCounts.Offer, totalApplicants),
      detail: t("offersAcrossApplicants"),
      color: "#22c55e",
    },
    {
      label: t("rejectionRate"),
      value: formatPercent(stageCounts.Rejected, totalApplicants),
      detail: `${stageCounts.Rejected} ${stageCounts.Rejected === 1 ? t("rejectedCandidate") : t("rejectedCandidates")}`,
      color: "#ef4444",
    },
  ];

  const offerTrendData = useMemo(() => {
    const days = Array.from({ length: 14 }, (_item, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (13 - index));
      const key = date.toISOString().slice(0, 10);

      return {
        key,
        label: date.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" }),
        offers: 0,
        sent: 0,
      };
    });

    const byKey = new Map(days.map((day) => [day.key, day]));

    offerApplicants.forEach((applicant) => {
      if (applicant.createdAt) {
        const key = new Date(applicant.createdAt).toISOString().slice(0, 10);
        const day = byKey.get(key);
        if (day) day.offers += 1;
      }

      if (applicant.offerSentAt) {
        const key = new Date(applicant.offerSentAt).toISOString().slice(0, 10);
        const day = byKey.get(key);
        if (day) day.sent += 1;
      }
    });

    return days;
  }, [offerApplicants]);

  const offerStatusData = [
    { label: t("offerStatusPreparing"), value: preparingOffersCount, color: "#f59e0b" },
    { label: t("offerStatusSent"), value: sentOffersCount, color: "#22c55e" },
    { label: t("offerFollowUpsDue"), value: followUpsDueCount, color: "#06b6d4" },
  ];

  const recentApplicants = [...applicants]
    .sort((a, b) => b.aiScore - a.aiScore)
    .slice(0, 3);

  const stats = [
    { label: t('totalApplicants'), value: totalApplicants, detail: t('allCandidates'), icon: Users, tone: 'text-sky-600 bg-sky-500/10 dark:text-sky-300' },
    { label: t('activeJobs'), value: activeJobs, detail: t('openRoles'), icon: Briefcase, tone: 'text-violet-600 bg-violet-500/10 dark:text-violet-300' },
    { label: t('averageMatchScore'), value: `${avgScore}%`, detail: t('acrossCandidates'), icon: TrendingUp, tone: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-300' },
    { label: t('needReview'), value: candidatesNeedingReview, detail: t('appliedScreening'), icon: AlertCircle, tone: 'text-amber-600 bg-amber-500/10 dark:text-amber-300' },
    { label: t('newThisWeek'), value: newApplicantsThisWeek, detail: t('lastSevenDays'), icon: CalendarDays, tone: 'text-cyan-600 bg-cyan-500/10 dark:text-cyan-300' },
    { label: t('sentOffers'), value: sentOffersCount, detail: t('offersSentDetail'), icon: Send, tone: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-300' },
  ];

  const STAGE_COLORS = {
    Applied: "#06b6d4",
    Screening: "#8b5cf6",
    Interview: "#ec4899",
    Offer: "#22c55e",
    Rejected: "#ef4444",
  } satisfies Record<Stage, string>;

  return (
    <div className="page-container">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">{t("dashboardOverview")}</h1>
          <p className="text-sm subtle-text">{t("dashboardSubtitle")}</p>
        </div>
        <div className="flex space-x-2">
          <select className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm focus:border-ring focus:ring-ring">
            <option>{t("last7Days")}</option>
            <option>{t("last30Days")}</option>
            <option>{t("thisYear")}</option>
          </select>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {stats.map((stat) => (
          <div key={stat.label} className="surface-card overflow-hidden p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-start gap-3">
              <div className={`flex-shrink-0 rounded-md p-2.5 ${stat.tone}`}>
                <stat.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <dl>
                  <dt className="truncate text-xs font-medium uppercase tracking-wide subtle-text">{stat.label}</dt>
                  <dd>
                    <div className="mt-1 text-2xl font-semibold text-foreground">{stat.value}</div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">{stat.detail}</div>
                  </dd>
                </dl>
              </div>
            </div>
            
            </div>
          
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        {/* Bar Chart */}
        <div className="surface-card p-5">
          <h2 className="mb-4 text-base font-semibold text-foreground">{t("applicantPipeline")}</h2>
          <div className="h-64 w-full min-w-0 min-h-[256px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256}>
              <ComposedChart data={stageData}>
                <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} stroke="var(--muted-foreground)" />
                <YAxis fontSize={12} tickLine={false} axisLine={false} stroke="var(--muted-foreground)" />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', boxShadow: '0 12px 24px -18px rgb(0 0 0 / 0.45)' }}
                  cursor={{ fill: 'var(--muted)' }}
                  formatter={(value) => [value, t("applicants")]}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={40}>
                  {stageData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={STAGE_COLORS[entry.stage]} />
                  ))}
                </Bar>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--foreground)"
                  strokeWidth={2.5}
                  dot={{ r: 4, strokeWidth: 2, fill: "var(--card)" }}
                  activeDot={{ r: 6 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart */}
        <div className="surface-card flex flex-col items-center justify-center p-5">
          <h2 className="mb-4 w-full text-left text-base font-semibold text-foreground">{t("distributionByStage")}</h2>
          <div className="h-64 w-full min-w-0 min-h-[256px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256}>
              <PieChart>
                <Pie
                  data={stageData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  nameKey="label"
                >
                  {stageData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={STAGE_COLORS[entry.stage]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)' }}
                  formatter={(value) => [value, t("applicants")]}
                />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ color: "var(--foreground)" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="surface-card p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-foreground">{t("offerTracking")}</h2>
            <p className="text-sm text-muted-foreground">{t("offerTrackingSubtitle")}</p>
          </div>
          <div className="h-64 w-full min-h-[256px] min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256}>
              <LineChart data={offerTrendData}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} stroke="var(--muted-foreground)" />
                <YAxis allowDecimals={false} fontSize={12} tickLine={false} axisLine={false} stroke="var(--muted-foreground)" />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)' }}
                />
                <Line
                  type="monotone"
                  dataKey="offers"
                  name={t("offersCreated")}
                  stroke="#8b5cf6"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="sent"
                  name={t("offersSent")}
                  stroke="#22c55e"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-card p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-foreground">{t("offerStatusOverview")}</h2>
            <p className="text-sm text-muted-foreground">{t("offerStatusOverviewSubtitle")}</p>
          </div>
          <div className="h-64 w-full min-h-[256px] min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256}>
              <BarChart data={offerStatusData} layout="vertical" margin={{ left: 18, right: 12 }}>
                <XAxis type="number" allowDecimals={false} hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={96}
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  stroke="var(--muted-foreground)"
                />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)' }}
                  formatter={(value) => [value, t("applicants")]}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={22}>
                  {offerStatusData.map((entry) => (
                    <Cell key={entry.label} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="surface-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">{t("pipelineHealth")}</h2>
            <p className="text-sm text-muted-foreground">{t("pipelineHealthSubtitle")}</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {pipelineHealth.map((metric) => (
            <div key={metric.label} className="rounded-md border border-border bg-muted/35 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {metric.label}
                </span>
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: metric.color }}
                />
              </div>
              <div className="mt-3 text-2xl font-semibold text-foreground">{metric.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{metric.detail}</div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: metric.value,
                    backgroundColor: metric.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Candidates */}
      <div className="surface-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">{t("topCandidateMatches")}</h2>
            <p className="text-sm text-muted-foreground">{t("topCandidateMatchesSubtitle")}</p>
          </div>
          <a href="/applicants" className="text-sm font-medium text-foreground underline-offset-4 hover:underline">{t("viewAll")}</a>
        </div>
        <div className="space-y-3">
          {recentApplicants.map((applicant) => (
             <div
                key={applicant.id} 
                className="grid gap-4 rounded-md border border-border bg-muted/35 p-4 transition-colors hover:bg-muted/60 lg:grid-cols-[1.2fr_1fr_0.7fr_0.8fr_0.9fr_1.4fr_auto] lg:items-center"
             >
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground lg:hidden">{t("candidate")}</div>
                  <p className="text-sm font-semibold text-foreground">{applicant.name}</p>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground lg:hidden">{t("job")}</div>
                  <p className="text-sm text-muted-foreground">{applicant.role}</p>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground lg:hidden">{t("match")}</div>
                  <span className="text-lg font-semibold text-emerald-500">{applicant.aiScore}%</span>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground lg:hidden">{t("stage")}</div>
                  <Badge variant="secondary">{stageLabel(applicant.stage)}</Badge>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground lg:hidden">{t("aiWriting")}</div>
                  <span className="text-sm font-medium text-foreground">
                    {applicant.aiWritingScore == null ? t("notScored") : `${Math.round(applicant.aiWritingScore)}%`}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground lg:hidden">{t("aiSummary")}</div>
                  <p className="truncate text-sm text-muted-foreground">
                    {applicant.summary || applicant.matchAnalysis.pros[0] || t("aiAnalysisPending")}
                  </p>
                </div>
                <div className="flex justify-start lg:justify-end">
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/applicants/${applicant.id}`}>{t("review")}</Link>
                  </Button>
                </div>
             </div>
          ))}
        </div>
      </div>

    </div>
  );
}
