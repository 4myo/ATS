# Smart ATS — PII encryption runbook

Pragmatic, Postgres-side field encryption (pgcrypto + Supabase Vault). The key
never leaves Postgres; the browser reads decrypted data through a `SECURITY
DEFINER` view scoped to the logged-in user, and writes through encrypting RPCs.

Rollout is **three phases** so the app never breaks:

| Phase | What | Breaks app? |
|---|---|---|
| **1** | Add encrypted columns + decrypting view + write RPCs + backfill | No (plaintext stays) |
| **2** | App + Edge Functions read the view / write via RPC | No (both paths valid) |
| **3** | Drop the plaintext columns | No (app already off plaintext) |

---

## Phase 1 — apply (you run this; I have no project access)

1. **Generate the key** (32 bytes):
   ```bash
   openssl rand -base64 32
   ```

2. **Store it in Vault** — Supabase → SQL editor, run once (then delete the line):
   ```sql
   select vault.create_secret('PASTE_KEY_HERE', 'ats_field_key', 'AES key for ATS PII fields');
   ```
   Keep a copy of the key in your password manager. **If you lose it, encrypted
   data is unrecoverable.**

3. **Run the migration**: `supabase/migrations/20260621120000_pii_encryption_phase1.sql`
   - Supabase CLI: `supabase db push` (or paste into the SQL editor).

4. **Verify** the backfill round-trips (expect `0`):
   ```sql
   select count(*) as mismatches
   from public.candidates
   where coalesce(enc.decrypt(analysis_summary_enc),'') is distinct from coalesce(analysis_summary,'');
   ```
   Spot-check that the raw table shows bytea blobs:
   ```sql
   select id, analysis_summary, analysis_summary_enc from public.candidates limit 3;
   ```

5. **Confirm the key is locked down** (these must error / return no rows for the
   `anon`/`authenticated` roles): selecting `vault.decrypted_secrets` or calling
   `enc.decrypt(...)` as a normal user should be denied.

Nothing in the app changes yet — it still reads/writes the plaintext columns.

---

## Phase 2 — cutover (I do the app + Edge Function code, after you confirm Phase 1)

I will change, in small reviewable commits:
- **Reads** of sensitive text: `supabase.from('candidates').select(...)` →
  `supabase.from('candidates_secure').select(...)` in CandidateDetail,
  InterviewWorkflow, Offers, and anywhere `analysis_*` / `interview_analysis_*` /
  `offer_summary` are displayed. (List/search/dedupe stay on the base table — they
  don't touch encrypted fields.)
- **Writes**:
  - Browser: replace direct updates of those fields with
    `supabase.rpc('candidate_set_analysis', {...})` etc.
  - Edge Functions (`analyze-candidate`, `generate-offer`): replace their
    `update({...})` of those fields with the `*_admin` RPCs (service-role).
- Verify the whole app works against encrypted data with plaintext still present
  (so any miss is caught without data loss).

---

## Phase 3 — drop plaintext (you run, after Phase 2 verified)

A second migration (I'll provide once Phase 2 lands) runs:
```sql
alter table public.candidates
  drop column analysis_summary,
  drop column analysis_strengths,
  drop column analysis_concerns,
  drop column interview_analysis_summary,
  drop column interview_analysis_strengths,
  drop column interview_analysis_concerns,
  drop column interview_analysis_questions,
  drop column offer_summary;
```
After this, the raw table has **no plaintext** for these fields.

---

## Still to schema-confirm before I extend the same pattern

These weren't included in Phase 1 because I want to confirm exact table/column
names from your DB first (no guessing in a security migration):

- **`transcripts.transcript_text`** — same view+RPC pattern. (Confirm table name.)
- **Sourcing leads (Headhunter)**: `name, email, phone, notes, evidence, documents`
  — confirm the table + columns; notes/evidence/documents are the sensitive ones.
- **`offer_checklist` (jsonb)** — needs a *split*: keep filterable keys
  (`offerSent`, `negotiationStatus`, `interviewCompleted`…) in plaintext jsonb,
  move the sensitive sub-fields (`negotiationMinGross`, `negotiationMaxGross`,
  `candidateExpectedGross`, `acceptanceEmailBody`, `rejectionEmailBody`) into
  dedicated encrypted columns. Slightly more work; staged after candidates land.

## Out of scope for "pragmatic" (per sign-off)

- `full_name`, `email`, `location` stay plaintext under RLS so global search,
  list filters, and `candidateRows.ts` dedupe keep working. If you later want
  these encrypted too, we add a **blind index** (`HMAC(normalized, search_key)`)
  and switch those searches to exact-match.
- Storage buckets (`resumes`, `interview-recordings`): keep private + RLS-scoped;
  client-side blob encryption is a separate add-on.

## Key rotation (later)

Add `ats_field_key_v2` to Vault, re-encrypt with the new key in a batched job,
bump `enc_version` per row, then retire the old key. The read path already
selects by stored ciphertext, so rotation needs no app changes.
