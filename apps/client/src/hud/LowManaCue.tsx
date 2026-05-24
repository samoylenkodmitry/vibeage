import { useEffect, useRef } from 'react';
import { playCue } from '../sfx';

type LowManaCueProps = {
  mana: number;
  maxMana: number;
  isAlive: boolean;
};

const LOW_MANA_THRESHOLD = 0.20;

/**
 * One-shot 'lowMana' cue when mana ratio crosses BELOW the
 * threshold. Re-arms when ratio goes back above. Unlike the
 * [[LowHealthHeartbeat]] which repeats every 1.5s, this fires
 * once per crossing — mana drops are routine for casters, and
 * a repeating cue would become noise.
 *
 * Skips classes/specs with maxMana=0 (martial builds) so they
 * never hear it.
 */
export function LowManaCue({ mana, maxMana, isAlive }: LowManaCueProps) {
  const wasLowRef = useRef(false);

  useEffect(() => {
    if (!isAlive || maxMana <= 0) {
      wasLowRef.current = false;
      return;
    }
    const isLow = mana / maxMana <= LOW_MANA_THRESHOLD;
    if (isLow && !wasLowRef.current) {
      playCue('lowMana');
    }
    wasLowRef.current = isLow;
  }, [mana, maxMana, isAlive]);

  return null;
}
