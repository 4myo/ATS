export const candidateImportProgressEvent = "smart-ats-candidate-import-progress";

export type CandidateImportProgress = {
  id: string;
  status: "running" | "complete" | "failed";
  total: number;
  completed: number;
  failed: number;
  queued: number;
  currentLabel: string | null;
  message: string;
  startedAt: number;
  updatedAt: number;
};

let currentCandidateImport: CandidateImportProgress | null = null;

const emitImportProgress = () => {
  window.dispatchEvent(new CustomEvent(candidateImportProgressEvent));
};

export const getCandidateImportProgress = () => currentCandidateImport;

export const startCandidateImportProgress = (total: number) => {
  currentCandidateImport = {
    id: crypto.randomUUID(),
    status: "running",
    total,
    completed: 0,
    failed: 0,
    queued: 0,
    currentLabel: null,
    message: "Priprava uvoza kandidatov...",
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
  emitImportProgress();
  return currentCandidateImport.id;
};

export const updateCandidateImportProgress = (
  update: Partial<Omit<CandidateImportProgress, "id" | "startedAt">>,
) => {
  if (!currentCandidateImport) return;
  currentCandidateImport = {
    ...currentCandidateImport,
    ...update,
    updatedAt: Date.now(),
  };
  emitImportProgress();
};

export const finishCandidateImportProgress = (
  update?: Partial<Omit<CandidateImportProgress, "id" | "startedAt" | "status">>,
) => {
  if (!currentCandidateImport) return;
  currentCandidateImport = {
    ...currentCandidateImport,
    ...update,
    status: currentCandidateImport.failed > 0 ? "failed" : "complete",
    updatedAt: Date.now(),
  };
  emitImportProgress();
};

export const dismissCandidateImportProgress = () => {
  currentCandidateImport = null;
  emitImportProgress();
};
