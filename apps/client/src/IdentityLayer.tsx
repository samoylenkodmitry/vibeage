import { useMemo } from 'react';
import { AwakeningPanel } from './AwakeningPanel';
import { loadSession } from './accountSession';
import { planIdentityCue } from './identityCue';
import type { Identity } from './useIdentity';

/**
 * The in-world identity affordance, layered over the live HUD — never in front
 * of it. A Nameless guest gets a glowing "Awaken" prompt; a player whose saved
 * session died gets a "Return as <hero>" prompt; a logged-in hero gets a quiet
 * "Heroes" button. All three are *optional*: the world is already running and
 * playable behind them, and none of them opens on its own.
 *
 * The panel renders only once the player clicks one of those, and closes with
 * its ✕ or Escape — there is always a world to go back to.
 */
export function IdentityLayer({ online, identity }: { online: boolean; identity: Identity }) {
  const { isGuest, expiredHeroName, panelOpen, openPanel, closePanel } = identity;
  // Read the saved session only when the identity actually changes (isGuest
  // flips on enter/logout), not on every game-state tick — App re-renders
  // constantly, and loadSession() is synchronous localStorage I/O + JSON.parse.
  const heroSession = useMemo(() => (isGuest ? null : loadSession()), [isGuest]);
  const cue = planIdentityCue({ online, panelOpen, isGuest, expiredHeroName });

  if (cue === 'none') return null;
  if (cue === 'panel') {
    return (
      <AwakeningPanel
        initialSession={heroSession}
        initialMode={expiredHeroName ? 'return' : 'become'}
        onEnter={identity.enterWorld}
        onBecome={identity.handleBecome}
        onClose={closePanel}
        onLogout={identity.handleLogout}
      />
    );
  }
  if (cue === 'reclaim') {
    return (
      <button type="button" className="awaken-cta awaken-cta--reclaim" onClick={openPanel}>
        <span className="awaken-cta-spark" aria-hidden="true">↩</span>
        Playing as <strong>Nameless</strong> — return as <strong>{expiredHeroName}</strong>
      </button>
    );
  }
  if (cue === 'awaken') {
    return (
      <button type="button" className="awaken-cta" onClick={openPanel}>
        <span className="awaken-cta-spark" aria-hidden="true">✦</span>
        You are <strong>Nameless</strong> — Awaken to claim your fate
      </button>
    );
  }
  return (
    <button type="button" className="account-button" onClick={openPanel} aria-label="Heroes and account">
      <span aria-hidden="true">⚜</span> Heroes
    </button>
  );
}
