-- =============================================================================
-- Smart ATS — PII encryption, PHASE 1c (NON-BREAKING, supplements phase1)
-- =============================================================================
-- Phase 2 switches every browser read that touches an encrypted field onto the
-- candidates_secure view. Those same selects also pull non-sensitive columns the
-- original view did not expose (education, ai_writing_*, interview_questions,
-- interview_analysis_transcript_ids). This recreates the view as a FULL
-- passthrough of all non-sensitive columns + decrypted sensitive ones, so the
-- app can read everything from one place.
--
-- The original column list/order/types are preserved and the new columns are
-- appended at the end, so `create or replace view` succeeds without a drop.
-- Still non-breaking: plaintext columns remain; the view only ever exposes the
-- DECRYPTED value under each sensitive column name.
-- =============================================================================

create or replace view public.candidates_secure
with (security_invoker = false) as
select
  c.id,
  c.user_id,
  c.full_name,
  c.job_title,
  c.email,
  c.location,
  c.years_experience,
  c.stage,
  c.ats_score,
  c.analysis_status,
  c.skills,
  c.skill_profile,
  c.resume_path,
  c.resume_preview_url,
  c.created_at,
  c.interview_analysis_status,
  c.interview_analysis_score,
  c.interview_analysis_updated_at,
  c.offer_checklist,
  c.offer_outcome,
  c.offer_sent_at,
  c.offer_response_due_at,
  enc.decrypt(c.analysis_summary_enc)                 as analysis_summary,
  enc.decrypt_arr(c.analysis_strengths_enc)           as analysis_strengths,
  enc.decrypt_arr(c.analysis_concerns_enc)            as analysis_concerns,
  enc.decrypt(c.interview_analysis_summary_enc)       as interview_analysis_summary,
  enc.decrypt_arr(c.interview_analysis_strengths_enc) as interview_analysis_strengths,
  enc.decrypt_arr(c.interview_analysis_concerns_enc)  as interview_analysis_concerns,
  enc.decrypt_arr(c.interview_analysis_questions_enc) as interview_analysis_questions,
  enc.decrypt(c.offer_summary_enc)                    as offer_summary,
  -- appended non-sensitive passthrough columns (new in phase1c)
  c.education,
  c.ai_writing_score,
  c.ai_writing_label,
  c.ai_writing_notes,
  c.interview_questions,
  c.interview_analysis_transcript_ids
from public.candidates c
where c.user_id = (select auth.uid());

grant select on public.candidates_secure to authenticated;

-- =============================================================================
-- ROLLBACK (Phase 1c): re-run the phase1 view definition (without the appended
-- columns). Or just leave it — exposing extra non-sensitive columns is harmless.
-- =============================================================================
