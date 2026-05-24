import { useEffect, useRef, useState } from 'react';
import { playCue } from '../sfx';
import type { EnemyEntity } from '../gameTypes';

type BossDefeatBannerProps = {
  enemies: Record<string, EnemyEntity>;
};

const BANNER_DURATION_MS = 3600;
const SAMPLE_THROTTLE_MS = 200;

/**
 * Sibling to [[BossEncounterBanner]] — fires when any tracked
 * mini-boss flips from alive → !alive. Green congratulatory
 * banner + the levelUp audio cue. Once per (boss-id, life),
 * cleared when the entity despawns so a re-spawned boss can
 * be killed (and banner-ed) again.
 */
export function BossDefeatBanner({ enemies }: BossDefeatBannerProps) {
  const alivePrevRef = useRef<Map<string, boolean>>(new Map());
  const reportedRef = useRef<Set<string>>(new Set());
  const lastSampleAtRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const [banner, setBanner] = useState<{ key: number; name: string } | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    const now = performance.now();
    if (now - lastSampleAtRef.current < SAMPLE_THROTTLE_MS) return;
    lastSampleAtRef.current = now;

    const prev = alivePrevRef.current;
    const next = new Map<string, boolean>();
    const liveIds = new Set<string>();
    for (const enemy of Object.values(enemies)) {
      if (!enemy.isMiniBoss) continue;
      liveIds.add(enemy.id);
      next.set(enemy.id, enemy.isAlive);
      const wasAlive = prev.get(enemy.id);
      if (wasAlive === true && !enemy.isAlive && !reportedRef.current.has(enemy.id)) {
        reportedRef.current.add(enemy.id);
        if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
        seqRef.current += 1;
        setBanner({ key: seqRef.current, name: enemy.name });
        playCue('levelUp');
        timeoutRef.current = window.setTimeout(() => {
          setBanner(null);
          timeoutRef.current = null;
        }, BANNER_DURATION_MS);
      }
    }
    alivePrevRef.current = next;
    // Clear "reported" entries for despawned bosses so a re-spawn
    // can re-trigger the banner.
    for (const id of reportedRef.current) {
      if (!liveIds.has(id)) reportedRef.current.delete(id);
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
    <div
      className="boss-defeat-banner"
      key={banner.key}
      aria-live="polite"
      data-testid="boss-defeat-banner"
    >
      <span className="boss-defeat-banner__eyebrow">Defeated</span>
      <strong className="boss-defeat-banner__name">{banner.name}</strong>
    </div>
  );
}
