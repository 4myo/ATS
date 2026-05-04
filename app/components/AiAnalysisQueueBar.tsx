import { useEffect, useMemo, useState } from "react";
import { Bot, Clock, Loader2, X } from "lucide-react";
import {
  aiAnalysisQueueEvent,
  getAiAnalysisRetryDelayMs,
  getAiAnalysisQueue,
  processDueAiAnalysisRetries,
  removeAiAnalysisRetry,
  type AiAnalysisQueueItem,
} from "../lib/aiAnalysisQueue";
import { useI18n } from "../lib/i18n";

const formatRemaining = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export function AiAnalysisQueueBar() {
  const { t } = useI18n();
  const [queue, setQueue] = useState<AiAnalysisQueueItem[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const syncQueue = () => setQueue(getAiAnalysisQueue());
    syncQueue();

    window.addEventListener(aiAnalysisQueueEvent, syncQueue);
    window.addEventListener("storage", syncQueue);

    const timer = window.setInterval(() => {
      setNow(Date.now());
      void processDueAiAnalysisRetries();
    }, 20 * 1000);

    void processDueAiAnalysisRetries();

    return () => {
      window.removeEventListener(aiAnalysisQueueEvent, syncQueue);
      window.removeEventListener("storage", syncQueue);
      window.clearInterval(timer);
    };
  }, []);

  const activeItem = useMemo(
    () =>
      [...queue].sort((left, right) => {
        if (left.status === "running" && right.status !== "running") return -1;
        if (right.status === "running" && left.status !== "running") return 1;
        return left.nextAttemptAt - right.nextAttemptAt;
      })[0],
    [queue],
  );

  if (!activeItem) return null;

  const isRunning = activeItem.status === "running";
  const remainingMs = Math.max(activeItem.nextAttemptAt - now, 0);
  const retryDelayMs = getAiAnalysisRetryDelayMs(activeItem.attempts);
  const progress = isRunning
    ? 100
    : Math.min(
        100,
        Math.max(0, ((retryDelayMs - remainingMs) / retryDelayMs) * 100),
      );

  return (
    <div className="pointer-events-none fixed left-1/2 top-3 z-[60] w-[min(560px,calc(100vw-1.5rem))] -translate-x-1/2">
      <div className="pointer-events-auto overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-lg">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Bot className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-semibold">
                {t("aiRetryQueueTitle")}
              </p>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {queue.length}
              </span>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {isRunning
                ? `${t("aiRetryQueueRunning")} ${activeItem.candidateName}`
                : `${t("aiRetryQueueReadyIn")} ${formatRemaining(remainingMs)} · ${activeItem.candidateName}`}
            </p>
          </div>
          {!isRunning ? (
            <div className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
              <Clock className="h-3.5 w-3.5" />
              {Math.round(progress)}%
            </div>
          ) : null}
          <button
            type="button"
            className="rounded-sm p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            onClick={() => removeAiAnalysisRetry(activeItem.candidateId)}
            aria-label={t("dismiss")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
