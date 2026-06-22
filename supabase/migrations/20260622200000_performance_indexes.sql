-- =============================================================================
-- Smart ATS — performance indexes (NON-BREAKING, additive)
-- =============================================================================
-- The hot tables (candidates, offer_documents, jobs, activity_logs) had only
-- their primary-key index. Every list query filters by user_id (the *_secure
-- views add `where user_id = auth.uid()`) and most sort by created_at, so these
-- composite indexes let Postgres jump straight to a user's rows in the right
-- order instead of scanning + sorting the whole table.
--
-- Note: these speed up FILTERING/SORTING on plaintext columns. They do not (and
-- cannot) touch the encrypted *_enc columns — but we never filter on those.
-- Pure performance, no schema/behavior change. Safe to apply anytime.
-- =============================================================================

-- candidates: list loads (order by created_at per user), stage filters, and
-- per-title capacity counts (jobCache.getJobCapacityForTitle).
create index if not exists candidates_user_created_at_idx
  on public.candidates (user_id, created_at desc);
create index if not exists candidates_user_stage_idx
  on public.candidates (user_id, stage);
create index if not exists candidates_user_job_title_idx
  on public.candidates (user_id, job_title);

-- offer_documents: latest-document-per-candidate lookups (Offers list +
-- CandidateDetail) and per-user document scans.
create index if not exists offer_documents_candidate_created_at_idx
  on public.offer_documents (candidate_id, created_at desc);
create index if not exists offer_documents_user_created_at_idx
  on public.offer_documents (user_id, created_at desc);

-- jobs: per-user listing + title lookups (jobCache, capacity/status sync).
create index if not exists jobs_user_created_at_idx
  on public.jobs (user_id, created_at desc);
create index if not exists jobs_user_title_idx
  on public.jobs (user_id, title);

-- activity_logs: per-user recent-activity feed (PipelineActivity).
create index if not exists activity_logs_user_created_at_idx
  on public.activity_logs (user_id, created_at desc);

-- =============================================================================
-- ROLLBACK:
--   drop index if exists public.candidates_user_created_at_idx;
--   drop index if exists public.candidates_user_stage_idx;
--   drop index if exists public.candidates_user_job_title_idx;
--   drop index if exists public.offer_documents_candidate_created_at_idx;
--   drop index if exists public.offer_documents_user_created_at_idx;
--   drop index if exists public.jobs_user_created_at_idx;
--   drop index if exists public.jobs_user_title_idx;
--   drop index if exists public.activity_logs_user_created_at_idx;
-- =============================================================================
