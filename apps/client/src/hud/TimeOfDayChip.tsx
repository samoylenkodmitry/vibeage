import { useEffect, useState } from 'react';
import { computeDayPhase } from '../timeOfDay';

type Slice = { label: string; icon: string };

/**
 * Map normalized phase [0, 1) → friendly slice. Boundaries match
 * the KEYFRAMES in timeOfDay.ts:
 *   0.00 dawn → 0.32 day → 0.70 dusk → 0.86 night → 1 wraps to dawn.
 *
 * Wide ranges so a phase wobbling around a boundary doesn't flicker.
 */
function phaseToSlice(phase: number): Slice {
  if (phase < 0.18) return { label: 'Dawn', icon: '🌅' };
  if (phase < 0.62) return { label: 'Day', icon: '☀️' };
  if (phase < 0.82) return { label: 'Dusk', icon: '🌇' };
  return { label: 'Night', icon: '🌙' };
}

/**
 * Tiny HUD chip showing the current game time-of-day. Sampled from
 * the same computeDayPhase used by WorldEnvironment so the chip and
 * the sky always agree. Updates once per second — phase moves
 * slowly enough that finer cadence wastes renders.
 */
export function TimeOfDayChip() {
  const [phase, setPhase] = useState(() => computeDayPhase(Date.now()).phase);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPhase(computeDayPhase(Date.now()).phase);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const slice = phaseToSlice(phase);
  return (
    <span className="time-of-day-chip" aria-label={`Time of day: ${slice.label}`}>
      <span aria-hidden="true">{slice.icon}</span>
      <span>{slice.label}</span>
    </span>
  );
}
