import type { CharacterClass } from '../../../packages/content/classes';
import { isClassAllowedForRace, RACE_PROFILES, type CharacterRace } from '../../../packages/content/races';
import {
  authenticate,
  fetchRoster,
  type FetchFn,
  type LobbySession,
  type SavedCharacter,
} from './accountSession';

/**
 * Pure orchestration for the in-world Awakening flow. Kept out of the React
 * component so it's unit-testable with an injected fetch (no DOM, no server).
 *
 * "Become" = take the credentials + identity the Nameless guest picked
 * in-world and turn them into a saved hero: authenticate (register a fresh
 * login or log into an existing account), then create the character row.
 * The caller (App) then `connect()`s as that character, dropping the guest.
 */
export type BecomeInput = {
  login: string;
  password: string;
  name: string;
  race: CharacterRace;
  className: CharacterClass;
};

// Flat result shape — see the note on AuthOutcome in accountSession.ts: the
// client compiles with strictNullChecks off, so a discriminated union wouldn't
// narrow on `!outcome.ok`. `stage` tags where a failure happened (telemetry /
// targeted messaging); it's absent on success.
export type BecomeOutcome = {
  ok: boolean;
  character?: SavedCharacter;
  session?: LobbySession;
  error?: string;
  stage?: 'validate' | 'auth' | 'nameTaken';
};

export function firstAllowedClass(race: CharacterRace): CharacterClass {
  return RACE_PROFILES[race]?.allowedClasses[0] ?? 'mage';
}

/**
 * Client-side guard mirroring the server's createCharacterForAccount rules
 * (1–24 chars, [A-Za-z0-9._-]) so we fail fast in the panel instead of
 * round-tripping an obviously bad name.
 */
export function isValidIdentityName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 24 && /^[A-Za-z0-9._-]+$/.test(trimmed);
}

/**
 * Authenticate + clear the way for an in-place Become. Unlike the old flow,
 * this does NOT create a character over HTTP — the caller sends the in-world
 * `BecomeCharacter` command, which promotes the live guest in place and carries
 * its progress forward. Here we just register/login and, for an existing
 * account, make sure the chosen hero name isn't already taken (a fresh register
 * has no heroes, so we skip the round-trip).
 */
export async function becomeCharacter(input: BecomeInput, fetchFn: FetchFn = fetch): Promise<BecomeOutcome> {
  const name = input.name.trim();
  if (!isValidIdentityName(name)) {
    return { ok: false, error: 'Name may only contain letters, digits, ".", "_", "-" (max 24 chars).', stage: 'validate' };
  }
  if (!isClassAllowedForRace(input.race, input.className)) {
    return { ok: false, error: `A ${input.race} cannot follow the ${input.className} prophecy.`, stage: 'validate' };
  }

  const auth = await authenticate(input.login, input.password, fetchFn);
  if (!auth.ok || !auth.session) {
    return { ok: false, error: auth.error ?? 'Authentication failed', stage: 'auth' };
  }

  if (!auth.created) {
    let roster: Awaited<ReturnType<typeof fetchRoster>>;
    try {
      roster = await fetchRoster(auth.session.token, fetchFn);
    } catch (err) {
      // A roster fetch failure must resolve (not throw) — otherwise the panel's
      // submit handler never clears its "Awakening…" busy state.
      return { ok: false, error: err instanceof Error ? err.message : 'Network error', stage: 'auth' };
    }
    if (roster !== 'unauthorized' && roster.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return { ok: false, error: 'You already have a hero with that name.', stage: 'nameTaken' };
    }
  }

  return {
    ok: true,
    character: { name, race: input.race, className: input.className },
    session: auth.session,
  };
}
