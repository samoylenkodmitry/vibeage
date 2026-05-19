import type { Insertable } from 'kysely';
import { database, type AccountsTable, type PlayersTable } from '../db.js';
import { hashPassword, verifyPassword } from './passwords.js';

export interface AccountSummary {
  id: string;
  login: string;
}

export interface CharacterRow {
  name: string;
  class_name: string;
  race: string;
  level: number;
}

// Relaxed bounds per user request — minimum 1 char each. Length caps
// + the char allow-list stay as sanity guards (no Unicode confusables
// in logins, no megabyte passwords).
const LOGIN_MIN = 1;
const LOGIN_MAX = 24;
const PASSWORD_MIN = 1;
const PASSWORD_MAX = 128;
const LOGIN_RE = /^[A-Za-z0-9._-]+$/;

export type AuthError =
  | 'invalidLogin'
  | 'invalidPassword'
  | 'loginTaken'
  | 'wrongCredentials';

export function validateCredentials(login: unknown, password: unknown): AuthError | null {
  if (typeof login !== 'string' || login.length < LOGIN_MIN || login.length > LOGIN_MAX || !LOGIN_RE.test(login)) {
    return 'invalidLogin';
  }
  if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return 'invalidPassword';
  }
  return null;
}

export async function registerAccount(login: string, password: string): Promise<{ ok: true; account: AccountSummary } | { ok: false; error: AuthError }> {
  const validation = validateCredentials(login, password);
  if (validation) return { ok: false, error: validation };
  const existing = await database
    .selectFrom('accounts')
    .where('login', '=', login)
    .select(['id'])
    .executeTakeFirst();
  if (existing) return { ok: false, error: 'loginTaken' };
  const { hash, salt } = await hashPassword(password);
  const insertValues = { login, password_hash: hash, password_salt: salt } as Insertable<AccountsTable>;
  const row = await database
    .insertInto('accounts')
    .values(insertValues)
    .returning(['id', 'login'])
    .executeTakeFirstOrThrow();
  return { ok: true, account: { id: row.id, login: row.login } };
}

export async function loginAccount(login: string, password: string): Promise<{ ok: true; account: AccountSummary } | { ok: false; error: AuthError }> {
  const validation = validateCredentials(login, password);
  if (validation) return { ok: false, error: 'wrongCredentials' };
  const row = await database
    .selectFrom('accounts')
    .where('login', '=', login)
    .select(['id', 'login', 'password_hash', 'password_salt'])
    .executeTakeFirst();
  if (!row) return { ok: false, error: 'wrongCredentials' };
  const matches = await verifyPassword(password, row.password_hash, row.password_salt);
  if (!matches) return { ok: false, error: 'wrongCredentials' };
  await database
    .updateTable('accounts')
    .set({ last_login_at: new Date() })
    .where('id', '=', row.id)
    .execute();
  return { ok: true, account: { id: row.id, login: row.login } };
}

/**
 * Single-button auth entry point: registers when the login is new,
 * logs in otherwise. Removes the user-facing "did I already register?"
 * choice — the server figures it out. Used by POST /api/auth.
 */
export async function authenticateOrRegister(
  login: string,
  password: string,
): Promise<{ ok: true; account: AccountSummary; created: boolean } | { ok: false; error: AuthError }> {
  const validation = validateCredentials(login, password);
  if (validation) return { ok: false, error: validation };
  const existing = await database
    .selectFrom('accounts')
    .where('login', '=', login)
    .select(['id', 'login', 'password_hash', 'password_salt'])
    .executeTakeFirst();
  if (existing) {
    const matches = await verifyPassword(password, existing.password_hash, existing.password_salt);
    if (!matches) return { ok: false, error: 'wrongCredentials' };
    await database
      .updateTable('accounts')
      .set({ last_login_at: new Date() })
      .where('id', '=', existing.id)
      .execute();
    return { ok: true, account: { id: existing.id, login: existing.login }, created: false };
  }
  // Fresh login → register on the fly.
  const { hash, salt } = await hashPassword(password);
  const insertValues = { login, password_hash: hash, password_salt: salt } as Insertable<AccountsTable>;
  const row = await database
    .insertInto('accounts')
    .values(insertValues)
    .returning(['id', 'login'])
    .executeTakeFirstOrThrow();
  return { ok: true, account: { id: row.id, login: row.login }, created: true };
}

export async function listCharactersForAccount(accountId: string): Promise<CharacterRow[]> {
  const rows = await database
    .selectFrom('players')
    .where('account_id', '=', accountId)
    .select(['name', 'class_name', 'race', 'level'])
    .execute();
  return rows.map((r) => ({
    name: r.name,
    class_name: r.class_name,
    race: r.race,
    level: r.level,
  }));
}

export async function createCharacterForAccount(
  accountId: string,
  name: string,
  race: string,
  className: string,
): Promise<{ ok: true } | { ok: false; error: 'invalidName' | 'nameTaken' }> {
  const trimmed = name.trim();
  // Min length 1 — matches the relaxed auth bounds (PR J). Cap at
  // 24 chars for sanity. Allow-list keeps the per-character mix
  // safe (no whitespace-only names, no Unicode confusables).
  if (trimmed.length < 1 || trimmed.length > 24) return { ok: false, error: 'invalidName' };
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) return { ok: false, error: 'invalidName' };
  const existing = await database
    .selectFrom('players')
    .where('account_id', '=', accountId)
    .where('name', '=', trimmed)
    .select(['id'])
    .executeTakeFirst();
  if (existing) return { ok: false, error: 'nameTaken' };
  const playerValues = {
    account_id: accountId,
    name: trimmed,
    race,
    class_name: className,
    last_login: new Date(),
  } as Insertable<PlayersTable>;
  await database
    .insertInto('players')
    .values(playerValues)
    .execute();
  return { ok: true };
}

export async function deleteCharacterForAccount(accountId: string, name: string): Promise<void> {
  await database
    .deleteFrom('players')
    .where('account_id', '=', accountId)
    .where('name', '=', name)
    .execute();
}

export async function deleteAccount(accountId: string): Promise<void> {
  // ON DELETE CASCADE on `players.account_id` (migration 009) wipes
  // every character + their persisted inventory / progression rows.
  await database
    .deleteFrom('accounts')
    .where('id', '=', accountId)
    .execute();
}

/**
 * Migration 010 — server-side logout: bump `tokens_valid_after` to now
 * so every session token issued before this moment fails verify.
 * Caller is responsible for updating the in-memory revocation cache
 * (`revokeTokensForAccount`) so existing sockets are kicked on their
 * next request.
 */
export async function bumpAccountTokensValidAfter(accountId: string, at: Date = new Date()): Promise<void> {
  await database
    .updateTable('accounts')
    .set({ tokens_valid_after: at })
    .where('id', '=', accountId)
    .execute();
}

export async function loadAccountTokenRevocations(): Promise<Array<{ id: string; tokens_valid_after: Date }>> {
  const rows = await database
    .selectFrom('accounts')
    .select(['id', 'tokens_valid_after'])
    .execute();
  return rows.map((r) => ({ id: r.id, tokens_valid_after: r.tokens_valid_after as Date }));
}
