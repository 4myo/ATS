import { supabase } from "./supabase";
import { dedupeCandidateRows } from "./candidateRows";

export type CachedJobOption = {
  id: string;
  title: string;
  description?: string | null;
  status?: string | null;
};

export type CachedJobListRow = CachedJobOption & {
  type: string | null;
  icon: string | null;
  status: string | null;
  created_at: string;
  openings: number;
  applicantsCount: number;
};

type JobOptionsCache = {
  jobs: CachedJobOption[];
  loadedAt: number;
};

type JobListCache = {
  jobs: CachedJobListRow[];
  loadedAt: number;
};

const jobCacheTtlMs = 60_000;

let jobOptionsCache: JobOptionsCache | null = null;
let jobListCache: JobListCache | null = null;
let jobListRequest: Promise<CachedJobListRow[]> | null = null;

const isFresh = (loadedAt?: number) =>
  Boolean(loadedAt && Date.now() - loadedAt < jobCacheTtlMs);

const toJobOptions = (jobs: CachedJobListRow[]): CachedJobOption[] =>
  jobs.map(({ id, title, description, status }) => ({ id, title, description, status }));

export const getCachedJobOptions = () => jobOptionsCache;

export const getCachedJobList = () => jobListCache;

export const setCachedJobOptions = (jobs: CachedJobOption[]) => {
  jobOptionsCache = {
    jobs,
    loadedAt: Date.now(),
  };
};

export const setCachedJobList = (jobs: CachedJobListRow[]) => {
  jobListCache = {
    jobs,
    loadedAt: Date.now(),
  };
  setCachedJobOptions(toJobOptions(jobs));
};

export const clearJobCache = () => {
  jobOptionsCache = null;
  jobListCache = null;
  jobListRequest = null;
};

export const updateCachedJobList = (
  update: (jobs: CachedJobListRow[]) => CachedJobListRow[],
) => {
  if (!jobListCache) return;
  setCachedJobList(update(jobListCache.jobs));
};

export const fetchJobList = async (options?: { force?: boolean }) => {
  if (!options?.force && isFresh(jobListCache?.loadedAt) && jobListCache) {
    return jobListCache.jobs;
  }

  if (!options?.force && jobListRequest) {
    return jobListRequest;
  }

  jobListRequest = (async () => {
    const [{ data, error }, { data: candidateRows }] = await Promise.all([
      supabase
        .from("jobs")
        .select("id, title, type, description, icon, status, openings, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("candidates")
        .select("id, full_name, job_title, email, resume_path, stage, created_at"),
    ]);

    if (error) throw error;

    const applicantCounts = dedupeCandidateRows(
      (candidateRows ?? []) as Array<Record<string, unknown>>,
    ).reduce<Record<string, number>>((counts, candidate) => {
      const jobTitle =
        typeof candidate.job_title === "string" ? candidate.job_title : "";
      if (!jobTitle) return counts;

      counts[jobTitle] = (counts[jobTitle] ?? 0) + 1;
      return counts;
    }, {});

    const jobs = ((data ?? []) as Array<Omit<CachedJobListRow, "applicantsCount">>).map(
      (job) => ({
        ...job,
        openings: Math.max(1, Number(job.openings ?? 1)),
        applicantsCount: applicantCounts[job.title] ?? 0,
      }),
    );

    setCachedJobList(jobs);
    return jobs;
  })();

  try {
    return await jobListRequest;
  } finally {
    jobListRequest = null;
  }
};

export const fetchJobOptions = async (options?: { force?: boolean }) => {
  if (!options?.force && isFresh(jobOptionsCache?.loadedAt) && jobOptionsCache) {
    return jobOptionsCache.jobs;
  }

  if (!options?.force && jobListCache) {
    setCachedJobOptions(toJobOptions(jobListCache.jobs));
    return toJobOptions(jobListCache.jobs);
  }

  const { data, error } = await supabase
    .from("jobs")
    .select("id, title, description, status")
    .order("created_at", { ascending: false });

  if (error) throw error;

  const jobs = (data ?? []) as CachedJobOption[];
  setCachedJobOptions(jobs);
  return jobs;
};

export const syncJobStatusForTitle = async (jobTitle: string) => {
  const normalizedTitle = jobTitle.trim();
  if (!normalizedTitle) return;

  const [{ data: job }, { count: acceptedCount }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, status, openings")
      .eq("title", normalizedTitle)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("candidates")
      .select("id", { count: "exact", head: true })
      .eq("job_title", normalizedTitle)
      .eq("stage", "Accepted"),
  ]);

  if (!job) return;

  const openings = Math.max(1, Number(job.openings ?? 1));
  const shouldBeInactive = (acceptedCount ?? 0) >= openings;
  const nextStatus = shouldBeInactive ? "inactive" : "active";

  if ((job.status ?? "active") === nextStatus) return;

  const { error } = await supabase
    .from("jobs")
    .update({ status: nextStatus })
    .eq("id", job.id);

  if (error) return;

  updateCachedJobList((jobs) =>
    jobs.map((cachedJob) =>
      cachedJob.id === job.id ? { ...cachedJob, status: nextStatus } : cachedJob,
    ),
  );
};

export const getJobCapacityForTitle = async (jobTitle: string) => {
  const normalizedTitle = jobTitle.trim();
  if (!normalizedTitle) return null;

  const [{ data: job }, { count: acceptedCount }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, status, openings")
      .eq("title", normalizedTitle)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("candidates")
      .select("id", { count: "exact", head: true })
      .eq("job_title", normalizedTitle)
      .eq("stage", "Accepted"),
  ]);

  if (!job) return null;

  return {
    id: job.id as string,
    title: job.title as string,
    status: ((job.status as string | null | undefined) ?? "active") as string,
    openings: Math.max(1, Number(job.openings ?? 1)),
    acceptedCount: acceptedCount ?? 0,
  };
};

export const increaseJobOpeningsForTitle = async (
  jobTitle: string,
  openings: number,
) => {
  const capacity = await getJobCapacityForTitle(jobTitle);
  if (!capacity) return null;

  const nextOpenings = Math.max(1, openings);
  const { data, error } = await supabase
    .from("jobs")
    .update({ openings: nextOpenings, status: "active" })
    .eq("id", capacity.id)
    .select("id, title, status, openings")
    .single();

  if (error || !data) throw error;

  updateCachedJobList((jobs) =>
    jobs.map((cachedJob) =>
      cachedJob.id === capacity.id
        ? {
            ...cachedJob,
            openings: Math.max(1, Number(data.openings ?? nextOpenings)),
            status: ((data.status as string | null | undefined) ?? "active") as string,
          }
        : cachedJob,
    ),
  );

  return {
    id: data.id as string,
    title: data.title as string,
    status: ((data.status as string | null | undefined) ?? "active") as string,
    openings: Math.max(1, Number(data.openings ?? nextOpenings)),
    acceptedCount: capacity.acceptedCount,
  };
};

export const prefetchJobList = () => {
  void fetchJobList().catch(() => {
    // Prefetch should never interrupt the current page.
  });
};
