-- =============================================================================
-- Smart ATS — PII encryption at rest, PHASE 1 (NON-BREAKING)
-- =============================================================================
-- Strategy: pragmatic, Postgres-side encryption (pgcrypto + Supabase Vault key),
-- engine = SECURITY DEFINER functions/views so the key never reaches the browser.
--
-- Phase 1 ONLY adds encrypted columns + a decrypting view + write RPCs + backfill.
-- The plaintext columns are LEFT IN PLACE, so the running app keeps working.
-- Cutover (app reads the view / writes via RPC) is Phase 2; dropping the
-- plaintext columns is Phase 3 (separate file, after you verify).
--
-- AEAD note: pgcrypto's pgp_sym_encrypt uses AES-256 with an integrity MDC
-- (authenticated) and a random session key+salt per call (non-deterministic).
-- For a single-tenant app this single Vault-held key + `enc_version` column for
-- rotation is the pragmatic equivalent of envelope encryption; full per-row DEKs
-- can be layered later without changing the read path.
-- =============================================================================

-- 1) Extensions ---------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;
-- Supabase Vault is already enabled on hosted projects (schema: vault).

-- 2) Create the field key in Vault — RUN THIS ONCE, MANUALLY, then delete the line.
--    Generate a strong 32-byte key, e.g.:  openssl rand -base64 32
--    select vault.create_secret('PASTE_32_BYTE_BASE64_KEY_HERE',
--                               'ats_field_key',
--                               'AES key for ATS PII fields');

-- 3) Encryption helpers (private schema, key fetched from Vault, never exposed)
create schema if not exists enc;

create or replace function enc.key()
returns text
language sql
stable
security definer
set search_path = vault, public
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'ats_field_key'
  limit 1;
$$;

create or replace function enc.encrypt(p text)
returns bytea
language sql
stable
security definer
set search_path = extensions, public
as $$
  select case
    when p is null then null
    else extensions.pgp_sym_encrypt(p, enc.key(), 'cipher-algo=aes256')
  end;
$$;

create or replace function enc.decrypt(p bytea)
returns text
language sql
stable
security definer
set search_path = extensions, public
as $$
  select case
    when p is null then null
    else extensions.pgp_sym_decrypt(p, enc.key())
  end;
$$;

-- text[] preserved as JSON so empty strings / order survive the round-trip.
create or replace function enc.encrypt_arr(p text[])
returns bytea
language sql
stable
security definer
set search_path = extensions, public
as $$
  select case
    when p is null then null
    else extensions.pgp_sym_encrypt(to_json(p)::text, enc.key(), 'cipher-algo=aes256')
  end;
$$;

create or replace function enc.decrypt_arr(p bytea)
returns text[]
language sql
stable
security definer
set search_path = extensions, public
as $$
  select case
    when p is null then null
    else array(select json_array_elements_text(extensions.pgp_sym_decrypt(p, enc.key())::json))
  end;
$$;

-- The key + raw crypto helpers must NEVER be callable by app roles.
revoke all on schema enc from public, anon, authenticated;
revoke all on function enc.key()            from public, anon, authenticated;
revoke all on function enc.encrypt(text)     from public, anon, authenticated;
revoke all on function enc.decrypt(bytea)    from public, anon, authenticated;
revoke all on function enc.encrypt_arr(text[]) from public, anon, authenticated;
revoke all on function enc.decrypt_arr(bytea)  from public, anon, authenticated;

-- 4) Encrypted columns on candidates (added alongside the plaintext ones) ------
alter table public.candidates
  add column if not exists analysis_summary_enc              bytea,
  add column if not exists analysis_strengths_enc            bytea,
  add column if not exists analysis_concerns_enc             bytea,
  add column if not exists interview_analysis_summary_enc    bytea,
  add column if not exists interview_analysis_strengths_enc  bytea,
  add column if not exists interview_analysis_concerns_enc   bytea,
  add column if not exists interview_analysis_questions_enc  bytea,
  add column if not exists offer_summary_enc                 bytea,
  add column if not exists enc_version                       smallint default 1;

-- 5) Decrypting view — Phase 2 app reads sensitive text from HERE.
--    security_invoker = false → runs as owner (can decrypt); the where-clause
--    scopes rows to the caller (RLS-equivalent). Non-sensitive columns pass
--    through so the app can still filter/sort/join on them.
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
  enc.decrypt(c.offer_summary_enc)                    as offer_summary
from public.candidates c
where c.user_id = (select auth.uid());

grant select on public.candidates_secure to authenticated;

-- 6) Write RPCs — Phase 2 app writes through these (encrypt + ownership check) --
create or replace function public.candidate_set_analysis(
  p_id         uuid,
  p_summary    text,
  p_strengths  text[],
  p_concerns   text[]
) returns void
language plpgsql
security definer
set search_path = public, enc
as $$
begin
  update public.candidates set
    analysis_summary_enc   = enc.encrypt(p_summary),
    analysis_strengths_enc = enc.encrypt_arr(p_strengths),
    analysis_concerns_enc  = enc.encrypt_arr(p_concerns),
    enc_version            = 1
  where id = p_id and user_id = (select auth.uid());
end;
$$;
grant execute on function public.candidate_set_analysis(uuid, text, text[], text[]) to authenticated;

create or replace function public.candidate_set_interview_analysis(
  p_id        uuid,
  p_summary   text,
  p_strengths text[],
  p_concerns  text[],
  p_questions text[]
) returns void
language plpgsql
security definer
set search_path = public, enc
as $$
begin
  update public.candidates set
    interview_analysis_summary_enc    = enc.encrypt(p_summary),
    interview_analysis_strengths_enc  = enc.encrypt_arr(p_strengths),
    interview_analysis_concerns_enc   = enc.encrypt_arr(p_concerns),
    interview_analysis_questions_enc  = enc.encrypt_arr(p_questions),
    enc_version                       = 1
  where id = p_id and user_id = (select auth.uid());
end;
$$;
grant execute on function public.candidate_set_interview_analysis(uuid, text, text[], text[], text[]) to authenticated;

create or replace function public.candidate_set_offer_summary(
  p_id      uuid,
  p_summary text
) returns void
language plpgsql
security definer
set search_path = public, enc
as $$
begin
  update public.candidates set
    offer_summary_enc = enc.encrypt(p_summary),
    enc_version       = 1
  where id = p_id and user_id = (select auth.uid());
end;
$$;
grant execute on function public.candidate_set_offer_summary(uuid, text) to authenticated;

-- Service-role variants for the Edge Functions (analyze-candidate / generate-offer).
-- These DO NOT check auth.uid() (no user JWT in that context) and are granted ONLY
-- to service_role, which the Edge Functions already use.
create or replace function public.candidate_set_analysis_admin(
  p_id uuid, p_summary text, p_strengths text[], p_concerns text[]
) returns void
language plpgsql security definer set search_path = public, enc as $$
begin
  update public.candidates set
    analysis_summary_enc   = enc.encrypt(p_summary),
    analysis_strengths_enc = enc.encrypt_arr(p_strengths),
    analysis_concerns_enc  = enc.encrypt_arr(p_concerns),
    enc_version            = 1
  where id = p_id;
end; $$;
revoke all on function public.candidate_set_analysis_admin(uuid, text, text[], text[]) from public, anon, authenticated;
grant execute on function public.candidate_set_analysis_admin(uuid, text, text[], text[]) to service_role;

create or replace function public.candidate_set_offer_summary_admin(
  p_id uuid, p_summary text
) returns void
language plpgsql security definer set search_path = public, enc as $$
begin
  update public.candidates set offer_summary_enc = enc.encrypt(p_summary), enc_version = 1
  where id = p_id;
end; $$;
revoke all on function public.candidate_set_offer_summary_admin(uuid, text) from public, anon, authenticated;
grant execute on function public.candidate_set_offer_summary_admin(uuid, text) to service_role;

-- 7) Backfill existing plaintext → encrypted columns (idempotent) --------------
update public.candidates set
  analysis_summary_enc              = enc.encrypt(analysis_summary),
  analysis_strengths_enc            = enc.encrypt_arr(analysis_strengths),
  analysis_concerns_enc             = enc.encrypt_arr(analysis_concerns),
  interview_analysis_summary_enc    = enc.encrypt(interview_analysis_summary),
  interview_analysis_strengths_enc  = enc.encrypt_arr(interview_analysis_strengths),
  interview_analysis_concerns_enc   = enc.encrypt_arr(interview_analysis_concerns),
  interview_analysis_questions_enc  = enc.encrypt_arr(interview_analysis_questions),
  offer_summary_enc                 = enc.encrypt(offer_summary)
where enc_version is distinct from 1
   or analysis_summary_enc is null;

-- 8) Verify (should return 0 rows where decrypt != original) -------------------
-- select count(*) as mismatches from public.candidates
-- where coalesce(enc.decrypt(analysis_summary_enc),'') is distinct from coalesce(analysis_summary,'');

-- =============================================================================
-- ROLLBACK (Phase 1) — run if you need to undo before cutover:
--   drop view if exists public.candidates_secure;
--   drop function if exists public.candidate_set_analysis(uuid, text, text[], text[]);
--   drop function if exists public.candidate_set_interview_analysis(uuid, text, text[], text[], text[]);
--   drop function if exists public.candidate_set_offer_summary(uuid, text);
--   drop function if exists public.candidate_set_analysis_admin(uuid, text, text[], text[]);
--   drop function if exists public.candidate_set_offer_summary_admin(uuid, text);
--   alter table public.candidates
--     drop column if exists analysis_summary_enc,
--     drop column if exists analysis_strengths_enc,
--     drop column if exists analysis_concerns_enc,
--     drop column if exists interview_analysis_summary_enc,
--     drop column if exists interview_analysis_strengths_enc,
--     drop column if exists interview_analysis_concerns_enc,
--     drop column if exists interview_analysis_questions_enc,
--     drop column if exists offer_summary_enc,
--     drop column if exists enc_version;
--   drop function if exists enc.encrypt(text);
--   drop function if exists enc.decrypt(bytea);
--   drop function if exists enc.encrypt_arr(text[]);
--   drop function if exists enc.decrypt_arr(bytea);
--   drop function if exists enc.key();
--   drop schema if exists enc;
-- (The Vault secret 'ats_field_key' is left in place; remove via vault if desired.)
-- =============================================================================
