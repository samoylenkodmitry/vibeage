import { describe, expect, it } from 'vitest';
import { planAutoEnter } from '../apps/client/src/autoEnter';
import type { LobbySession } from '../apps/client/src/accountSession';

/**
 * Seamless world entry.
 *
 * The player must always land in the world with no blocking dialog or form on
 * the way in. `planAutoEnter` is the pure decision behind that guarantee: a
 * remembered hero re-enters authenticated; every other case — no session, or a
 * session with a token but no remembered hero — enters as the Nameless guest.
 * Identity is offered in-world afterwards, never gated in front of it.
 */
describe('planAutoEnter', () => {
  it('re-enters a remembered hero, authenticated with its token', () => {
    const session: LobbySession = {
      token: 'tok-123',
      login: 'ada',
      character: { name: 'Aria', race: 'human', className: 'mage' },
    };
    expect(planAutoEnter(session)).toEqual({
      as: 'hero',
      name: 'Aria',
      race: 'human',
      className: 'mage',
      sessionToken: 'tok-123',
    });
  });

  it('enters as the Nameless guest when there is no saved session', () => {
    expect(planAutoEnter(null)).toEqual({ as: 'guest', name: 'Nameless' });
  });

  it('enters as the Nameless guest for a session with a token but no hero (never a blocking form)', () => {
    // A just-logged-in or legacy session (no `character`) used to strand the
    // player at a full-screen AwakeningPanel. It must now drop into the world.
    const session: LobbySession = { token: 'tok-xyz', login: 'ada' };
    expect(planAutoEnter(session)).toEqual({ as: 'guest', name: 'Nameless' });
  });
});
