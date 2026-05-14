import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import * as d3 from "d3";
import type { Applicant, Stage } from "../store";
import { Users, Briefcase, TrendingUp, AlertCircle, CalendarDays, Send } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
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
import { dedupeCandidateRows } from "../lib/candidateRows";
import {
  getDashboardCache,
  getDashboardRequest,
  hasFreshDashboardCache,
  setDashboardCache,
  setDashboardRequest,
  type CachedDashboardJob,
} from "../lib/dashboardCache";

type DashboardApplicant = Applicant & {
  createdAt: string | null;
  aiWritingScore: number | null;
  offerOutcome?: string | null;
  offerChecklist?: {
    offerSent?: boolean;
  };
  offerSentAt?: string | null;
};

type DashboardJob = CachedDashboardJob;

type BarDatum = {
  key: string;
  label: string;
  value: number;
  color: string;
};

type TrendDatum = {
  key: string;
  label: string;
  offers: number;
  sent: number;
};

type JobCapacityDatum = {
  id: string;
  title: string;
  status: string;
  openings: number;
  accepted: number;
  applicants: number;
};

const dashboardCandidateSelect =
  "id, full_name, job_title, stage, email, location, years_experience, skills, ats_score, resume_path, resume_preview_url, analysis_summary, analysis_strengths, analysis_concerns, created_at";

const dashboardCandidateSelectWithAiWriting =
  `${dashboardCandidateSelect}, ai_writing_score`;

const dashboardCandidateSelectWithOffer =
  `${dashboardCandidateSelectWithAiWriting}, offer_checklist, offer_outcome, offer_sent_at`;

const stageOrder: Stage[] = [
  "Applied",
  "Screening",
  "Interview",
  "Offer",
  "Accepted",
  "Rejected",
];

const stageColors = {
  Applied: "#06b6d4",
  Screening: "#8b5cf6",
  Interview: "#ec4899",
  Offer: "#22c55e",
  Accepted: "#14b8a6",
  Rejected: "#ef4444",
} satisfies Record<Stage, string>;

const integerTicks = (maxValue: number, desired = 4) => {
  const max = Math.max(0, Math.ceil(maxValue));
  if (max <= 0) return [0];
  const step = Math.max(1, Math.ceil(max / desired));
  const ticks = d3.range(0, max + step, step);
  return ticks[ticks.length - 1] === max ? ticks : [...ticks, max];
};

const shortLabel = (value: string, maxLength = 18) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-56 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function ChartInsight({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string | number;
  detail?: string;
  color?: string;
}) {
  return (
    <div className="mt-3 flex min-h-12 items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {color ? <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} /> : null}
          <span className="truncate text-sm font-semibold text-foreground">{label}</span>
        </div>
        {detail ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p> : null}
      </div>
      <span className="text-xl font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function LoadingChart({
  variant = "bars",
}: {
  variant?: "bars" | "donut" | "line" | "capacity" | "score";
}) {
  const colors = ["#06b6d4", "#8b5cf6", "#ec4899", "#22c55e", "#14b8a6", "#ef4444"];
  const bars = [74, 118, 86, 146, 104, 62];
  const width = 720;
  const height = 280;

  if (variant === "donut") {
    return (
      <div className="grid h-full min-h-64 gap-3 md:grid-cols-[minmax(0,1fr)_10rem] md:items-center">
        <svg viewBox="0 0 360 280" className="h-full min-h-56 w-full">
          <g transform="translate(180,140)">
            {[0, 1, 2, 3].map((item) => (
              <circle
                key={item}
                r={92 - item * 9}
                fill="none"
                stroke={colors[item]}
                strokeWidth="7"
                strokeDasharray={`${72 + item * 22} 420`}
                strokeLinecap="round"
                opacity="0.45"
                transform={`rotate(${item * 82})`}
              >
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from={`${item * 82} 0 0`}
                  to={`${360 + item * 82} 0 0`}
                  dur={`${4 + item * 0.7}s`}
                  repeatCount="indefinite"
                />
                <animate attributeName="opacity" values="0.25;0.75;0.25" dur="1.8s" repeatCount="indefinite" />
              </circle>
            ))}
          </g>
        </svg>
        <div className="grid content-center gap-3">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[item] }} />
              <span className="h-3 flex-1 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "line") {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full min-h-64 w-full overflow-visible">
        <g transform="translate(38,18)">
          {[0, 1, 2, 3].map((row) => (
            <line key={row} x1={0} x2={660} y1={row * 52} y2={row * 52} stroke="var(--border)" strokeDasharray="3 4" />
          ))}
          <path d="M0 170 C80 90 140 120 210 84 S340 60 420 116 S560 170 660 76" fill="none" stroke="#8b5cf6" strokeWidth="4" strokeLinecap="round" opacity="0.75">
            <animate attributeName="stroke-dasharray" values="1 900;520 900;1 900" dur="2.4s" repeatCount="indefinite" />
          </path>
          <path d="M0 190 C90 150 150 168 220 124 S360 96 440 142 S560 118 660 104" fill="none" stroke="#22c55e" strokeWidth="4" strokeLinecap="round" opacity="0.72">
            <animate attributeName="stroke-dasharray" values="1 900;500 900;1 900" dur="2.7s" repeatCount="indefinite" />
          </path>
        </g>
      </svg>
    );
  }

  if (variant === "capacity") {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full min-h-64 w-full overflow-visible">
        <g transform="translate(150,28)">
          {[0, 1, 2, 3, 4].map((row) => (
            <g key={row} transform={`translate(0,${row * 42})`}>
              <rect x="-118" y="4" width="88" height="10" rx="5" fill="var(--muted)" />
              <rect x="0" y="0" width="470" height="18" rx="6" fill="var(--muted)" />
              <rect x="0" y="0" height="18" rx="6" fill={colors[row % colors.length]}>
                <animate attributeName="width" values={`18;${180 + row * 56};18`} dur={`${1.6 + row * 0.15}s`} repeatCount="indefinite" />
              </rect>
            </g>
          ))}
        </g>
      </svg>
    );
  }

  if (variant === "score") {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full min-h-56 w-full overflow-visible">
        <g transform="translate(38,18)">
          {[0, 1, 2, 3, 4].map((row) => (
            <line key={row} x1={0} x2={660} y1={row * 36} y2={row * 36} stroke="var(--border)" strokeDasharray="3 4" />
          ))}
          {bars.map((bar, index) => (
            <g key={index} transform={`translate(${index * 118 + 24},0)`}>
              <line x1={0} x2={0} y1={168} y2={bar} stroke="var(--border)" strokeWidth="2" />
              <circle cx={0} cy={bar} r="8" fill={colors[index % colors.length]}>
                <animate attributeName="r" values="5;9;5" dur={`${1.2 + index * 0.12}s`} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.45;1;0.45" dur={`${1.2 + index * 0.12}s`} repeatCount="indefinite" />
              </circle>
            </g>
          ))}
        </g>
      </svg>
    );
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full min-h-64 w-full overflow-visible">
      <g transform="translate(38,18)">
        {[0, 1, 2, 3].map((row) => (
          <line key={row} x1={0} x2={660} y1={row * 52} y2={row * 52} stroke="var(--border)" strokeDasharray="3 4" />
        ))}
        {bars.map((bar, index) => {
          const x = index * 103 + 20;
          const targetHeight = 210 - bar;
          return (
            <rect key={index} x={x} y={bar} width="54" height={targetHeight} rx="7" fill={colors[index]} opacity="0.78">
              <animate attributeName="height" values={`8;${targetHeight};8`} dur={`${1.4 + index * 0.12}s`} repeatCount="indefinite" />
              <animate attributeName="y" values={`210;${bar};210`} dur={`${1.4 + index * 0.12}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.35;0.9;0.35" dur={`${1.4 + index * 0.12}s`} repeatCount="indefinite" />
            </rect>
          );
        })}
      </g>
    </svg>
  );
}

function DashboardLoading() {
  const statPlaceholders = [0, 1, 2, 3, 4, 5];

  return (
    <div className="page-container">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="h-9 w-72 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-muted" />
        </div>
        <div className="surface-card flex flex-wrap items-end gap-3 p-3">
          <div className="h-16 w-56 animate-pulse rounded-md bg-muted" />
          <div className="h-16 w-56 animate-pulse rounded-md bg-muted" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {statPlaceholders.map((item) => (
          <div key={item} className="surface-card p-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 animate-pulse rounded-md bg-muted" />
              <div className="flex-1">
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                <div className="mt-3 h-7 w-14 animate-pulse rounded bg-muted" />
                <div className="mt-3 h-3 w-28 animate-pulse rounded bg-muted" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="surface-card p-5">
          <div className="mb-4 h-5 w-48 animate-pulse rounded bg-muted" />
          <LoadingChart />
        </section>
        <section className="surface-card p-5">
          <div className="mb-4 h-5 w-48 animate-pulse rounded bg-muted" />
          <LoadingChart variant="donut" />
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1fr]">
        <section className="surface-card p-5">
          <div className="mb-4 h-5 w-44 animate-pulse rounded bg-muted" />
          <LoadingChart />
        </section>
        <section className="surface-card p-5">
          <div className="mb-4 h-5 w-44 animate-pulse rounded bg-muted" />
          <LoadingChart variant="line" />
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="surface-card p-5">
          <div className="mb-4 h-5 w-48 animate-pulse rounded bg-muted" />
          <LoadingChart variant="capacity" />
        </section>
        <section className="surface-card p-5">
          <div className="mb-4 h-5 w-48 animate-pulse rounded bg-muted" />
          <LoadingChart variant="score" />
        </section>
      </div>
    </div>
  );
}

function VerticalBars({ data, emptyLabel }: { data: BarDatum[]; emptyLabel: string }) {
  const firstActiveKey = data.find((item) => item.value > 0)?.key ?? data[0]?.key ?? "";
  const [activeKey, setActiveKey] = useState(firstActiveKey);
  const width = 720;
  const height = 280;
  const margin = { top: 18, right: 18, bottom: 52, left: 38 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const maxValue = d3.max(data, (item) => item.value) ?? 0;
  const ticks = integerTicks(maxValue);
  const x = d3
    .scaleBand()
    .domain(data.map((item) => item.key))
    .range([0, chartWidth])
    .padding(0.28);
  const y = d3
    .scaleLinear()
    .domain([0, Math.max(1, d3.max(ticks) ?? 1)])
    .nice()
    .range([chartHeight, 0]);
  const activeDatum = data.find((item) => item.key === activeKey) ?? data.find((item) => item.value > 0) ?? data[0];

  if (!data.some((item) => item.value > 0)) return <EmptyChart label={emptyLabel} />;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full min-h-64 w-full overflow-visible">
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
            const barX = x(item.key) ?? 0;
            const barHeight = chartHeight - y(item.value);
            const isActive = activeDatum?.key === item.key;
            return (
              <g
                key={item.key}
                tabIndex={0}
                role="button"
                aria-label={`${item.label}: ${item.value}`}
                className="cursor-pointer outline-none"
                onMouseEnter={() => setActiveKey(item.key)}
                onFocus={() => setActiveKey(item.key)}
              >
                <rect
                  x={barX}
                  y={y(item.value)}
                  width={x.bandwidth()}
                  height={Math.max(0, barHeight)}
                  rx={6}
                  fill={item.color}
                  opacity={isActive ? 0.98 : 0.42}
                  stroke={isActive ? "var(--foreground)" : "transparent"}
                  strokeWidth={isActive ? 2 : 0}
                  className="transition-opacity"
                >
                  <title>{`${item.label}: ${item.value}`}</title>
                </rect>
                <text
                  x={barX + x.bandwidth() / 2}
                  y={y(item.value) - 8}
                  textAnchor="middle"
                  className="pointer-events-none fill-foreground text-[12px] font-semibold"
                >
                  {item.value}
                </text>
                <text
                  x={barX + x.bandwidth() / 2}
                  y={chartHeight + 24}
                  textAnchor="middle"
                  className="pointer-events-none fill-muted-foreground text-[11px]"
                >
                  {shortLabel(item.label, 13)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      {activeDatum ? (
        <ChartInsight
          label={activeDatum.label}
          value={activeDatum.value}
          detail="Premakni miško ali uporabi tab za pregled posameznih stolpcev."
          color={activeDatum.color}
        />
      ) : null}
    </div>
  );
}

function DonutChart({ data, emptyLabel }: { data: BarDatum[]; emptyLabel: string }) {
  const firstActiveKey = data.find((item) => item.value > 0)?.key ?? data[0]?.key ?? "";
  const [activeKey, setActiveKey] = useState(firstActiveKey);
  const width = 360;
  const height = 280;
  const total = d3.sum(data, (item) => item.value);
  const pie = d3
    .pie<BarDatum>()
    .value((item) => item.value)
    .sort(null);
  const arc = d3.arc<d3.PieArcDatum<BarDatum>>().innerRadius(72).outerRadius(108).cornerRadius(8);
  const activeDatum = data.find((item) => item.key === activeKey) ?? data.find((item) => item.value > 0) ?? data[0];

  if (!total) return <EmptyChart label={emptyLabel} />;

  return (
    <div>
      <div className="grid h-full min-h-64 gap-3 md:grid-cols-[minmax(0,1fr)_10rem] md:items-center">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-full min-h-56 w-full">
          <g transform={`translate(${width / 2},${height / 2})`}>
            {pie(data).map((slice) => {
              const isActive = activeDatum?.key === slice.data.key;
              return (
                <path
                  key={slice.data.key}
                  d={arc(slice) ?? ""}
                  fill={slice.data.color}
                  opacity={isActive ? 1 : 0.36}
                  stroke={isActive ? "var(--foreground)" : "var(--background)"}
                  strokeWidth={isActive ? 3 : 2}
                  className="cursor-pointer outline-none transition-opacity"
                  tabIndex={0}
                  role="button"
                  aria-label={`${slice.data.label}: ${slice.data.value}`}
                  onMouseEnter={() => setActiveKey(slice.data.key)}
                  onFocus={() => setActiveKey(slice.data.key)}
                >
                  <title>{`${slice.data.label}: ${slice.data.value}`}</title>
                </path>
              );
            })}
            <text textAnchor="middle" y={-4} className="pointer-events-none fill-foreground text-3xl font-semibold">
              {activeDatum?.value ?? total}
            </text>
            <text textAnchor="middle" y={20} className="pointer-events-none fill-muted-foreground text-[12px]">
              {activeDatum ? shortLabel(activeDatum.label, 15) : "total"}
            </text>
          </g>
        </svg>
        <div className="grid content-center gap-2">
          {data.map((item) => {
            const isActive = activeDatum?.key === item.key;
            return (
              <button
                key={item.key}
                type="button"
                className={`flex items-center justify-between gap-3 rounded px-2 py-1 text-left text-sm outline-none transition-colors ${
                  isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"
                }`}
                onMouseEnter={() => setActiveKey(item.key)}
                onFocus={() => setActiveKey(item.key)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="truncate">{item.label}</span>
                </span>
                <span className="font-semibold text-foreground">{item.value}</span>
              </button>
            );
          })}
        </div>
      </div>
      {activeDatum ? (
        <ChartInsight
          label={activeDatum.label}
          value={`${Math.round((activeDatum.value / Math.max(1, total)) * 100)}%`}
          detail={`${activeDatum.value} od ${total} kandidatov v izbranem pogledu.`}
          color={activeDatum.color}
        />
      ) : null}
    </div>
  );
}

function TrendLines({ data, emptyLabel }: { data: TrendDatum[]; emptyLabel: string }) {
  const firstActiveKey = data.find((item) => item.offers || item.sent)?.key ?? data[0]?.key ?? "";
  const [activeKey, setActiveKey] = useState(firstActiveKey);
  const width = 780;
  const height = 280;
  const margin = { top: 18, right: 20, bottom: 44, left: 38 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const maxValue = d3.max(data, (item) => Math.max(item.offers, item.sent)) ?? 0;
  const ticks = integerTicks(maxValue);
  const x = d3
    .scalePoint()
    .domain(data.map((item) => item.key))
    .range([0, chartWidth])
    .padding(0.4);
  const y = d3
    .scaleLinear()
    .domain([0, Math.max(1, d3.max(ticks) ?? 1)])
    .range([chartHeight, 0]);
  const lineOffers = d3
    .line<TrendDatum>()
    .x((item) => x(item.key) ?? 0)
    .y((item) => y(item.offers))
    .curve(d3.curveMonotoneX);
  const lineSent = d3
    .line<TrendDatum>()
    .x((item) => x(item.key) ?? 0)
    .y((item) => y(item.sent))
    .curve(d3.curveMonotoneX);
  const activeDatum = data.find((item) => item.key === activeKey) ?? data.find((item) => item.offers || item.sent) ?? data[0];
  const activeX = activeDatum ? x(activeDatum.key) ?? 0 : 0;

  if (!data.some((item) => item.offers || item.sent)) return <EmptyChart label={emptyLabel} />;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full min-h-64 w-full overflow-visible">
        <g transform={`translate(${margin.left},${margin.top})`}>
          {ticks.map((tick) => (
            <g key={tick} transform={`translate(0,${y(tick)})`}>
              <line x1={0} x2={chartWidth} stroke="var(--border)" strokeDasharray="3 4" />
              <text x={-10} y={4} textAnchor="end" className="fill-muted-foreground text-[11px]">
                {tick}
              </text>
            </g>
          ))}
          {activeDatum ? (
            <line x1={activeX} x2={activeX} y1={0} y2={chartHeight} stroke="var(--foreground)" strokeDasharray="4 5" opacity="0.34" />
          ) : null}
          <path d={lineOffers(data) ?? ""} fill="none" stroke="#8b5cf6" strokeWidth={3} />
          <path d={lineSent(data) ?? ""} fill="none" stroke="#22c55e" strokeWidth={3} />
          {data.map((item, index) => {
            const itemX = x(item.key) ?? 0;
            const isActive = activeDatum?.key === item.key;
            return (
              <g
                key={item.key}
                tabIndex={0}
                role="button"
                aria-label={`${item.label}: ${item.offers} ustvarjenih, ${item.sent} poslanih`}
                className="cursor-pointer outline-none"
                onMouseEnter={() => setActiveKey(item.key)}
                onFocus={() => setActiveKey(item.key)}
              >
                <rect x={itemX - 18} y={0} width={36} height={chartHeight} fill="transparent" />
                <circle cx={itemX} cy={y(item.offers)} r={isActive ? 6 : 3.5} fill="#8b5cf6">
                  <title>{`${item.label}: ${item.offers} ustvarjenih ponudb`}</title>
                </circle>
                <circle cx={itemX} cy={y(item.sent)} r={isActive ? 6 : 3.5} fill="#22c55e">
                  <title>{`${item.label}: ${item.sent} poslanih ponudb`}</title>
                </circle>
                {index % 2 === 0 ? (
                  <text
                    x={itemX}
                    y={chartHeight + 24}
                    textAnchor="middle"
                    className="pointer-events-none fill-muted-foreground text-[11px]"
                  >
                    {item.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>
      {activeDatum ? (
        <ChartInsight
          label={activeDatum.label}
          value={`${activeDatum.sent}/${activeDatum.offers}`}
          detail="Poslane ponudbe / pripravljene ponudbe za izbrani dan."
          color="#22c55e"
        />
      ) : null}
    </div>
  );
}

function JobCapacityChart({ data, emptyLabel }: { data: JobCapacityDatum[]; emptyLabel: string }) {
  const chartData = data.slice(0, 8);
  const [activeId, setActiveId] = useState(chartData[0]?.id ?? "");
  const width = 780;
  const rowHeight = 36;
  const height = Math.max(220, chartData.length * rowHeight + 62);
  const margin = { top: 18, right: 80, bottom: 28, left: 160 };
  const chartWidth = width - margin.left - margin.right;
  const maxValue = d3.max(chartData, (item) => Math.max(item.openings, item.accepted)) ?? 0;
  const ticks = integerTicks(maxValue);
  const x = d3
    .scaleLinear()
    .domain([0, Math.max(1, d3.max(ticks) ?? 1)])
    .range([0, chartWidth]);
  const y = d3
    .scaleBand()
    .domain(chartData.map((item) => item.id))
    .range([0, chartData.length * rowHeight])
    .padding(0.32);
  const activeDatum = chartData.find((item) => item.id === activeId) ?? chartData[0];

  if (!chartData.length) return <EmptyChart label={emptyLabel} />;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full min-h-64 w-full overflow-visible">
        <g transform={`translate(${margin.left},${margin.top})`}>
          {ticks.map((tick) => (
            <g key={tick} transform={`translate(${x(tick)},0)`}>
              <line y1={0} y2={chartData.length * rowHeight} stroke="var(--border)" strokeDasharray="3 4" />
              <text y={chartData.length * rowHeight + 22} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                {tick}
              </text>
            </g>
          ))}
          {chartData.map((item) => {
            const rowY = y(item.id) ?? 0;
            const isActive = activeDatum?.id === item.id;
            const fill = item.status === "inactive" ? "#64748b" : "#14b8a6";
            return (
              <g
                key={item.id}
                tabIndex={0}
                role="button"
                aria-label={`${item.title}: ${item.accepted} od ${item.openings}`}
                className="cursor-pointer outline-none"
                onMouseEnter={() => setActiveId(item.id)}
                onFocus={() => setActiveId(item.id)}
              >
                <rect x={-margin.left + 8} y={rowY - 5} width={width - margin.right - 8} height={y.bandwidth() + 10} rx={7} fill={isActive ? "var(--muted)" : "transparent"} opacity="0.55" />
                <text x={-12} y={rowY + y.bandwidth() / 2 + 4} textAnchor="end" className="pointer-events-none fill-foreground text-[12px] font-medium">
                  {shortLabel(item.title, 22)}
                </text>
                <rect x={0} y={rowY} width={x(item.openings)} height={y.bandwidth()} rx={5} fill="var(--muted)" />
                <rect
                  x={0}
                  y={rowY}
                  width={x(item.accepted)}
                  height={y.bandwidth()}
                  rx={5}
                  fill={fill}
                  opacity={isActive ? 1 : 0.48}
                  stroke={isActive ? "var(--foreground)" : "transparent"}
                  strokeWidth={isActive ? 1.5 : 0}
                >
                  <title>{`${item.title}: ${item.accepted}/${item.openings}`}</title>
                </rect>
                <text x={x(Math.max(item.openings, item.accepted)) + 8} y={rowY + y.bandwidth() / 2 + 4} className="pointer-events-none fill-muted-foreground text-[11px]">
                  {item.accepted}/{item.openings}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      {activeDatum ? (
        <ChartInsight
          label={activeDatum.title}
          value={`${activeDatum.accepted}/${activeDatum.openings}`}
          detail={`${activeDatum.applicants} kandidatov, status: ${activeDatum.status === "inactive" ? "neaktivno" : "aktivno"}.`}
          color={activeDatum.status === "inactive" ? "#64748b" : "#14b8a6"}
        />
      ) : null}
    </div>
  );
}

function CandidateScoreStrip({ data, emptyLabel }: { data: DashboardApplicant[]; emptyLabel: string }) {
  const chartData = data
    .filter((item) => typeof item.aiScore === "number")
    .sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0))
    .slice(0, 12);
  const [activeId, setActiveId] = useState(chartData[0]?.id ?? "");
  const width = 780;
  const height = 230;
  const margin = { top: 18, right: 18, bottom: 58, left: 38 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const x = d3
    .scalePoint()
    .domain(chartData.map((item) => item.id))
    .range([0, chartWidth])
    .padding(0.5);
  const y = d3.scaleLinear().domain([0, 100]).range([chartHeight, 0]);
  const activeDatum = chartData.find((item) => item.id === activeId) ?? chartData[0];

  if (!chartData.length) return <EmptyChart label={emptyLabel} />;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full min-h-56 w-full overflow-visible">
        <g transform={`translate(${margin.left},${margin.top})`}>
          {[0, 25, 50, 75, 100].map((tick) => (
            <g key={tick} transform={`translate(0,${y(tick)})`}>
              <line x1={0} x2={chartWidth} stroke="var(--border)" strokeDasharray="3 4" />
              <text x={-10} y={4} textAnchor="end" className="fill-muted-foreground text-[11px]">
                {tick}
              </text>
            </g>
          ))}
          {chartData.map((item) => {
            const itemX = x(item.id) ?? 0;
            const isActive = activeDatum?.id === item.id;
            return (
              <g
                key={item.id}
                tabIndex={0}
                role="button"
                aria-label={`${item.name}: ${Math.round(item.aiScore ?? 0)}%`}
                className="cursor-pointer outline-none"
                onMouseEnter={() => setActiveId(item.id)}
                onFocus={() => setActiveId(item.id)}
              >
                <rect x={itemX - 20} y={0} width={40} height={chartHeight + 36} fill="transparent" />
                <line
                  x1={itemX}
                  x2={itemX}
                  y1={chartHeight}
                  y2={y(item.aiScore ?? 0)}
                  stroke={isActive ? "var(--foreground)" : "var(--border)"}
                  strokeWidth={isActive ? 2.5 : 2}
                  opacity={isActive ? 0.65 : 1}
                />
                <circle
                  cx={itemX}
                  cy={y(item.aiScore ?? 0)}
                  r={isActive ? 10 : 7}
                  fill={stageColors[item.stage]}
                  stroke={isActive ? "var(--foreground)" : "transparent"}
                  strokeWidth={isActive ? 2 : 0}
                  opacity={isActive ? 1 : 0.5}
                >
                  <title>{`${item.name}: ${Math.round(item.aiScore ?? 0)}%`}</title>
                </circle>
                <text x={itemX} y={y(item.aiScore ?? 0) - 12} textAnchor="middle" className="pointer-events-none fill-foreground text-[11px] font-semibold">
                  {Math.round(item.aiScore ?? 0)}
                </text>
                <text x={itemX} y={chartHeight + 24} textAnchor="middle" className="pointer-events-none fill-muted-foreground text-[10px]">
                  {shortLabel(item.name.split(" ")[0] || item.name, 8)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      {activeDatum ? (
        <ChartInsight
          label={activeDatum.name}
          value={`${Math.round(activeDatum.aiScore ?? 0)}%`}
          detail={`${activeDatum.role} - ${activeDatum.stage}`}
          color={stageColors[activeDatum.stage]}
        />
      ) : null}
    </div>
  );
}

export default function Dashboard() {
  const { t, stageLabel } = useI18n();
  const cachedDashboard = getDashboardCache();
  const [applicants, setApplicants] = useState<DashboardApplicant[]>(
    (cachedDashboard?.applicants ?? []) as DashboardApplicant[],
  );
  const [jobs, setJobs] = useState<DashboardJob[]>(cachedDashboard?.jobs ?? []);
  const [isLoading, setIsLoading] = useState(!hasFreshDashboardCache());
  const [jobFilter, setJobFilter] = useState("all");
  const [candidateFilter, setCandidateFilter] = useState("all");

  useEffect(() => {
    let isMounted = true;

    const loadDashboard = async () => {
      const cached = getDashboardCache();
      if (hasFreshDashboardCache() && cached) {
        setApplicants(cached.applicants as DashboardApplicant[]);
        setJobs(cached.jobs);
        setIsLoading(false);
        return;
      }

      if (!cached) {
        setIsLoading(true);
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        if (isMounted) {
          setApplicants([]);
          setJobs([]);
          setIsLoading(false);
        }
        return;
      }

      const existingRequest = getDashboardRequest();
      const dashboardRequest =
        existingRequest ??
        (async () => {
          const [candidateResult, jobResult] = await Promise.all([
            supabase.from("candidates").select(dashboardCandidateSelectWithOffer).order("created_at", { ascending: false }),
            supabase.from("jobs").select("id, title, status, openings, created_at").order("created_at", { ascending: false }),
          ]);

          let candidateRows = candidateResult.data as Array<Record<string, unknown>> | null;
          let candidateError = candidateResult.error;

          if (
            candidateError &&
            (candidateError.message?.includes("offer_") || candidateError.details?.includes("offer_"))
          ) {
            const retry = await supabase
              .from("candidates")
              .select(dashboardCandidateSelectWithAiWriting)
              .order("created_at", { ascending: false });

            candidateRows = retry.data as Array<Record<string, unknown>> | null;
            candidateError = retry.error;
          }

          if (
            candidateError &&
            (candidateError.message?.includes("ai_writing") || candidateError.details?.includes("ai_writing"))
          ) {
            const retry = await supabase
              .from("candidates")
              .select(dashboardCandidateSelect)
              .order("created_at", { ascending: false });

            candidateRows = retry.data as Array<Record<string, unknown>> | null;
            candidateError = retry.error;
          }

          if (candidateError || jobResult.error) {
            throw candidateError ?? jobResult.error;
          }

          const mappedApplicants = dedupeCandidateRows(candidateRows ?? []).map((row) => ({
            id: row.id,
            name: row.full_name,
            role: row.job_title,
            stage: (row.stage as Stage) ?? "Applied",
            analysisStatus: (row.analysis_status as DashboardApplicant["analysisStatus"]) ?? null,
            aiScore: typeof row.ats_score === "number" ? row.ats_score : null,
            skills: row.skills ?? [],
            experience: Number(row.years_experience ?? 0),
            location: row.location ?? "",
            avatar: row.resume_preview_url ?? "",
            email: row.email ?? "",
            phone: "",
            summary: row.analysis_summary ?? "",
            createdAt: row.created_at ?? null,
            aiWritingScore: row.ai_writing_score == null ? null : Number(row.ai_writing_score),
            offerOutcome: (row.offer_outcome as string | null | undefined) ?? null,
            offerChecklist: row.offer_checklist
              ? {
                  offerSent: Boolean((row.offer_checklist as Record<string, boolean>).offerSent),
                }
              : undefined,
            offerSentAt: (row.offer_sent_at as string | null | undefined) ?? null,
            matchAnalysis: {
              pros: row.analysis_strengths ?? [],
              cons: row.analysis_concerns ?? [],
            },
          })) as DashboardApplicant[];

          const mappedJobs = ((jobResult.data ?? []) as Array<Record<string, unknown>>).map((job) => ({
            id: job.id as string,
            title: job.title as string,
            status: (job.status as string | null | undefined) ?? "active",
            openings: Math.max(1, Number(job.openings ?? 1)),
            createdAt: (job.created_at as string | null | undefined) ?? null,
          }));

          setDashboardCache(mappedApplicants, mappedJobs);
          return { applicants: mappedApplicants, jobs: mappedJobs, loadedAt: Date.now() };
        })();

      if (!existingRequest) {
        setDashboardRequest(dashboardRequest);
      }

      try {
        const nextDashboard = await dashboardRequest;
        if (!isMounted) return;
        setApplicants(nextDashboard.applicants as DashboardApplicant[]);
        setJobs(nextDashboard.jobs);
        setIsLoading(false);
      } catch (_error) {
        if (!isMounted) return;
        setApplicants([]);
        setJobs([]);
        setIsLoading(false);
      } finally {
        if (!existingRequest) {
          setDashboardRequest(null);
        }
      }
    };

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  const jobOptions = useMemo(
    () => [...new Set(applicants.map((applicant) => applicant.role))].sort(),
    [applicants],
  );

  const candidateOptions = useMemo(
    () =>
      applicants
        .map((applicant) => ({
          id: applicant.id,
          name: applicant.name,
          score: Math.round(applicant.aiScore ?? 0),
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [applicants],
  );

  const filteredApplicants = useMemo(
    () =>
      applicants.filter(
        (applicant) =>
          (jobFilter === "all" || applicant.role === jobFilter) &&
          (candidateFilter === "all" || applicant.id === candidateFilter),
      ),
    [applicants, candidateFilter, jobFilter],
  );

  const filteredJobs = useMemo(
    () => jobs.filter((job) => jobFilter === "all" || job.title === jobFilter),
    [jobs, jobFilter],
  );

  const totalApplicants = filteredApplicants.length;
  const activeJobs = filteredJobs.filter((job) => (job.status ?? "active") === "active").length;
  const scoredApplicants = filteredApplicants.filter(
    (applicant) => typeof applicant.aiScore === "number",
  );
  const avgScore = scoredApplicants.length
    ? Math.round(d3.mean(scoredApplicants, (applicant) => applicant.aiScore ?? 0) ?? 0)
    : 0;
  const candidatesNeedingReview = filteredApplicants.filter((applicant) =>
    ["Applied", "Screening"].includes(applicant.stage),
  ).length;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newApplicantsThisWeek = filteredApplicants.filter((applicant) => {
    if (!applicant.createdAt) return false;
    return new Date(applicant.createdAt).getTime() >= sevenDaysAgo;
  }).length;
  const offerRelatedApplicants = filteredApplicants.filter((applicant) =>
    ["Offer", "Accepted", "Rejected"].includes(applicant.stage),
  );
  const sentOffersCount = offerRelatedApplicants.filter(
    (applicant) => applicant.offerChecklist?.offerSent,
  ).length;

  const stageData = useMemo<BarDatum[]>(
    () =>
      stageOrder.map((stage) => ({
        key: stage,
        label: stageLabel(stage),
        value: filteredApplicants.filter((applicant) => applicant.stage === stage).length,
        color: stageColors[stage],
      })),
    [filteredApplicants, stageLabel],
  );

  const offerStatusData = useMemo<BarDatum[]>(
    () => [
      {
        key: "preparing",
        label: t("offerStatusPreparing"),
        value: filteredApplicants.filter(
          (applicant) => applicant.stage === "Offer" && !applicant.offerChecklist?.offerSent,
        ).length,
        color: "#f59e0b",
      },
      {
        key: "sent",
        label: t("offerStatusSent"),
        value: filteredApplicants.filter(
          (applicant) =>
            applicant.offerChecklist?.offerSent &&
            (applicant.offerOutcome ?? "pending") === "pending",
        ).length,
        color: "#22c55e",
      },
      {
        key: "accepted",
        label: t("offerOutcomeAccepted"),
        value: filteredApplicants.filter((applicant) => applicant.offerOutcome === "accepted").length,
        color: "#14b8a6",
      },
      {
        key: "declined",
        label: t("offerOutcomeDeclined"),
        value: filteredApplicants.filter((applicant) => applicant.offerOutcome === "declined").length,
        color: "#ef4444",
      },
    ],
    [filteredApplicants, t],
  );

  const offerTrendData = useMemo<TrendDatum[]>(() => {
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

    offerRelatedApplicants.forEach((applicant) => {
      if (applicant.createdAt) {
        const day = byKey.get(new Date(applicant.createdAt).toISOString().slice(0, 10));
        if (day) day.offers += 1;
      }

      if (applicant.offerSentAt) {
        const day = byKey.get(new Date(applicant.offerSentAt).toISOString().slice(0, 10));
        if (day) day.sent += 1;
      }
    });

    return days;
  }, [offerRelatedApplicants]);

  const jobCapacityData = useMemo<JobCapacityDatum[]>(
    () =>
      filteredJobs.map((job) => {
        const jobApplicants = applicants.filter((applicant) => applicant.role === job.title);
        return {
          id: job.id,
          title: job.title,
          status: job.status ?? "active",
          openings: job.openings,
          accepted: jobApplicants.filter((applicant) => applicant.stage === "Accepted").length,
          applicants: jobApplicants.length,
        };
      }),
    [applicants, filteredJobs],
  );

  const recentApplicants = [...filteredApplicants]
    .sort((a, b) => (b.aiScore ?? -1) - (a.aiScore ?? -1))
    .slice(0, 3);

  const stats = [
    { label: t("totalApplicants"), value: totalApplicants, detail: t("allCandidates"), icon: Users, tone: "text-sky-600 dark:text-sky-300" },
    { label: t("activeJobs"), value: activeJobs, detail: t("openRoles"), icon: Briefcase, tone: "text-violet-600 dark:text-violet-300" },
    { label: t("averageMatchScore"), value: `${avgScore}%`, detail: t("acrossCandidates"), icon: TrendingUp, tone: "text-emerald-600 dark:text-emerald-300" },
    { label: t("needReview"), value: candidatesNeedingReview, detail: t("appliedScreening"), icon: AlertCircle, tone: "text-amber-600 dark:text-amber-300" },
    { label: t("newThisWeek"), value: newApplicantsThisWeek, detail: t("lastSevenDays"), icon: CalendarDays, tone: "text-cyan-600 dark:text-cyan-300" },
    { label: t("sentOffers"), value: sentOffersCount, detail: t("offersSentDetail"), icon: Send, tone: "text-emerald-600 dark:text-emerald-300" },
  ];

  if (isLoading) {
    return <DashboardLoading />;
  }

  return (
    <div className="page-container">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="page-title">{t("dashboardOverview")}</h1>
          <p className="text-sm subtle-text">{t("dashboardSubtitle")}</p>
        </div>
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
          <div className="grid min-w-[220px] gap-1.5">
            <Label>{t("candidate")}</Label>
            <Select value={candidateFilter} onValueChange={setCandidateFilter}>
              <SelectTrigger className="h-10 border-border bg-background shadow-sm dark:bg-muted/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allCandidates")}</SelectItem>
                {candidateOptions.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.name} - {candidate.score}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {stats.map((stat) => (
          <div key={stat.label} className="surface-card overflow-hidden p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-start gap-3">
              <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center ${stat.tone}`}>
                <stat.icon className="h-5 w-5 stroke-[2.25]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium uppercase tracking-wide subtle-text">{stat.label}</div>
                <div className="mt-1 text-2xl font-semibold text-foreground">{stat.value}</div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{stat.detail}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="surface-card p-5">
          <h2 className="mb-1 text-base font-semibold text-foreground">{t("applicantPipeline")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("distributionByStage")}</p>
          <VerticalBars data={stageData} emptyLabel={t("noApplicants")} />
        </section>

        <section className="surface-card p-5">
          <h2 className="mb-1 text-base font-semibold text-foreground">{t("distributionByStage")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("applicantsSubtitle")}</p>
          <DonutChart data={stageData} emptyLabel={t("noApplicants")} />
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1fr]">
        <section className="surface-card p-5">
          <h2 className="mb-1 text-base font-semibold text-foreground">{t("offerStatusOverview")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("offerStatusOverviewSubtitle")}</p>
          <VerticalBars data={offerStatusData} emptyLabel={t("noOfferCandidates")} />
        </section>

        <section className="surface-card p-5">
          <h2 className="mb-1 text-base font-semibold text-foreground">{t("offerTracking")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("offerTrackingSubtitle")}</p>
          <TrendLines data={offerTrendData} emptyLabel={t("noOfferCandidates")} />
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-violet-500" />{t("offersCreated")}</span>
            <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" />{t("offersSent")}</span>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="surface-card p-5">
          <h2 className="mb-1 text-base font-semibold text-foreground">{t("activeJobPostings")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("jobsSubtitle")}</p>
          <JobCapacityChart data={jobCapacityData} emptyLabel={t("noJobs")} />
        </section>

        <section className="surface-card p-5">
          <h2 className="mb-1 text-base font-semibold text-foreground">{t("topCandidateMatches")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("topCandidateMatchesSubtitle")}</p>
          <CandidateScoreStrip data={filteredApplicants} emptyLabel={t("noApplicants")} />
        </section>
      </div>

      <section className="surface-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">{t("topCandidateMatches")}</h2>
            <p className="text-sm text-muted-foreground">{t("topCandidateMatchesSubtitle")}</p>
          </div>
          <Link to="/applicants" className="text-sm font-medium text-foreground underline-offset-4 hover:underline">
            {t("viewAll")}
          </Link>
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
                <span className="text-lg font-semibold text-emerald-500">
                  {typeof applicant.aiScore === "number"
                    ? `${Math.round(applicant.aiScore)}%`
                    : t("notScored")}
                </span>
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
          {!recentApplicants.length ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {t("noApplicants")}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
