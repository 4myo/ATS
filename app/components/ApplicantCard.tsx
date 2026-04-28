import { Link } from 'react-router';
import { MapPin, Briefcase, Trash2 } from 'lucide-react';
import type { Applicant } from '../store';
import { ScoreRing } from './ScoreRing';
import { clsx } from 'clsx';
import { useI18n } from '../lib/i18n';

interface ApplicantCardProps {
  applicant: Applicant;
  onDelete?: (id: string) => void;
}

export function ApplicantCard({ applicant, onDelete }: ApplicantCardProps) {
  const { stageLabel, t } = useI18n();
  const isSafeImageUrl = (value?: string) => {
    if (!value) return false;
    if (value.startsWith("blob:")) return false;
    return (
      value.startsWith("data:") ||
      value.startsWith("http://") ||
      value.startsWith("https://") ||
      value.startsWith("/")
    );
  };

  const safeAvatar = isSafeImageUrl(applicant.avatar)
    ? applicant.avatar
    : "";
  const stageColors = {
    Applied: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    Screening: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
    Interview: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    Offer: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    Rejected: 'bg-red-500/10 text-red-700 dark:text-red-300',
  };

  const initials = applicant.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="surface-card group relative flex min-h-[218px] flex-col p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex justify-between items-start">
        <div className="flex items-center space-x-4">
          {safeAvatar ? (
            <img
              src={safeAvatar}
              alt={applicant.name}
              className="h-12 w-12 rounded-full border border-border object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted text-sm font-semibold text-foreground">
              {initials}
            </div>
          )}
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
          
          <button
            type="button"
            className="rounded-full p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
            aria-label="Delete applicant"
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
            {applicant.location || "Location pending"}
          </div>
          <div className="flex items-center text-xs text-muted-foreground">
            <Briefcase className="mr-1 h-3 w-3" />
            {applicant.experience ?? 0}y Experience
          </div>
        </div>
        <div className="flex flex-col items-end">
           <span className="mb-1 text-xs font-medium text-muted-foreground">{t("aiReviewCue")}</span>
           {applicant.analysisStatus === "pending_ai" ? (
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
          {applicant.analysisStatus === "pending_ai" ? (
            <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              {t("aiAnalysisInProgress")}
            </span>
          ) : null}
          {applicant.analysisStatus === "failed" ? (
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
