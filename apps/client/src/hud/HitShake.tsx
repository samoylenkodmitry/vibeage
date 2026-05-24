import { useEffect, useRef } from 'react';

type HitShakeProps = {
  health: number;
};

const SHAKE_THRESHOLD_HP = 15;
const SHAKE_DURATION_MS = 280;

/**
 * Cinematic screen shake when the player takes a heavy hit.
 * Watches `health` for downward deltas; if the loss exceeds
 * SHAKE_THRESHOLD_HP, toggles `.app-shell.is-shaking` for
 * SHAKE_DURATION_MS. The keyframes live in styles.css and use
 * a damped translateX/Y so the HUD/canvas wobble briefly without
 * losing layout.
 *
 * Sibling to [[HurtVignette]] — vignette handles every hit,
 * shake is reserved for the painful ones so it stays meaningful.
 */
export function HitShake({ health }: HitShakeProps) {
  const lastRef = useRef(health);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const prev = lastRef.current;
    lastRef.current = health;
    if (health >= prev) return;
    const loss = prev - health;
    if (loss < SHAKE_THRESHOLD_HP) return;

    const shell = document.querySelector<HTMLElement>('.app-shell');
    if (!shell) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    // Force a reflow between remove + add so a second heavy hit
    // during the previous shake restarts the keyframes instead of
    // being a no-op (already-classed element doesn't replay).
    shell.classList.remove('is-shaking');
    void shell.offsetWidth;
    shell.classList.add('is-shaking');
    timerRef.current = window.setTimeout(() => {
      shell.classList.remove('is-shaking');
      timerRef.current = null;
    }, SHAKE_DURATION_MS);
  }, [health]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      const shell = document.querySelector<HTMLElement>('.app-shell');
      shell?.classList.remove('is-shaking');
    },
    [],
  );

  return null;
}
