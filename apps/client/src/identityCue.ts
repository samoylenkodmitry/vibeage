import { planAutoEnter } from './autoEnter';
import { loadSession, type LobbySession } from './accountSession';

/**
 * What the in-world identity surface shows, as a pure decision.
 *
 * The product guarantee is blunt: **the world is never gated behind a form**.
 * Not for a first-time visitor, not for a returning hero, not for a returning
 * hero whose saved token has died. Every one of those cases lands in the
 * playable world first; identity (Become / Return / switch hero) is offered
 * there as a cue the player may ignore.
 *
 * Keeping the decision here — instead of inline in the React layer — is what
 * makes that guarantee testable: `planIdentityCue` can never answer `'panel'`
 * unless `panelOpen` is true, and `panelOpen` is only ever set by a click.
 */
export type IdentityCue =
  /** No world yet (still connecting) — show nothing over the loader. */
  | 'none'
  /** The player opened the identity panel themselves. */
  | 'panel'
  /** Playing as the Nameless guest: a glowing invitation to Awaken. */
  | 'awaken'
  /** Was a hero, the saved session died: a one-click way back in. */
  | 'reclaim'
  /** Playing as a real hero: the quiet Heroes/account button. */
  | 'heroes';

export function planIdentityCue(input: {
  online: boolean;
  panelOpen: boolean;
  isGuest: boolean;
  expiredHeroName: string | null;
}): IdentityCue {
  if (!input.online) return 'none';
  if (input.panelOpen) return 'panel';
  if (input.expiredHeroName) return 'reclaim';
  return input.isGuest ? 'awaken' : 'heroes';
}

/**
 * Are we playing as the Nameless guest right now? Derived from the very same
 * plan that drives the auto-join, so the cue can't disagree with reality: a
 * saved session with a token but no remembered hero enters as a guest, and
 * must therefore be invited to Awaken — not shown the hero/account button.
 */
export function startsAsGuest(session: LobbySession | null = loadSession()): boolean {
  return planAutoEnter(session).as === 'guest';
}

/**
 * Name to greet a player with after their saved session is rejected. The
 * remembered hero if there was one, else the account login — and `null` when
 * there's nothing to reclaim (a guest whose join failed), which keeps the cue
 * on `awaken` instead of promising a hero that doesn't exist.
 */
export function reclaimableName(session: LobbySession | null): string | null {
  if (!session) return null;
  return session.character?.name ?? session.login ?? null;
}
