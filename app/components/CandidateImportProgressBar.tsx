import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, UploadCloud, XCircle, X } from "lucide-react";
import {
  candidateImportProgressEvent,
  dismissCandidateImportProgress,
  getCandidateImportProgress,
  type CandidateImportProgress,
} from "../lib/importProgress";

export function CandidateImportProgressBar() {
  const [progress, setProgress] = useState<CandidateImportProgress | null>(null);

  useEffect(() => {
    const syncProgress = () => setProgress(getCandidateImportProgress());
    syncProgress();

    window.addEventListener(candidateImportProgressEvent, syncProgress);
    return () => {
      window.removeEventListener(candidateImportProgressEvent, syncProgress);
    };
  }, []);

  const percentage = useMemo(() => {
    if (!progress?.total) return 0;
    return Math.min(100, Math.round((progress.completed / progress.total) * 100));
  }, [progress]);

  if (!progress) return null;

  const isRunning = progress.status === "running";
  const isFailed = progress.status === "failed";

  return (
    <div className="pointer-events-none fixed left-1/2 top-20 z-[60] w-[min(480px,calc(100vw-1.5rem))] -translate-x-1/2">
      <div className="pointer-events-auto overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-xl">
        <div className="flex items-start gap-3 px-3 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isFailed ? (
              <XCircle className="h-4 w-4 text-red-500" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <UploadCloud className="h-4 w-4 text-muted-foreground" />
              <p className="truncate text-sm font-semibold">
                Uvoz kandidatov
              </p>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {percentage}%
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {progress.message}
              {progress.currentLabel ? ` · ${progress.currentLabel}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {progress.completed}/{progress.total} končano
              {progress.queued ? ` · ${progress.queued} v AI čakalni vrsti` : ""}
              {progress.failed ? ` · ${progress.failed} neuspešno` : ""}
            </p>
          </div>
          {!isRunning ? (
            <button
              type="button"
              className="rounded-sm p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              onClick={dismissCandidateImportProgress}
              aria-label="Zapri progress"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="h-1 bg-muted">
          <div
            className={`h-full transition-all duration-500 ${
              isFailed ? "bg-red-500" : "bg-primary"
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}
