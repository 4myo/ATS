-- =============================================================================
-- Smart ATS — PII encryption, PHASE 2 RE-SYNC (run BEFORE deploying new functions)
-- =============================================================================
-- The Phase 1 backfill encrypted whatever existed at that moment. Anything
-- analyzed AFTERWARD by the still-old Edge Functions (e.g. freshly imported
-- candidates) wrote only the PLAINTEXT columns, leaving *_enc stale or NULL.
-- Since the app now reads decrypted *_enc, those rows can look blank.
--
-- This re-encrypts EVERY row from the current plaintext, unconditionally, so
-- *_enc matches the latest plaintext for all candidates.
--
-- ORDER MATTERS: run this WHILE the OLD Edge Functions are still live (plaintext
-- is the source of truth). Then deploy the new functions. Do NOT run this again
-- after a new-function analysis, or it would overwrite fresh ciphertext with
-- stale plaintext.
-- =============================================================================

update public.candidates set
  analysis_summary_enc              = enc.encrypt(analysis_summary),
  analysis_strengths_enc            = enc.encrypt_arr(analysis_strengths),
  analysis_concerns_enc             = enc.encrypt_arr(analysis_concerns),
  interview_analysis_summary_enc    = enc.encrypt(interview_analysis_summary),
  interview_analysis_strengths_enc  = enc.encrypt_arr(interview_analysis_strengths),
  interview_analysis_concerns_enc   = enc.encrypt_arr(interview_analysis_concerns),
  interview_analysis_questions_enc  = enc.encrypt_arr(interview_analysis_questions),
  offer_summary_enc                 = enc.encrypt(offer_summary),
  enc_version                       = 1;

-- Verify (expect 0): every decrypted value matches its plaintext source.
-- select count(*) from public.candidates
-- where coalesce(enc.decrypt(analysis_summary_enc),'') is distinct from coalesce(analysis_summary,'')
--    or coalesce(enc.decrypt(offer_summary_enc),'')    is distinct from coalesce(offer_summary,'')
--    or coalesce(enc.decrypt(interview_analysis_summary_enc),'') is distinct from coalesce(interview_analysis_summary,'');
-- =============================================================================
