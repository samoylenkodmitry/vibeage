import { useEffect, useRef } from 'react';
import type { PlayerEntity } from '../gameTypes';

type PageTitleProps = {
  player: PlayerEntity | null;
};

const BASE_TITLE = 'VibeAge';
const TITLE_THROTTLE_MS = 1000;

/**
 * Updates document.title with a glanceable summary of the local
 * player's state — useful when the game is in a background tab.
 *
 * Throttled to ~1s so HP-per-tick ticking doesn't churn the title
 * bar every frame. Resets to the base title on unmount so e.g. the
 * lobby + post-game screens don't carry stale stats.
 */
export function PageTitle({ player }: PageTitleProps) {
  const lastWriteRef = useRef(0);

  useEffect(() => {
    if (!player) {
      if (typeof document !== 'undefined') document.title = BASE_TITLE;
      return;
    }
    const now = performance.now();
    if (now - lastWriteRef.current < TITLE_THROTTLE_MS) return;
    lastWriteRef.current = now;
    const name = player.name || 'Hero';
    const lv = player.level ?? 1;
    const hp = Math.max(0, Math.round(player.health));
    const maxHp = Math.max(1, Math.round(player.maxHealth));
    const deadSuffix = player.isAlive ? '' : ' †';
    if (typeof document !== 'undefined') {
      document.title = `${name} Lv${lv} (${hp}/${maxHp})${deadSuffix} — ${BASE_TITLE}`;
    }
  }, [player]);

  useEffect(
    () => () => {
      if (typeof document !== 'undefined') document.title = BASE_TITLE;
    },
    [],
  );

  return null;
}
