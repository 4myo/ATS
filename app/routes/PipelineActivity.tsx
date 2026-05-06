import { useEffect, useMemo, useState } from "react";
import * as d3 from "d3";
import { Link } from "react-router";
import {
  Activity,
  Briefcase,
  Clock,
  FileText,
  GitBranch,
  PlusCircle,
  Trash2,
  Users,
} from "lucide-react";
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
import type { ActivityLogRow } from "../lib/activityLog";

type TimelineEvent = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string;
  fromValue: string | null;
  toValue: string | null;
  createdAt: string;
  source: "log" | "snapshot";
  metadata?: Record<string, unknown> | null;
};

type CandidateSnapshot = {
  id: string;
  full_name: string;
  job_title: string;
  stage: string | null;
  ats_score: number | null;
  analysis_status: string | null;
  offer_outcome: string | null;
  offer_sent_at: string | null;
  created_at: string;
};

type JobSnapshot = {
  id: string;
  title: string;
  status: string | null;
  openings: number | null;
  created_at: string;
};

type OfferDocumentSnapshot = {
  id: string;
  candidate_id: string;
  title: string;
  status: string | null;
  created_at: string;
  updated_at?: string | null;
};

const actionLabels: Record<string, string> = {
  candidate_created: "Kandidat ustvarjen",
  candidate_deleted: "Kandidat izbrisan",
  candidate_stage_changed: "Premik faze",
  job_created: "Delovno mesto ustvarjeno",
  job_updated: "Delovno mesto urejeno",
  job_deleted: "Delovno mesto izbrisano",
  job_status_changed: "Status delovnega mesta",
  offer_document_created: "Ponudbeni dokument ustvarjen",
  offer_document_updated: "Ponudbeni dokument urejen",
  offer_sent: "Ponudba poslana",
  offer_outcome_changed: "Izid ponudbe",
  snapshot_candidate_created: "Kandidat ustvarjen",
  snapshot_job_created: "Delovno mesto ustvarjeno",
  snapshot_offer_document_created: "Ponudbeni dokument ustvarjen",
};

const actionColors: Record<string, string> = {
  candidate_created: "#06b6d4",
  candidate_deleted: "#ef4444",
  candidate_stage_changed: "#8b5cf6",
  job_created: "#22c55e",
  job_updated: "#f59e0b",
  job_deleted: "#ef4444",
  job_status_changed: "#14b8a6",
  offer_document_created: "#ec4899",
  offer_document_updated: "#a855f7",
  offer_sent: "#10b981",
  offer_outcome_changed: "#64748b",
  snapshot_candidate_created: "#06b6d4",
  snapshot_job_created: "#22c55e",
  snapshot_offer_document_created: "#ec4899",
};

const entityIcons = {
  candidate: Users,
  job: Briefcase,
  offer_document: FileText,
} as const;

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const shortDate = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
  }).format(value);

const toDayKey = (value: string) => new Date(value).toISOString().slice(0, 10);

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex min-h-64 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function EventBars({ events }: { events: TimelineEvent[] }) {
  const data = useMemo(() => {
    const byAction = d3.rollups(
      events,
      (items) => items.length,
      (item) => item.action,
    );
    return byAction
      .map(([action, value]) => ({
        action,
        label: actionLabels[action] ?? action,
        value,
        color: actionColors[action] ?? "#64748b",
      }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 8);
  }, [events]);

  if (!data.length) return <EmptyChart label="Ni dogodkov za izbrani pogled." />;

  const width = 760;
  const height = 280;
  const margin = { top: 20, right: 20, bottom: 58, left: 36 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const maxValue = d3.max(data, (item) => item.value) ?? 1;
  const x = d3
    .scaleBand()
    .domain(data.map((item) => item.action))
    .range([0, chartWidth])
    .padding(0.24);
  const y = d3.scaleLinear().domain([0, Math.max(1, maxValue)]).nice().range([chartHeight, 0]);
  const ticks = y.ticks(4).filter((tick) => Number.isInteger(tick));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="min-h-64 w-full overflow-visible">
      <g transform={`translate(${margin.left},${margin.top})`}>
        {ticks.map((tick) => (
          <g key={tick} transform={`translate(0,${y(tick)})`}>
            <line x1={0} x2={chartWidth} stroke="var(--border)" strokeDasharray="3 4" />
            <text x={-10} y={4} textAnchor="end" className="fill-muted-foreground text-[11px]">
              {tick}
            </text>
          </g>
        ))}
        {data.map((item) => {
          const barX = x(item.action) ?? 0;
          const barHeight = chartHeight - y(item.value);
          return (
            <g key={item.action}>
              <rect
                x={barX}
                y={y(item.value)}
                width={x.bandwidth()}
                height={barHeight}
                rx={6}
                fill={item.color}
                opacity={0.82}
              >
                <title>{`${item.label}: ${item.value}`}</title>
              </rect>
              <text
                x={barX + x.bandwidth() / 2}
                y={y(item.value) - 8}
                textAnchor="middle"
                className="fill-foreground text-[12px] font-semibold"
              >
                {item.value}
              </text>
              <text
                x={barX + x.bandwidth() / 2}
                y={chartHeight + 24}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {item.label.length > 13 ? `${item.label.slice(0, 12)}...` : item.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function HourBars({ events }: { events: TimelineEvent[] }) {
  const data = useMemo(
    () =>
      Array.from({ length: 24 }, (_item, hour) => ({
        hour,
        label: `${hour.toString().padStart(2, "0")}h`,
        value: events.filter((event) => new Date(event.createdAt).getHours() === hour).length,
      })),
    [events],
  );

  if (!events.length) return <EmptyChart label="Ni časovne distribucije." />;

  const width = 760;
  const height = 280;
  const margin = { top: 20, right: 20, bottom: 44, left: 32 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const x = d3.scaleBand().domain(data.map((item) => String(item.hour))).range([0, chartWidth]).padding(0.18);
  const y = d3
    .scaleLinear()
    .domain([0, Math.max(1, d3.max(data, (item) => item.value) ?? 1)])
    .nice()
    .range([chartHeight, 0]);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="min-h-64 w-full overflow-visible">
      <g transform={`translate(${margin.left},${margin.top})`}>
        {y.ticks(4).map((tick) => (
          <line key={tick} x1={0} x2={chartWidth} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeDasharray="3 4" />
        ))}
        {data.map((item) => (
          <rect
            key={item.hour}
            x={x(String(item.hour))}
            y={y(item.value)}
            width={x.bandwidth()}
            height={chartHeight - y(item.value)}
            rx={5}
            fill="#34d399"
            opacity={item.value ? 0.9 : 0.18}
          >
            <title>{`${item.label}: ${item.value}`}</title>
          </rect>
        ))}
        {data.filter((item) => item.hour % 2 === 0).map((item) => (
          <text
            key={item.hour}
            x={(x(String(item.hour)) ?? 0) + x.bandwidth() / 2}
            y={chartHeight + 22}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {item.label}
          </text>
        ))}
      </g>
    </svg>
  );
}

function ScatterTimeline({ events }: { events: TimelineEvent[] }) {
  const sortedEvents = useMemo(
    () => [...events].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
    [events],
  );

  if (sortedEvents.length < 2) return <EmptyChart label="Za prikaz časovnega raztrosa potrebujemo vsaj dva dogodka." />;

  const width = 960;
  const height = 320;
  const margin = { top: 24, right: 24, bottom: 46, left: 42 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const dates = sortedEvents.map((event) => new Date(event.createdAt));
  const first = d3.min(dates) ?? new Date();
  const last = d3.max(dates) ?? new Date();
  const x = d3.scaleTime().domain([first, last]).range([0, chartWidth]);
  const y = d3.scaleLinear().domain([0, 100]).range([chartHeight, 0]);
  const ticks = x.ticks(5);
  const actionIndex = new Map([...new Set(sortedEvents.map((event) => event.action))].map((action, index) => [action, index]));
  const maxIndex = Math.max(1, actionIndex.size - 1);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="min-h-72 w-full overflow-visible">
      <g transform={`translate(${margin.left},${margin.top})`}>
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick} transform={`translate(0,${y(tick)})`}>
            <line x1={0} x2={chartWidth} stroke="var(--border)" strokeDasharray="3 4" />
            <text x={-10} y={4} textAnchor="end" className="fill-muted-foreground text-[11px]">
              {tick}
            </text>
          </g>
        ))}
        {ticks.map((tick) => (
          <text
            key={tick.toISOString()}
            x={x(tick)}
            y={chartHeight + 24}
            textAnchor="middle"
            className="fill-muted-foreground text-[11px]"
          >
            {shortDate(tick)}
          </text>
        ))}
        {sortedEvents.map((event) => {
          const score =
            typeof event.metadata?.ats_score === "number"
              ? event.metadata.ats_score
              : 10 + ((actionIndex.get(event.action) ?? 0) / maxIndex) * 80;
          return (
            <circle
              key={event.id}
              cx={x(new Date(event.createdAt))}
              cy={y(score)}
              r={5}
              fill={actionColors[event.action] ?? "#60a5fa"}
              opacity={0.74}
            >
              <title>{`${actionLabels[event.action] ?? event.action} · ${event.entityLabel} · ${formatDateTime(event.createdAt)}`}</title>
            </circle>
          );
        })}
      </g>
    </svg>
  );
}

export default function PipelineActivity() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [logsAvailable, setLogsAvailable] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  useEffect(() => {
    let isMounted = true;

    const loadActivity = async () => {
      setIsLoading(true);

      const [logResult, candidateResult, jobResult, documentResult] = await Promise.all([
        supabase
          .from("activity_logs")
          .select("id, action, entity_type, entity_id, entity_label, from_value, to_value, metadata, created_at")
          .order("created_at", { ascending: false })
          .limit(250),
        supabase
          .from("candidates")
          .select("id, full_name, job_title, stage, ats_score, analysis_status, offer_outcome, offer_sent_at, created_at")
          .order("created_at", { ascending: false })
          .limit(250),
        supabase
          .from("jobs")
          .select("id, title, status, openings, created_at")
          .order("created_at", { ascending: false })
          .limit(150),
        supabase
          .from("offer_documents")
          .select("id, candidate_id, title, status, created_at, updated_at")
          .order("created_at", { ascending: false })
          .limit(150),
      ]);

      if (!isMounted) return;

      const logEvents =
        logResult.error
          ? []
          : ((logResult.data ?? []) as ActivityLogRow[]).map((row) => ({
              id: row.id,
              action: row.action,
              entityType: row.entity_type,
              entityId: row.entity_id,
              entityLabel: row.entity_label ?? "Brez oznake",
              fromValue: row.from_value,
              toValue: row.to_value,
              createdAt: row.created_at,
              source: "log" as const,
              metadata: row.metadata,
            }));

      const candidateSnapshots = ((candidateResult.data ?? []) as CandidateSnapshot[]).map((candidate) => ({
        id: `candidate-${candidate.id}`,
        action: "snapshot_candidate_created",
        entityType: "candidate",
        entityId: candidate.id,
        entityLabel: candidate.full_name,
        fromValue: null,
        toValue: candidate.stage,
        createdAt: candidate.created_at,
        source: "snapshot" as const,
        metadata: {
          job_title: candidate.job_title,
          ats_score: Number(candidate.ats_score ?? 0),
          analysis_status: candidate.analysis_status,
          offer_outcome: candidate.offer_outcome,
          offer_sent_at: candidate.offer_sent_at,
        },
      }));

      const jobSnapshots = ((jobResult.data ?? []) as JobSnapshot[]).map((job) => ({
        id: `job-${job.id}`,
        action: "snapshot_job_created",
        entityType: "job",
        entityId: job.id,
        entityLabel: job.title,
        fromValue: null,
        toValue: job.status ?? "active",
        createdAt: job.created_at,
        source: "snapshot" as const,
        metadata: { openings: job.openings },
      }));

      const documentSnapshots = ((documentResult.data ?? []) as OfferDocumentSnapshot[]).map((document) => ({
        id: `offer-document-${document.id}`,
        action: "snapshot_offer_document_created",
        entityType: "offer_document",
        entityId: document.id,
        entityLabel: document.title,
        fromValue: null,
        toValue: document.status ?? "draft",
        createdAt: document.created_at,
        source: "snapshot" as const,
        metadata: { candidate_id: document.candidate_id, updated_at: document.updated_at },
      }));

      setLogsAvailable(!logResult.error);
      setEvents([...logEvents, ...candidateSnapshots, ...jobSnapshots, ...documentSnapshots]);
      setIsLoading(false);
    };

    loadActivity();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredEvents = useMemo(
    () =>
      events
        .filter((event) => entityFilter === "all" || event.entityType === entityFilter)
        .filter((event) => actionFilter === "all" || event.action === actionFilter)
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [actionFilter, entityFilter, events],
  );

  const stats = useMemo(() => {
    const stageMoves = filteredEvents.filter((event) => event.action === "candidate_stage_changed").length;
    const creations = filteredEvents.filter((event) => event.action.includes("created")).length;
    const deletes = filteredEvents.filter((event) => event.action.includes("deleted")).length;
    const offerEvents = filteredEvents.filter((event) => event.entityType === "offer_document" || event.action.includes("offer")).length;
    const uniqueDays = new Set(filteredEvents.map((event) => toDayKey(event.createdAt))).size;

    return [
      { label: "Dogodki", value: filteredEvents.length, icon: Activity },
      { label: "Ustvaritve", value: creations, icon: PlusCircle },
      { label: "Premiki faz", value: stageMoves, icon: GitBranch },
      { label: "Ponudbeni dokumenti", value: offerEvents, icon: FileText },
      { label: "Brisanja", value: deletes, icon: Trash2 },
      { label: "Aktivni dnevi", value: uniqueDays, icon: Clock },
    ];
  }, [filteredEvents]);

  const actionOptions = useMemo(
    () => [...new Set(events.map((event) => event.action))].sort(),
    [events],
  );

  return (
    <div className="page-container">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="page-title">Dnevnik aktivnosti</h1>
          <p className="text-sm subtle-text">
            Pregled ustvarjanja, urejanja, brisanja, ponudb in premikov kandidatov skozi faze postopka.
          </p>
        </div>
        <div className="surface-card flex flex-wrap items-end gap-3 p-3">
          <div className="grid min-w-[180px] gap-1.5">
            <span className="text-sm font-medium text-foreground">Vrsta zapisa</span>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Vse</SelectItem>
                <SelectItem value="candidate">Kandidati</SelectItem>
                <SelectItem value="job">Delovna mesta</SelectItem>
                <SelectItem value="offer_document">Ponudbeni dokumenti</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-[220px] gap-1.5">
            <span className="text-sm font-medium text-foreground">Dogodek</span>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Vsi dogodki</SelectItem>
                {actionOptions.map((action) => (
                  <SelectItem key={action} value={action}>
                    {actionLabels[action] ?? action}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {!logsAvailable ? (
        <div className="surface-card border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Tabela <code>activity_logs</code> še ni ustvarjena, zato stran prikazuje posnetke trenutnega stanja iz obstoječih tabel.
          Po zagonu SQL sheme bodo novi premiki in urejanja zapisani kot dnevniški zapisi.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {stats.map((stat) => (
          <div key={stat.label} className="surface-card p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-muted p-2.5 text-foreground">
                <stat.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide subtle-text">{stat.label}</div>
                <div className="mt-1 text-2xl font-semibold text-foreground">{stat.value}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="surface-card flex items-center justify-center border-dashed py-16 text-sm text-muted-foreground">
          Nalaganje dogodkov postopka...
        </div>
      ) : (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            <section className="surface-card p-5">
              <h2 className="mb-1 text-base font-semibold text-foreground">Porazdelitev dogodkov</h2>
              <p className="mb-4 text-sm text-muted-foreground">Najpogostejše akcije v izbranem pogledu.</p>
              <EventBars events={filteredEvents} />
            </section>
            <section className="surface-card p-5">
              <h2 className="mb-1 text-base font-semibold text-foreground">Ura v dnevu</h2>
              <p className="mb-4 text-sm text-muted-foreground">Kdaj se običajno dogajajo spremembe postopka.</p>
              <HourBars events={filteredEvents} />
            </section>
          </div>

          <section className="surface-card p-5">
            <h2 className="mb-1 text-base font-semibold text-foreground">Časovni raztros</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Čas dogodka je prikazan po osi X; višina prikazuje ATS oceno, kjer obstaja, sicer razporeditev vrst dogodkov.
            </p>
            <ScatterTimeline events={filteredEvents} />
          </section>

          <section className="surface-card overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold text-foreground">Dnevniški zapisi</h2>
              <p className="text-sm text-muted-foreground">Zadnji dogodki in posnetki trenutnega stanja postopka.</p>
            </div>
            <div className="divide-y divide-border">
              {filteredEvents.slice(0, 80).map((event) => {
                const Icon = entityIcons[event.entityType as keyof typeof entityIcons] ?? Activity;
                const detailPath =
                  event.entityType === "candidate" && event.entityId
                    ? `/applicants/${event.entityId}`
                    : event.entityType === "job" && event.entityId
                      ? `/jobs/${event.entityId}`
                      : null;

                return (
                  <div key={event.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[2fr_1fr_1fr_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{event.entityLabel}</p>
                          <p className="truncate text-xs text-muted-foreground">{actionLabels[event.action] ?? event.action}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {event.fromValue || event.toValue ? (
                        <span>
                          {event.fromValue ?? "-"} → <span className="font-medium text-foreground">{event.toValue ?? "-"}</span>
                        </span>
                      ) : (
                        <span>-</span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">{formatDateTime(event.createdAt)}</div>
                    <div className="flex items-center gap-2 lg:justify-end">
                      <Badge variant={event.source === "log" ? "default" : "secondary"}>
                        {event.source === "log" ? "dnevnik" : "stanje"}
                      </Badge>
                      {detailPath ? (
                        <Button asChild variant="outline" size="sm">
                          <Link to={detailPath}>Odpri zapis</Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {!filteredEvents.length ? (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground">Ni dogodkov za izbrane filtre.</div>
              ) : null}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
