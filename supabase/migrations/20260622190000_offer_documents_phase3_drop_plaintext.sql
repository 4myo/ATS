-- =============================================================================
-- Smart ATS — offer_documents PII encryption, PHASE 3 (IRREVERSIBLE)
-- =============================================================================
-- Run ONLY after Phase 2 is verified live:
--   * the new app build is deployed (reads via offer_documents_secure, writes via
--     offer_document_set_secure RPC, inserts omit plaintext content/inputs),
--   * the prep + re-sync migration was applied,
--   * a freshly created/edited offer renders correctly and its content_enc
--     decrypts to the new text.
--
-- After this, the raw offer_documents table keeps only the encrypted content_enc
-- / inputs_enc. offer_documents_secure reads only those, so the view keeps working.
-- No code references the plaintext columns anymore, so this is SQL-only. No undo.
-- =============================================================================

alter table public.offer_documents
  drop column if exists content,
  drop column if exists inputs;

-- =============================================================================
