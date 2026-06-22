import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { MapPin, Briefcase, Trash2, Ellipsis, Copy, Link as LinkIcon, ExternalLink } from 'lucide-react';
import type { Applicant } from '../store';
import { clsx } from 'clsx';
import { ScoreChip } from './ScoreChip';
import { useI18n } from '../lib/i18n';
import {
  aiAnalysisQueueEvent,
  isCandidateQueuedForAiAnalysis,
} from '../lib/aiAnalysisQueue';
import { getShortCandidateId } from '../lib/candidateIdentity';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';

interface ApplicantCardProps {
  applicant: Applicant;
  onDelete?: (id: string) => void;
  onMarkNewReviewed?: (id: string) => void;
  returnTo?: string;
}

export function ApplicantCard({ applicant, onDelete, onMarkNewReviewed, returnTo }: ApplicantCardProps) {
  const { stageLabel, t, tt } = useI18n();
  const navigate = useNavigate();
  const [isQueuedForAi, setIsQueuedForAi] = useState(false);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const copyNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNewApplicant = applicant.stage === "Applied";
  const effectiveAnalysisStatus =
    isQueuedForAi && applicant.analysisStatus === "failed"
      ? "pending_ai"
      : applicant.analysisStatus;
  const hasAiScore =
    effectiveAnalysisStatus === "complete" && typeof applicant.aiScore === "number";
  const candidatePath = returnTo
    ? `/applicants/${applicant.id}?returnTo=${encodeURIComponent(returnTo)}`
    : `/applicants/${applicant.id}`;
  // Offer sub-status is a nested state — it only exists once the candidate
  // reaches the "Ponudba" phase, shown as a quieter badge beside the phase.
  const offerSubStatus =
    applicant.stage === "Offer"
      ? applicant.offerChecklist?.offerSent
        ? t("offerStatusSent")
        : t("offerStatusPreparing")
      : null;
  const offerSubStatusDot = applicant.offerChecklist?.offerSent
    ? "bg-sky-500"
    : "bg-amber-500";

  useEffect(() => {
    const syncQueuedState = () => {
      setIsQueuedForAi(isCandidateQueuedForAiAnalysis(applicant.id));
    };

    syncQueuedState();
    window.addEventListener(aiAnalysisQueueEvent, syncQueuedState);
    window.addEventListener("storage", syncQueuedState);

    return () => {
      window.removeEventListener(aiAnalysisQueueEvent, syncQueuedState);
      window.removeEventListener("storage", syncQueuedState);
    };
  }, [applicant.id]);

  useEffect(() => () => {
    if (copyNoticeTimer.current) clearTimeout(copyNoticeTimer.current);
  }, []);

  const copyValue = async (value: string, notice: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyNotice(notice);
    } catch {
      setCopyNotice(tt("Kopiranje ni uspelo"));
    }
    if (copyNoticeTimer.current) clearTimeout(copyNoticeTimer.current);
    copyNoticeTimer.current = setTimeout(() => setCopyNotice(null), 1800);
  };

  const stageColors = {
    Applied: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    Screening: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
    Interview: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    Offer: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    Accepted: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
    Rejected: 'bg-red-500/10 text-red-700 dark:text-red-300',
  };

  const nameParts = applicant.name.trim().split(/\s+/).filter(Boolean);
  const initials =
    nameParts.length > 1
      ? `${nameParts[0][0] ?? ""}${nameParts[nameParts.length - 1][0] ?? ""}`
      : `${nameParts[0]?.[0] ?? ""}${nameParts[0]?.slice(-1) ?? ""}`;

  const avatarTones = [
    "bg-sky-500/15 text-sky-700 ring-sky-500/20 dark:text-sky-300",
    "bg-violet-500/15 text-violet-700 ring-violet-500/20 dark:text-violet-300",
    "bg-emerald-500/15 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300",
    "bg-amber-500/15 text-amber-700 ring-amber-500/20 dark:text-amber-300",
    "bg-rose-500/15 text-rose-700 ring-rose-500/20 dark:text-rose-300",
    "bg-cyan-500/15 text-cyan-700 ring-cyan-500/20 dark:text-cyan-300",
  ];
  const avatarTone =
    avatarTones[
      Array.from(applicant.name).reduce(
        (sum, character) => sum + character.charCodeAt(0),
        0,
      ) % avatarTones.length
    ];

  return (
    <div className="group relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50 focus-within:bg-accent/50 focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring/60">
      {/* Avatar */}
      <div
        className={clsx(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase ring-1",
          avatarTone,
        )}
        aria-hidden="true"
      >
        {initials || "?"}
      </div>

      {/* Name + role + meta */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h3 className="text-sm font-semibold text-foreground">
            <Link
              to={candidatePath}
              state={returnTo ? { returnTo } : undefined}
              className="relative z-10 rounded-sm hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {applicant.name}
            </Link>
          </h3>
          {/* Stage — inline on desktop, below on mobile */}
          <span
            className={clsx(
              "hidden shrink-0 items-center rounded-full px-2 py-px text-xs font-medium sm:inline-flex",
              stageColors[applicant.stage],
            )}
          >
            {stageLabel(applicant.stage)}
          </span>
          {offerSubStatus ? (
            <span className="hidden shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-px text-xs font-medium text-muted-foreground sm:inline-flex">
              <span className={clsx("h-1.5 w-1.5 rounded-full", offerSubStatusDot)} />
              {offerSubStatus}
            </span>
          ) : null}
          {effectiveAnalysisStatus === "pending_ai" ? (
            <span className="hidden items-center rounded-full bg-amber-500/10 px-2 py-px text-xs font-medium text-amber-700 dark:text-amber-300 sm:inline-flex">
              {isQueuedForAi ? tt("Pregled čaka na obdelavo") : tt("Pregled poteka")}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="truncate">{applicant.role}</span>
          {/* Stage on mobile */}
          <span
            className={clsx(
              "inline-flex shrink-0 items-center rounded-full px-2 py-px text-xs font-medium sm:hidden",
              stageColors[applicant.stage],
            )}
          >
            {stageLabel(applicant.stage)}
          </span>
          {offerSubStatus ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-px text-xs font-medium text-muted-foreground sm:hidden">
              <span className={clsx("h-1.5 w-1.5 rounded-full", offerSubStatusDot)} />
              {offerSubStatus}
            </span>
          ) : null}
          {applicant.location ? (
            <span className="hidden items-center gap-0.5 md:flex">
              <MapPin className="h-2.5 w-2.5" />
              {applicant.location}
            </span>
          ) : null}
          {typeof applicant.experience === "number" ? (
            <span className="hidden items-center gap-0.5 lg:flex">
              <Briefcase className="h-2.5 w-2.5" />
              {applicant.experience}y
            </span>
          ) : null}
        </div>
      </div>

      {/* AI score — the visual anchor */}
      <div className="relative z-10 shrink-0">
        {copyNotice ? <span className="mr-2 text-xs font-medium text-emerald-600" aria-live="polite">{copyNotice}</span> : null}
        {effectiveAnalysisStatus === "pending_ai" ? (
          <span className="text-xs text-muted-foreground">…</span>
        ) : (
          <ScoreChip score={hasAiScore ? applicant.aiScore : null} />
        )}
      </div>

      {/* Actions */}
      <div className="relative z-10 flex shrink-0 items-center gap-1">
        {isNewApplicant ? (
          <button
            type="button"
            className="inline-flex items-center rounded-full bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-inset ring-sky-500/20 hover:bg-sky-500/15 dark:text-sky-300"
            onClick={() => onMarkNewReviewed?.(applicant.id)}
          >
            {t("newApplicantBadge")}
          </button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} className="relative z-30 rounded-full p-1.5 text-muted-foreground opacity-70 transition hover:bg-muted hover:text-foreground group-hover:opacity-100" aria-label={tt("Akcije kandidata")}>
              <Ellipsis className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => navigate(candidatePath)}><ExternalLink />{tt("Odpri kandidata")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void copyValue(applicant.id, tt("ID kopiran"))}><Copy />{tt("Kopiraj ID")}<span className="ml-auto font-mono text-[10px] text-muted-foreground">{getShortCandidateId(applicant.id)}</span></DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void copyValue(`${window.location.origin}${candidatePath}`, tt("Povezava kopirana"))}><LinkIcon />{tt("Kopiraj povezavo")}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => onDelete?.(applicant.id)}><Trash2 />{t("deleteApplicant")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
