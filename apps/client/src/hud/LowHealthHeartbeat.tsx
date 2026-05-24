import { useEffect } from 'react';
import { playCue } from '../sfx';

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

  return null;
}
