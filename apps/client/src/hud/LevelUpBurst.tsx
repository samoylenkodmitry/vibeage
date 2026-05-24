import { useEffect, useRef, useState } from 'react';

type LevelUpBurstProps = {
  level: number;
};

/**
 * Big centered "LEVEL UP" celebration when player.level ticks up.
 * Golden gradient text + radiating glow + 2 s auto-dismiss. Pure
 * HTML/CSS overlay — sits above the canvas, doesn't block input.
 *
 * Tracks the last-seen level so server resyncs at the same level
 * stay silent (no re-trigger from snapshot replay).
 */
export function LevelUpBurst({ level }: LevelUpBurstProps) {
  const lastLevelRef = useRef(level);
  const [burst, setBurst] = useState<{ key: number; level: number } | null>(null);

  useEffect(() => {
    const prev = lastLevelRef.current;
    if (level > prev) {
      setBurst({ key: (burst?.key ?? 0) + 1, level });
      const t = window.setTimeout(() => setBurst(null), 2400);
      lastLevelRef.current = level;
      return () => window.clearTimeout(t);
    }
    lastLevelRef.current = level;
    // burst intentionally read but not in deps — including it
    // would re-trigger every time we update local state.
  }, [level]);

  if (!burst) return null;
  return (
    <div className="level-up-burst" key={burst.key} aria-live="polite">
      <span className="level-up-burst__halo" aria-hidden="true" />
      <strong className="level-up-burst__title">LEVEL UP!</strong>
      <span className="level-up-burst__subtitle">You are now level {burst.level}</span>
    </div>
  );
}
