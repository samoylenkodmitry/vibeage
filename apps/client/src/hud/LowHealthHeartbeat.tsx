import { useEffect, useRef } from 'react';
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
  const intervalRef = useRef<number | null>(null);
  const isLow = isAlive && maxHealth > 0 && health / maxHealth <= LOW_HEALTH_THRESHOLD;

  useEffect(() => {
    if (!isLow) {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    if (intervalRef.current !== null) return;
    // Fire immediately so the player notices the moment they
    // cross the threshold, then again on the interval.
    playCue('lowHealth');
    intervalRef.current = window.setInterval(() => playCue('lowHealth'), PULSE_INTERVAL_MS);
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isLow]);

  return null;
}
