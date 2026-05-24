import { useEffect, useRef } from 'react';
import { playCue } from '../sfx';

type LifeCueBridgeProps = {
  isAlive: boolean;
};

/**
 * Fires 'death' on alive → !alive and 'respawn' on !alive → alive
 * for the local player. Headless — no DOM. The initial sample
 * after mount is treated as baseline so a reconnect snapshot at
 * the same alive state stays silent.
 *
 * Sibling to [[CombatSfxBridge]] (kill/hit), [[HurtVignette]]
 * (hurt cue). Keeping each transition in its own small watcher
 * is intentional: each lives where the relevant state already
 * flows, no callback plumbing.
 */
export function LifeCueBridge({ isAlive }: LifeCueBridgeProps) {
  const prevRef = useRef<boolean | null>(null);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = isAlive;
    if (prev === null) return;
    if (prev && !isAlive) playCue('death');
    else if (!prev && isAlive) playCue('respawn');
  }, [isAlive]);
  return null;
}
