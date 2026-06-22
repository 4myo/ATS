-- =============================================================================
-- Smart ATS — PII encryption, PHASE 3 (IRREVERSIBLE): drop plaintext columns
-- =============================================================================
-- Run ONLY after Phase 2 is verified live:
--   * the new Edge Functions are deployed and write to *_enc,
--   * the app reads everything from candidates_secure,
--   * the re-sync diagnostic returned manjka_enc = 0 AND plaintext_vs_enc = 0.
--
-- After this, the raw candidates table holds NO readable copy of these fields —
-- only the encrypted *_enc columns remain. There is no undo.
-- =============================================================================

-- 0) SAFETY GATE — run this first, on its own. It must return 0. If it returns
--    anything > 0, STOP: some row's ciphertext does not match its plaintext and
--    dropping now would lose/أchange data. Re-sync first, do NOT run the drop.
--
-- select count(*) as must_be_zero from public.candidates
-- where coalesce(enc.decrypt(analysis_summary_enc),'')              is distinct from coalesce(analysis_summary,'')
--    or coalesce(enc.decrypt(interview_analysis_summary_enc),'')    is distinct from coalesce(interview_analysis_summary,'')
--    or coalesce(enc.decrypt(offer_summary_enc),'')                 is distinct from coalesce(offer_summary,'');
--
-- NOTE: if you have ALREADY run new-function analyses (which write *_enc only,
-- leaving plaintext stale), this gate will be > 0 BY DESIGN for those rows — that
-- is expected and safe to drop, because *_enc is the fresh source of truth. Only
-- block on it if you have NOT yet cut writes over to the new functions.

-- 1) Drop the plaintext columns ------------------------------------------------
alter table public.candidates
  drop column if exists analysis_summary,
  drop column if exists analysis_strengths,
  drop column if exists analysis_concerns,
  drop column if exists interview_analysis_summary,
  drop column if exists interview_analysis_strengths,
  drop column if exists interview_analysis_concerns,
  drop column if exists interview_analysis_questions,
  drop column if exists offer_summary;

-- candidates_secure reads only *_enc + non-sensitive passthrough columns, so the
-- view keeps working unchanged. The write RPCs and decrypt helpers are likewise
-- untouched. Nothing else to do.
-- =============================================================================
