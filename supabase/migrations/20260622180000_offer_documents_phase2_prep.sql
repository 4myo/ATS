-- =============================================================================
-- Smart ATS — offer_documents PII encryption, PHASE 2 PREP + RE-SYNC
-- =============================================================================
-- Run this RIGHT BEFORE deploying the new app build, while the OLD (plaintext-
-- writing) code is still live. Two things:
--
--   1) Drop NOT NULL on content. The new code inserts offer_documents WITHOUT the
--      plaintext content/inputs (it writes them encrypted via the RPC), so the
--      column must allow NULL. This also makes Phase 3 a pure SQL column drop.
--
--   2) Re-sync: any offer doc created/edited since Phase 1 by the old code wrote
--      only plaintext, leaving *_enc stale/NULL. Since the app now reads decrypted
--      *_enc, re-encrypt every row from current plaintext so nothing looks blank.
--
-- ORDER: run this -> deploy app -> verify -> Phase 3 drop. Do NOT run the re-sync
-- again after a new-code write (it would overwrite fresh ciphertext with stale
-- plaintext).
-- =============================================================================

alter table public.offer_documents alter column content drop not null;

update public.offer_documents set
  content_enc = enc.encrypt(content),
  inputs_enc  = enc.encrypt(coalesce(inputs, '{}'::jsonb)::text),
  enc_version = 1;

-- Verify (expect 0):
-- select count(*) from public.offer_documents
-- where coalesce(enc.decrypt(content_enc),'') is distinct from coalesce(content,'')
--    or coalesce(enc.decrypt(inputs_enc),'')  is distinct from coalesce(inputs::text,'');
-- =============================================================================
