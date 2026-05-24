import { useEffect, useState } from 'react';
import type { GameClientState } from '../gameTypes';

type BossTelegraphBarProps = {
  telegraphs: GameClientState['bossTelegraphs'];
};

const TICK_MS = 100;

/**
 * HUD widget that surfaces the most-imminent active mini-boss
 * telegraph: boss name, ability, and a shrinking-time-to-impact
 * progress bar. Helps the player dodge without keeping eyes on
 * the ground ring.
 *
 * Picks the entry whose impactAt is soonest (and still in the
 * future). When state.bossTelegraphs is empty or every entry has
 * already resolved, renders nothing. 100ms tick is enough for a
 * smooth-looking bar without burning render budget.
 */
export function BossTelegraphBar({ telegraphs }: BossTelegraphBarProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (telegraphs.length === 0) return;
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [telegraphs.length]);

  const active = telegraphs
    .filter((t) => t.impactAt > now)
    .sort((a, b) => a.impactAt - b.impactAt)[0];
  if (!active) return null;

  const total = Math.max(1, active.impactAt - active.startedAt);
  const progress = Math.min(1, Math.max(0, (now - active.startedAt) / total));
  const remainingMs = Math.max(0, active.impactAt - now);

  return (
    <section
      className="boss-telegraph-bar"
      aria-live="polite"
      aria-label="Boss casting"
      data-testid="boss-telegraph-bar"
    >
      <header className="boss-telegraph-bar__header">
        <strong className="boss-telegraph-bar__name">{active.bossName}</strong>
        <span className="boss-telegraph-bar__ability">{active.abilityName}</span>
        <span className="boss-telegraph-bar__eta">{(remainingMs / 1000).toFixed(1)}s</span>
      </header>
      <div className="boss-telegraph-bar__track">
        <div
          className="boss-telegraph-bar__fill"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </section>
  );
}
