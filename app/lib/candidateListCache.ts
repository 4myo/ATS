import type { Applicant } from "../store";

export type CandidateListCache = {
  applicants: Applicant[];
  jobs: Array<{ id: string; title: string; description?: string | null }>;
  loadedAt: number;
};

let candidateListCache: CandidateListCache | null = null;

export const getCandidateListCache = () => candidateListCache;

export const setCandidateListCache = (
  nextCache: Omit<CandidateListCache, "loadedAt">,
) => {
  candidateListCache = {
    ...nextCache,
    loadedAt: Date.now(),
  };
};

export const updateCachedApplicants = (
  update: (applicants: Applicant[]) => Applicant[],
) => {
  if (!candidateListCache) return;

  candidateListCache = {
    ...candidateListCache,
    applicants: update(candidateListCache.applicants),
    loadedAt: Date.now(),
  };
};

export const clearCandidateListCache = () => {
  candidateListCache = null;
};
