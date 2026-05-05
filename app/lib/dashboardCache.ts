import type { Applicant } from "../store";

export type CachedDashboardApplicant = Applicant & {
  createdAt: string | null;
  aiWritingScore: number | null;
};

export type CachedDashboardJob = {
  id: string;
  title: string;
  status: string | null;
  openings: number;
  createdAt: string | null;
};

type DashboardCache = {
  applicants: CachedDashboardApplicant[];
  jobs: CachedDashboardJob[];
  loadedAt: number;
};

const dashboardCacheTtlMs = 60_000;

let dashboardCache: DashboardCache | null = null;
let dashboardRequest: Promise<DashboardCache> | null = null;

const isFresh = (loadedAt?: number) =>
  Boolean(loadedAt && Date.now() - loadedAt < dashboardCacheTtlMs);

export const getDashboardCache = () => dashboardCache;

export const setDashboardCache = (
  applicants: CachedDashboardApplicant[],
  jobs: CachedDashboardJob[],
) => {
  dashboardCache = {
    applicants,
    jobs,
    loadedAt: Date.now(),
  };
};

export const clearDashboardCache = () => {
  dashboardCache = null;
  dashboardRequest = null;
};

export const getDashboardRequest = () => dashboardRequest;

export const setDashboardRequest = (request: Promise<DashboardCache> | null) => {
  dashboardRequest = request;
};

export const hasFreshDashboardCache = () => isFresh(dashboardCache?.loadedAt);
