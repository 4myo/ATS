import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { MapPin, Briefcase, Trash2 } from 'lucide-react';
import type { Applicant } from '../store';
import { ScoreRing } from './ScoreRing';
import { clsx } from 'clsx';
import { useI18n } from '../lib/i18n';
import {
  aiAnalysisQueueEvent,
  isCandidateQueuedForAiAnalysis,
} from '../lib/aiAnalysisQueue';

interface ApplicantCardProps {
  applicant: Applicant;
  onDelete?: (id: string) => void;
  onMarkNewReviewed?: (id: string) => void;
}

export function ApplicantCard({ applicant, onDelete, onMarkNewReviewed }: ApplicantCardProps) {
  const { stageLabel, t } = useI18n();
  const [isQueuedForAi, setIsQueuedForAi] = useState(false);
  const isNewApplicant = applicant.stage === "Applied";
  const effectiveAnalysisStatus =
    isQueuedForAi && applicant.analysisStatus === "failed"
      ? "pending_ai"
      : applicant.analysisStatus;

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
    <div className="surface-card group relative flex min-h-[218px] flex-col p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex justify-between items-start">
        <div className="flex items-center space-x-4">
          <div
            className={clsx(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold uppercase ring-1",
              avatarTone,
            )}
            aria-hidden="true"
          >
            {initials || "?"}
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground transition-colors">
              <Link to={`/applicants/${applicant.id}`}>
                <span className="absolute inset-0" />
                {applicant.name}
              </Link>
            </h3>
            <p className="text-sm text-muted-foreground">{applicant.role}</p>
          </div>
        </div>
        <div className="relative z-10 flex items-center gap-1">
          {isNewApplicant ? (
            <button
              type="button"
              className="inline-flex items-center rounded-full bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-inset ring-sky-500/20 hover:bg-sky-500/15 dark:text-sky-300"
              onClick={() => onMarkNewReviewed?.(applicant.id)}
            >
              {t("newApplicantBadge")}
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-full p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
            aria-label={t("deleteApplicant")}
            onClick={() => onDelete?.(applicant.id)}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex flex-col space-y-1">
          <div className="flex items-center text-xs text-muted-foreground">
            <MapPin className="mr-1 h-3 w-3" />
            {applicant.location || t("locationPending")}
          </div>
          <div className="flex items-center text-xs text-muted-foreground">
            <Briefcase className="mr-1 h-3 w-3" />
            {applicant.experience ?? 0} {t("yearsExperienceLabel")}
          </div>
        </div>
        <div className="flex flex-col items-end">
           <span className="mb-1 text-xs font-medium text-muted-foreground">{t("aiReviewCue")}</span>
           {effectiveAnalysisStatus === "pending_ai" ? (
             <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted text-[10px] font-semibold text-muted-foreground">
               ...
             </span>
           ) : (
             <ScoreRing score={applicant.aiScore ?? 0} size="sm" />
           )}
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
        <div className="flex flex-wrap gap-2">
          <span
            className={clsx(
              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
              stageColors[applicant.stage]
            )}
          >
            {stageLabel(applicant.stage)}
          </span>
          {effectiveAnalysisStatus === "pending_ai" ? (
            <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              {isQueuedForAi ? t("aiAnalysisPending") : t("aiAnalysisInProgress")}
            </span>
          ) : null}
          {effectiveAnalysisStatus === "failed" ? (
            <span className="inline-flex items-center rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">
              {t("aiAnalysisFailed")}
            </span>
          ) : null}
        </div>
        <div className="flex -space-x-1 overflow-hidden">
          {applicant.skills.slice(0, 3).map((skill) => (
            <span
              key={skill}
              className="inline-flex items-center justify-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              {skill}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
