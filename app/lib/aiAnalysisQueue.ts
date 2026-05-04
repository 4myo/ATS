import { supabase } from "./supabase";
import { clearCandidateListCache } from "./candidateListCache";

const queueStorageKey = "smart-ats-ai-analysis-queue";
export const aiAnalysisQueueEvent = "smart-ats-ai-analysis-queue-change";
export const aiAnalysisBaseRetryDelayMs = 3 * 60 * 1000;
export const aiAnalysisMaxRetryDelayMs = 30 * 60 * 1000;

export const getAiAnalysisRetryDelayMs = (attempts = 0) =>
  Math.min(
    aiAnalysisBaseRetryDelayMs * 2 ** Math.max(0, attempts),
    aiAnalysisMaxRetryDelayMs,
  );

export type AiAnalysisQueueItem = {
  id: string;
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  jobDescription: string;
  resumeText: string;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  status: "waiting" | "running";
  createdAt: number;
};

const emitQueueChange = () => {
  window.dispatchEvent(new CustomEvent(aiAnalysisQueueEvent));
};

export const getAiAnalysisQueue = (): AiAnalysisQueueItem[] => {
  if (typeof window === "undefined") return [];

  try {
    const rawQueue = window.localStorage.getItem(queueStorageKey);
    if (!rawQueue) return [];
    const parsed = JSON.parse(rawQueue);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
};

const setAiAnalysisQueue = (queue: AiAnalysisQueueItem[]) => {
  window.localStorage.setItem(queueStorageKey, JSON.stringify(queue));
  emitQueueChange();
};

export const enqueueAiAnalysisRetry = (
  item: Omit<
    AiAnalysisQueueItem,
    "id" | "attempts" | "nextAttemptAt" | "lastError" | "status" | "createdAt"
  > & { lastError?: string | null },
) => {
  const queue = getAiAnalysisQueue();
  const existingIndex = queue.findIndex(
    (queuedItem) => queuedItem.candidateId === item.candidateId,
  );
  const nextItem: AiAnalysisQueueItem = {
    ...item,
    id:
      existingIndex >= 0
        ? queue[existingIndex].id
        : `${item.candidateId}-${Date.now()}`,
    attempts: existingIndex >= 0 ? queue[existingIndex].attempts : 0,
    nextAttemptAt:
      Date.now() +
      getAiAnalysisRetryDelayMs(
        existingIndex >= 0 ? queue[existingIndex].attempts : 0,
      ),
    lastError: item.lastError ?? null,
    status: "waiting",
    createdAt: existingIndex >= 0 ? queue[existingIndex].createdAt : Date.now(),
  };

  if (existingIndex >= 0) {
    queue[existingIndex] = nextItem;
  } else {
    queue.push(nextItem);
  }

  setAiAnalysisQueue(queue);
};

export const removeAiAnalysisRetry = (candidateId: string) => {
  setAiAnalysisQueue(
    getAiAnalysisQueue().filter((item) => item.candidateId !== candidateId),
  );
};

export const isCandidateQueuedForAiAnalysis = (candidateId: string) =>
  getAiAnalysisQueue().some((item) => item.candidateId === candidateId);

const updateQueueItem = (
  candidateId: string,
  update: (item: AiAnalysisQueueItem) => AiAnalysisQueueItem,
) => {
  setAiAnalysisQueue(
    getAiAnalysisQueue().map((item) =>
      item.candidateId === candidateId ? update(item) : item,
    ),
  );
};

const analyzeCandidate = async (item: AiAnalysisQueueItem) => {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError || !sessionData.session) {
    throw new Error("No active session.");
  }

  const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-candidate`;
  const response = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionData.session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      candidateId: item.candidateId,
      jobTitle: item.jobTitle,
      jobDescription: item.jobDescription,
      resumeText: item.resumeText,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || response.statusText);
  }
};

export const processDueAiAnalysisRetries = async () => {
  const dueItem = getAiAnalysisQueue().find(
    (item) => item.status !== "running" && item.nextAttemptAt <= Date.now(),
  );

  if (!dueItem) return;

  updateQueueItem(dueItem.candidateId, (item) => ({
    ...item,
    status: "running",
  }));

  try {
    await analyzeCandidate(dueItem);
    clearCandidateListCache();
    removeAiAnalysisRetry(dueItem.candidateId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI analysis failed.";
    updateQueueItem(dueItem.candidateId, (item) => ({
      ...item,
      attempts: item.attempts + 1,
      nextAttemptAt:
        Date.now() + getAiAnalysisRetryDelayMs(item.attempts + 1),
      lastError: message,
      status: "waiting",
    }));
  }
};
