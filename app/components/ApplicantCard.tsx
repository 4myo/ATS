import { Link } from 'react-router';
import { MoreHorizontal, MapPin, Briefcase, Trash2 } from 'lucide-react';
import type { Applicant } from '../store';
import { ScoreRing } from './ScoreRing';
import { clsx } from 'clsx';

interface ApplicantCardProps {
  applicant: Applicant;
  onDelete?: (id: string) => void;
}

export function ApplicantCard({ applicant, onDelete }: ApplicantCardProps) {
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
    Applied: 'bg-blue-100 text-blue-800',
    Screening: 'bg-purple-100 text-purple-800',
    Interview: 'bg-amber-100 text-amber-800',
    Offer: 'bg-emerald-100 text-emerald-800',
    Rejected: 'bg-red-100 text-red-800',
  };

  const initials = applicant.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="group relative flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:border-indigo-200">
      <div className="flex justify-between items-start">
        <div className="flex items-center space-x-4">
          {safeAvatar ? (
            <img
              src={safeAvatar}
              alt={applicant.name}
              className="h-12 w-12 rounded-full object-cover ring-2 ring-white"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600 ring-2 ring-white">
              {initials}
            </div>
          )}
          <div>
            <h3 className="text-base font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
              <Link to={`/applicants/${applicant.id}`}>
                <span className="absolute inset-0" />
                {applicant.name}
              </Link>
            </h3>
            <p className="text-sm text-slate-500">{applicant.role}</p>
          </div>
        </div>
        <div className="relative z-10 flex items-center gap-1">
          
          <button
            type="button"
            className="p-1 text-slate-400 hover:text-red-600 rounded-full hover:bg-red-50"
            aria-label="Delete applicant"
            onClick={() => onDelete?.(applicant.id)}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex flex-col space-y-1">
          <div className="flex items-center text-xs text-slate-500">
            <MapPin className="mr-1 h-3 w-3" />
            {applicant.location || "Location pending"}
          </div>
          <div className="flex items-center text-xs text-slate-500">
            <Briefcase className="mr-1 h-3 w-3" />
            {applicant.experience ?? 0}y Experience
          </div>
        </div>
        <div className="flex flex-col items-end">
           <span className="text-xs font-medium text-slate-500 mb-1">AI Match</span>
           <ScoreRing score={applicant.aiScore ?? 0} size="sm" />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <span
          className={clsx(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
            stageColors[applicant.stage]
          )}
        >
          {applicant.stage}
        </span>
        <div className="flex -space-x-1 overflow-hidden">
          {applicant.skills.slice(0, 3).map((skill) => (
            <span
              key={skill}
              className="inline-flex items-center justify-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-white"
            >
              {skill}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
