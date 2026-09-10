import { describe, expect, it } from 'vitest';
import { planIdentityCue, reclaimableName, startsAsGuest } from '../apps/client/src/identityCue';
import type { LobbySession } from '../apps/client/src/accountSession';

/**
 * The "never a form on the way in" guarantee, pinned as a pure decision.
 *
 * A regression put a full-screen login/create panel in front of the world for
 * any returning player whose saved token had expired — they opened the game and
 * were met by a web form instead of the world. The rule this spec enforces is
 * absolute and covers every visitor: the identity panel renders ONLY when the
 * player opened it. Everything else is an optional cue drawn over a world that
 * is already running.
 */
describe('planIdentityCue', () => {
  it('shows nothing before the world is up — a loader, never a form', () => {
    expect(planIdentityCue({ online: false, panelOpen: false, isGuest: true, expiredHeroName: null })).toBe('none');
    expect(planIdentityCue({ online: false, panelOpen: false, isGuest: false, expiredHeroName: 'Aria' })).toBe('none');
  });

  it('invites a Nameless guest to Awaken, without blocking anything', () => {
    expect(planIdentityCue({ online: true, panelOpen: false, isGuest: true, expiredHeroName: null })).toBe('awaken');
  });

  it('offers a returning hero the quiet Heroes button', () => {
    expect(planIdentityCue({ online: true, panelOpen: false, isGuest: false, expiredHeroName: null })).toBe('heroes');
  });

  it('offers a one-click way back when a saved session was rejected (no auto-form)', () => {
    // THE REGRESSION: an expired token used to pop the login panel open on its
    // own. It must now be a cue over a live world the player can ignore.
    expect(planIdentityCue({ online: true, panelOpen: false, isGuest: true, expiredHeroName: 'Aria' })).toBe('reclaim');
  });

  it('renders the panel only when the player opened it', () => {
    // `panelOpen` is the only route to 'panel', in every combination of state.
    for (const isGuest of [true, false]) {
      for (const expiredHeroName of [null, 'Aria']) {
        expect(planIdentityCue({ online: true, panelOpen: false, isGuest, expiredHeroName })).not.toBe('panel');
        expect(planIdentityCue({ online: true, panelOpen: true, isGuest, expiredHeroName })).toBe('panel');
      }
    }
  });
});

describe('startsAsGuest', () => {
  const hero: LobbySession = { token: 't', login: 'ada', character: { name: 'Aria', race: 'human', className: 'mage' } };

  it('agrees with the auto-join plan so the cue never contradicts who you are', () => {
    expect(startsAsGuest(null)).toBe(true);
    // Token but no remembered hero: we enter as Nameless, so we must be told to
    // Awaken — not shown the hero/account button for a hero we aren't playing.
    expect(startsAsGuest({ token: 't', login: 'ada' })).toBe(true);
    expect(startsAsGuest(hero)).toBe(false);
  });
});

describe('reclaimableName', () => {
  it('greets the remembered hero, falling back to the account login', () => {
    expect(reclaimableName({ token: 't', login: 'ada', character: { name: 'Aria', race: 'human', className: 'mage' } })).toBe('Aria');
    expect(reclaimableName({ token: 't', login: 'ada' })).toBe('ada');
  });

  it('is null for a guest with nothing to reclaim (cue stays on Awaken)', () => {
    expect(reclaimableName(null)).toBeNull();
  });
});
