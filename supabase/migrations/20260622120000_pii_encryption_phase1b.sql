-- =============================================================================
-- Smart ATS — PII encryption, PHASE 1b (NON-BREAKING, supplements phase1)
-- =============================================================================
-- Closes two gaps found during the Phase 2 cutover, both for the Edge Functions
-- (analyze-candidate / generate-offer) which run as the SERVICE ROLE:
--   1) No service-role path to READ decrypted fields. candidates_secure filters
--      by auth.uid() (null under service role) so it returns nothing to them.
--   2) No admin WRITE rpc for interview_analysis_* (phase1 only shipped the
--      analysis_* and offer_summary admin rpcs).
-- Still non-breaking: plaintext columns remain; nothing here is required until
-- the Edge Functions are switched over in Phase 2.
-- =============================================================================

-- 1) Service-role decrypted READ for one candidate -----------------------------
--    Returns decrypted sensitive fields by id. SECURITY DEFINER (runs as owner,
--    can reach enc.key()); no auth.uid() check because the Edge Functions already
--    enforce ownership (.eq('user_id', authedUserId)) before/around the call.
--    Granted ONLY to service_role.
create or replace function public.candidate_decrypted_admin(p_id uuid)
returns table (
  analysis_summary             text,
  analysis_strengths           text[],
  analysis_concerns            text[],
  interview_analysis_summary   text,
  interview_analysis_strengths text[],
  interview_analysis_concerns  text[],
  interview_analysis_questions text[],
  offer_summary                text
)
language sql
stable
security definer
set search_path = public, enc
as $$
  select
    enc.decrypt(c.analysis_summary_enc),
    enc.decrypt_arr(c.analysis_strengths_enc),
    enc.decrypt_arr(c.analysis_concerns_enc),
    enc.decrypt(c.interview_analysis_summary_enc),
    enc.decrypt_arr(c.interview_analysis_strengths_enc),
    enc.decrypt_arr(c.interview_analysis_concerns_enc),
    enc.decrypt_arr(c.interview_analysis_questions_enc),
    enc.decrypt(c.offer_summary_enc)
  from public.candidates c
  where c.id = p_id;
$$;
revoke all on function public.candidate_decrypted_admin(uuid) from public, anon, authenticated;
grant execute on function public.candidate_decrypted_admin(uuid) to service_role;

-- 2) Admin WRITE rpc for interview analysis (service_role) ----------------------
create or replace function public.candidate_set_interview_analysis_admin(
  p_id        uuid,
  p_summary   text,
  p_strengths text[],
  p_concerns  text[],
  p_questions text[]
) returns void
language plpgsql security definer set search_path = public, enc as $$
begin
  update public.candidates set
    interview_analysis_summary_enc    = enc.encrypt(p_summary),
    interview_analysis_strengths_enc  = enc.encrypt_arr(p_strengths),
    interview_analysis_concerns_enc   = enc.encrypt_arr(p_concerns),
    interview_analysis_questions_enc  = enc.encrypt_arr(p_questions),
    enc_version                       = 1
  where id = p_id;
end; $$;
revoke all on function public.candidate_set_interview_analysis_admin(uuid, text, text[], text[], text[]) from public, anon, authenticated;
grant execute on function public.candidate_set_interview_analysis_admin(uuid, text, text[], text[], text[]) to service_role;

-- =============================================================================
-- ROLLBACK (Phase 1b):
--   drop function if exists public.candidate_decrypted_admin(uuid);
--   drop function if exists public.candidate_set_interview_analysis_admin(uuid, text, text[], text[], text[]);
-- =============================================================================
