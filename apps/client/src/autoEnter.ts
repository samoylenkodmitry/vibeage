import type { LobbySession } from './accountSession';

/**
 * The world-entry decision, isolated as a pure function so the "always enter,
 * never a blocking form" rule is unit-testable without a React render.
 *
 * A returning player with a remembered hero re-enters authenticated as that
 * hero. Every other case — no saved session at all, or a session with a token
 * but no remembered hero (just logged in, or a legacy save from before the
 * `character` field existed) — enters instantly as the Nameless guest. Identity
 * (Return to a saved hero / Become a new one) is then offered in-world by the
 * IdentityLayer, never gated in front of the world as a blocking form.
 */
export type AutoEnterPlan =
  | { as: 'hero'; name: string; race: string; className: string; sessionToken: string }
  | { as: 'guest'; name: 'Nameless' };

export function planAutoEnter(session: LobbySession | null): AutoEnterPlan {
  if (session?.character) {
    return {
      as: 'hero',
      name: session.character.name,
      race: session.character.race,
      className: session.character.className,
      sessionToken: session.token,
    };
  }
  return { as: 'guest', name: 'Nameless' };
}
