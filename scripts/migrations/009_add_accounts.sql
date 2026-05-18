-- 009: simple login + password auth.
--
-- User explicitly authorised dropping existing player data on this
-- migration (no production-account loss tolerable: the game has no
-- registered users yet). Schema becomes:
--   accounts(id, login UNIQUE, password_hash, password_salt,
--            created_at, last_login_at)
--   players(... existing columns ..., account_id REFERENCES accounts)
--
-- Login is the case-insensitive primary handle; characters live one-
-- to-many under it. Password is stored as scrypt(N=16384) of
-- (password + per-row salt). See server/auth/passwords.ts.

TRUNCATE TABLE players RESTART IDENTITY CASCADE;

CREATE TABLE IF NOT EXISTS accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login         text NOT NULL,
  password_hash text NOT NULL,
  password_salt text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS accounts_login_lower_unique
  ON accounts ((lower(login)));

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;

-- One account can hold many characters; a character name must be
-- unique within an account (case-insensitive). Globally unique names
-- aren't required after this migration.
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS players_account_name_unique
  ON players (account_id, (lower(name)));
