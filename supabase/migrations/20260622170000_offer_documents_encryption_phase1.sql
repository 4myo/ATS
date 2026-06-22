-- =============================================================================
-- Smart ATS — offer_documents PII encryption, PHASE 1 (NON-BREAKING)
-- =============================================================================
-- Encrypts the sensitive parts of generated offer letters at rest:
--   * content (the full offer text: salary, terms, personal details)
--   * inputs  (jsonb: salary, bonus, ... — only ever displayed, never filtered,
--              so it is encrypted as a single blob, no jsonb split needed)
-- Kept plaintext (needed for lists / relations / status flows): id, user_id,
-- candidate_id, title, status, generated_by, created_at, updated_at.
--
-- Same proven pattern as candidates: pgcrypto AES-256 key in Vault, decrypting
-- SECURITY DEFINER view + write RPCs. Reuses the existing enc.* helpers and the
-- authenticated-role execute grant added in phase1d, so no new key/grants.
--
-- PHASE 1 IS PURELY ADDITIVE: new columns + view + RPCs + backfill. It changes
-- NO application code and does not alter existing behavior — safe to apply while
-- the offer-generation feature is still being built. The code cutover (Phase 2:
-- reads via offer_documents_secure, writes via the RPCs, generate-offer using the
-- admin RPC) is deliberately deferred until that feature work settles.
-- =============================================================================

-- 1) Encrypted columns (alongside the plaintext ones) --------------------------
alter table public.offer_documents
  add column if not exists content_enc bytea,
  add column if not exists inputs_enc  bytea,
  add column if not exists enc_version smallint default 1;

-- 2) Decrypting view — Phase 2 reads sensitive fields from HERE ----------------
create or replace view public.offer_documents_secure
with (security_invoker = false) as
select
  d.id,
  d.user_id,
  d.candidate_id,
  d.title,
  d.status,
  d.generated_by,
  d.created_at,
  d.updated_at,
  enc.decrypt(d.content_enc) as content,
  case
    when d.inputs_enc is null then '{}'::jsonb
    else enc.decrypt(d.inputs_enc)::jsonb
  end as inputs
from public.offer_documents d
where d.user_id = (select auth.uid());

grant select on public.offer_documents_secure to authenticated;

-- 3) Write RPCs (encrypt content + inputs on an existing row) ------------------
-- Browser path (ownership-checked):
create or replace function public.offer_document_set_secure(
  p_id      uuid,
  p_content text,
  p_inputs  jsonb
) returns void
language plpgsql security definer set search_path = public, enc as $$
begin
  update public.offer_documents set
    content_enc = enc.encrypt(p_content),
    inputs_enc  = enc.encrypt(coalesce(p_inputs, '{}'::jsonb)::text),
    enc_version = 1
  where id = p_id and user_id = (select auth.uid());
end; $$;
grant execute on function public.offer_document_set_secure(uuid, text, jsonb) to authenticated;

-- Service-role path for the generate-offer Edge Function:
create or replace function public.offer_document_set_secure_admin(
  p_id      uuid,
  p_content text,
  p_inputs  jsonb
) returns void
language plpgsql security definer set search_path = public, enc as $$
begin
  update public.offer_documents set
    content_enc = enc.encrypt(p_content),
    inputs_enc  = enc.encrypt(coalesce(p_inputs, '{}'::jsonb)::text),
    enc_version = 1
  where id = p_id;
end; $$;
revoke all on function public.offer_document_set_secure_admin(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.offer_document_set_secure_admin(uuid, text, jsonb) to service_role;

-- 4) Backfill existing rows (idempotent) --------------------------------------
update public.offer_documents set
  content_enc = enc.encrypt(content),
  inputs_enc  = enc.encrypt(coalesce(inputs, '{}'::jsonb)::text),
  enc_version = 1
where enc_version is distinct from 1
   or content_enc is null;

-- 5) Verify (expect 0) ---------------------------------------------------------
-- select count(*) from public.offer_documents
-- where coalesce(enc.decrypt(content_enc),'') is distinct from coalesce(content,'')
--    or coalesce(enc.decrypt(inputs_enc),'')  is distinct from coalesce(inputs::text,'');

-- =============================================================================
-- ROLLBACK (Phase 1):
--   drop view if exists public.offer_documents_secure;
--   drop function if exists public.offer_document_set_secure(uuid, text, jsonb);
--   drop function if exists public.offer_document_set_secure_admin(uuid, text, jsonb);
--   alter table public.offer_documents
--     drop column if exists content_enc,
--     drop column if exists inputs_enc,
--     drop column if exists enc_version;
-- =============================================================================
