import { useEffect, type CSSProperties } from 'react';
import { playCue } from '../audio/cues';

type LowHealthHeartbeatProps = {
  health: number;
  maxHealth: number;
  isAlive: boolean;
};

const LOW_HEALTH_THRESHOLD = 0.25;
const PULSE_INTERVAL_MS = 1500;

/**
 * Diegetic urgency: when player HP drops to ≤25% (and they're
 * still alive), play a quiet double-thump every 1.5s. Stops
 * the instant they heal back above the threshold or die.
 *
 * Watches health ratio rather than raw HP so the cue stays
 * proportional across level-ups + maxHealth changes.
 */
export function LowHealthHeartbeat({ health, maxHealth, isAlive }: LowHealthHeartbeatProps) {
  const isLow = isAlive && maxHealth > 0 && health / maxHealth <= LOW_HEALTH_THRESHOLD;

  useEffect(() => {
    if (!isLow) return;
    // Fire immediately so the player notices the moment they
    // cross the threshold, then again on the interval. React's
    // standard cleanup handles teardown when isLow flips back.
    playCue('lowHealth');
    const id = window.setInterval(() => playCue('lowHealth'), PULSE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [isLow]);

  // Visual partner to the heartbeat audio: a pulsing red screen-edge
  // vignette that deepens the closer HP is to zero. `--low-health` (0→1)
  // scales the opacity in CSS; the keyframe pulse runs only while low.
  if (!isLow) return null;
  const ratio = maxHealth > 0 ? health / maxHealth : 1;
  const severity = Math.max(0, Math.min(1, 1 - ratio / LOW_HEALTH_THRESHOLD));
  return (
    <div
      className="low-health-vignette"
      aria-hidden="true"
      style={{ ['--low-health' as string]: severity.toFixed(3) } as CSSProperties}
    />
  );
}
