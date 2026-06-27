import type { CharacterClass } from '../../../packages/content/classes';
import type { CharacterRace } from '../../../packages/content/races';

/**
 * Canonical account/session helpers shared by the pre-game Lobby and the
 * in-world Awakening flow. One source of truth for the localStorage session
 * key and the HTTP shapes against the server-side accounts API
 * (`/api/auth`, `/api/account/characters`).
 *
 * Every network helper takes an injectable `fetchFn` so the orchestration in
 * `onboarding.ts` is unit-testable without a real server or DB (the e2e env
 * runs persistence-off, so these endpoints only truly resolve in prod).
 */
export type LobbySession = { token: string; login: string };

export type SavedCharacter = {
  name: string;
  race: CharacterRace;
  className: CharacterClass;
};

export type FetchFn = typeof fetch;

const SESSION_KEY = 'vibeage:session';

export function loadSession(): LobbySession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.token === 'string' && typeof parsed?.login === 'string') return parsed;
    return null;
  } catch {
    return null;
  }
}

export function saveSession(s: LobbySession | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (s) window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* best-effort */
  }
}

export function hasSavedSession(): boolean {
  return loadSession() !== null;
}

// Flat result shapes (not discriminated unions): the client tsconfig runs
// with strictNullChecks off, where `if (!x.ok)` does not narrow a union, so
// every consumer would hit TS2339 reaching for `.error`. Optional fields keep
// the call sites simple and honest under the project's compiler settings.
export type AuthOutcome = { ok: boolean; session?: LobbySession; error?: string };

/**
 * Single-button auth against POST /api/auth: registers a brand-new login,
 * logs in an existing one. Mirrors the Lobby's AuthForm submit.
 */
export async function authenticate(
  login: string,
  password: string,
  fetchFn: FetchFn = fetch,
): Promise<AuthOutcome> {
  let res: Response;
  try {
    res = await fetchFn('/api/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login, password }),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
  const body = (await res.json().catch(() => ({}))) as { token?: string; login?: string; error?: string };
  if (!res.ok || !body.token) {
    return { ok: false, error: humanReadableAuthError(body.error, res.status) };
  }
  return { ok: true, session: { token: body.token, login: body.login ?? login } };
}

export async function fetchRoster(
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<SavedCharacter[] | 'unauthorized'> {
  const res = await fetchFn('/api/account/characters', {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 401) return 'unauthorized';
  if (!res.ok) throw new Error(`Roster fetch failed: ${res.status}`);
  const body = (await res.json()) as { characters: Array<{ name: string; race: string; class_name: string }> };
  return body.characters.map((c) => ({
    name: c.name,
    race: c.race as CharacterRace,
    className: c.class_name as CharacterClass,
  }));
}

export type CreateCharacterOutcome = { ok: boolean; error?: string };

export async function createCharacter(
  token: string,
  character: { name: string; race: CharacterRace; className: CharacterClass },
  fetchFn: FetchFn = fetch,
): Promise<CreateCharacterOutcome> {
  let res: Response;
  try {
    res = await fetchFn('/api/account/characters', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: character.name, race: character.race, className: character.className }),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    return { ok: false, error: humanReadableCreateError(body.error, res.status) };
  }
  return { ok: true };
}

export async function revokeSessionToken(token: string, fetchFn: FetchFn = fetch): Promise<void> {
  try {
    await fetchFn('/api/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  } catch {
    /* swallow — local clear still runs */
  }
}

export async function deleteCharacter(token: string, name: string, fetchFn: FetchFn = fetch): Promise<void> {
  await fetchFn(`/api/account/characters/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
}

export function humanReadableAuthError(code: string | undefined, status: number): string {
  switch (code) {
    case 'wrongCredentials': return 'Wrong password for this login.';
    case 'invalidLogin': return 'Login may only contain letters, digits, ".", "_", "-" (max 24 chars).';
    case 'invalidPassword': return 'Password is too long (max 128 chars).';
    default: return `Auth failed (${status})`;
  }
}

export function humanReadableCreateError(code: string | undefined, status: number): string {
  switch (code) {
    case 'nameTaken': return 'You already have a hero with that name.';
    case 'invalidName': return 'Name may only contain letters, digits, ".", "_", "-" (max 24 chars).';
    default: return `Could not save your hero (${status})`;
  }
}
