import { useEffect, useRef, useState } from 'react';

type HurtVignetteProps = {
  health: number;
};

/**
 * Brief red vignette at screen edges when the player's health
 * drops. Watches `health` for downward changes, triggers a
 * fade-in / fade-out, and adapts intensity to how much HP was
 * lost in the tick.
 *
 * Pure CSS overlay (radial-gradient at the edges), no Three.js
 * cost. Lives in the HUD layer so it sits above the canvas.
 */
export function HurtVignette({ health }: HurtVignetteProps) {
  const lastHealthRef = useRef<number>(health);
  const [tint, setTint] = useState({ key: 0, intensity: 0 });

  useEffect(() => {
    const prev = lastHealthRef.current;
    if (health < prev) {
      const loss = prev - health;
      // Scale intensity by hit size; 1 HP barely tints, 50+
      // HP flashes bright.
      const intensity = Math.min(0.85, 0.18 + loss * 0.012);
      setTint((t) => ({ key: t.key + 1, intensity }));
    }
    lastHealthRef.current = health;
  }, [health]);

  if (tint.intensity === 0) return null;
  return (
    <div
      key={tint.key}
      className="hurt-vignette"
      aria-hidden="true"
      style={{ ['--vignette-intensity' as string]: tint.intensity }}
    />
  );
}
