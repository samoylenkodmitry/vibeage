-- 010: server-side logout / token revocation.
--
-- Adds `accounts.tokens_valid_after` (TIMESTAMPTZ). The session-token
-- verifier reads this and rejects tokens whose `iat` (issued-at) is
-- older than the column.
--
-- Tokens prior to this migration carried no `iat`; the deploy that
-- ships this migration also changes the token format, so every
-- existing client must log in again on their next visit. The default
-- TIMESTAMPTZ value '1970-01-01' means freshly-issued tokens after
-- the deploy are immediately valid; calling `POST /api/auth/logout`
-- bumps the column to NOW() and invalidates every token issued
-- before that moment.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS tokens_valid_after TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01';
