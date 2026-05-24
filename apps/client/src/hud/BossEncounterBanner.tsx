import { useEffect, useRef, useState } from 'react';
import type { EnemyEntity } from '../gameTypes';

type BossEncounterBannerProps = {
  enemies: Record<string, EnemyEntity>;
};

const BANNER_DURATION_MS = 3200;
const SAMPLE_THROTTLE_MS = 250;

/**
 * Brief dramatic banner when a mini-boss enters combat (aiState
 * flips from idle to anything else). Fires once per (boss-id,
 * combat session) — if the boss disengages and re-aggros later,
 * the banner can re-show.
 *
 * Watches client enemies map; no server change. Self-prunes the
 * tracked-set so vanished bosses don't accumulate.
 */
export function BossEncounterBanner({ enemies }: BossEncounterBannerProps) {
  const aggroedRef = useRef<Set<string>>(new Set());
  const lastSampleAtRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const [banner, setBanner] = useState<{ key: number; name: string; level: number } | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    const now = performance.now();
    if (now - lastSampleAtRef.current < SAMPLE_THROTTLE_MS) return;
    lastSampleAtRef.current = now;

    const liveIds = new Set<string>();
    for (const enemy of Object.values(enemies)) {
      if (!enemy.isMiniBoss) continue;
      liveIds.add(enemy.id);
      const inCombat = enemy.isAlive && enemy.aiState && enemy.aiState !== 'idle';
      if (inCombat && !aggroedRef.current.has(enemy.id)) {
        aggroedRef.current.add(enemy.id);
        if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
        seqRef.current += 1;
        setBanner({ key: seqRef.current, name: enemy.name, level: enemy.level });
        timeoutRef.current = window.setTimeout(() => {
          setBanner(null);
          timeoutRef.current = null;
        }, BANNER_DURATION_MS);
      } else if (!inCombat) {
        aggroedRef.current.delete(enemy.id);
      }
    }
    // Prune tracked ids whose entities have disappeared (despawned
    // mini-boss). Lets a future re-spawn re-trigger the banner.
    for (const id of aggroedRef.current) {
      if (!liveIds.has(id)) aggroedRef.current.delete(id);
    }
  }, [enemies]);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  if (!banner) return null;
  return (
    <div className="boss-encounter-banner" key={banner.key} aria-live="polite">
      <span className="boss-encounter-banner__eyebrow">Boss encounter</span>
      <strong className="boss-encounter-banner__name">{banner.name}</strong>
      {banner.level > 0 && (
        <span className="boss-encounter-banner__level">Level {banner.level}</span>
      )}
    </div>
  );
}
