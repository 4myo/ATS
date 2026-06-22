-- =============================================================================
-- Smart ATS — PII encryption, PHASE 1d (FIX: "permission denied for function decrypt")
-- =============================================================================
-- The candidates_secure view calls enc.decrypt / enc.decrypt_arr. In this
-- project the view ends up resolving those calls with the CALLER's privileges,
-- and Phase 1 revoked execute on them from `authenticated`, so every read of the
-- view fails with "permission denied for function decrypt" and the app shows 0
-- rows everywhere.
--
-- Fix: let `authenticated` execute ONLY the two decrypt helpers (read path).
-- This stays safe because:
--   * the `enc` schema is NOT in PostgREST's exposed schemas, so these functions
--     cannot be called directly over the REST/RPC API — only internally by the
--     view;
--   * enc.key(), enc.encrypt() and enc.encrypt_arr() remain REVOKED, so the key
--     is never reachable and clients cannot write ciphertext directly;
--   * enc.decrypt is SECURITY DEFINER, so the key never returns to the client;
--   * RLS + the view's `user_id = auth.uid()` filter mean a user can only ever
--     decrypt THEIR OWN rows — data they are already entitled to see.
-- =============================================================================

grant usage on schema enc to authenticated;
grant execute on function enc.decrypt(bytea)     to authenticated;
grant execute on function enc.decrypt_arr(bytea) to authenticated;

-- Belt-and-suspenders: keep the sensitive helpers locked to nobody but the
-- definer/owner + service_role paths that already have them.
revoke all on function enc.key()               from public, anon, authenticated;
revoke all on function enc.encrypt(text)        from public, anon, authenticated;
revoke all on function enc.encrypt_arr(text[])  from public, anon, authenticated;

-- =============================================================================
-- ROLLBACK (Phase 1d):
--   revoke execute on function enc.decrypt(bytea)     from authenticated;
--   revoke execute on function enc.decrypt_arr(bytea) from authenticated;
--   revoke usage on schema enc from authenticated;
-- =============================================================================
