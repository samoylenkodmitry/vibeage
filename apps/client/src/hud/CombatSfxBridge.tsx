import { useEffect, useRef } from 'react';
import { playCue } from '../sfx';
import type { EnemyEntity, VisualEvent } from '../gameTypes';

type CombatSfxBridgeProps = {
  enemies: Record<string, EnemyEntity>;
  visualEvents: Record<string, VisualEvent>;
};

/**
 * Headless component that fires SFX cues on combat state
 * transitions:
 *
 *   - 'kill' when any enemy flips alive → !alive
 *   - 'hit' when a new 'damage' visual event appears (capped so a
 *     swarm doesn't blow up the audio graph)
 *
 * Watches the shared client state instead of plumbing callbacks
 * through every hit path. No DOM output.
 */
const KILL_COOLDOWN_MS = 80;
const HIT_COOLDOWN_MS = 50;

export function CombatSfxBridge({ enemies, visualEvents }: CombatSfxBridgeProps) {
  const alivePrevRef = useRef<Map<string, boolean>>(new Map());
  const seenVisualIdsRef = useRef<Set<string>>(new Set());
  const lastKillAtRef = useRef(0);
  const lastHitAtRef = useRef(0);

  useEffect(() => {
    const now = performance.now();
    const prev = alivePrevRef.current;
    const next = new Map<string, boolean>();
    for (const [id, enemy] of Object.entries(enemies)) {
      next.set(id, enemy.isAlive);
      const wasAlive = prev.get(id);
      if (wasAlive === true && !enemy.isAlive && now - lastKillAtRef.current > KILL_COOLDOWN_MS) {
        playCue('kill');
        lastKillAtRef.current = now;
      }
    }
    alivePrevRef.current = next;
  }, [enemies]);

  useEffect(() => {
    const now = performance.now();
    const seen = seenVisualIdsRef.current;
    for (const [id, event] of Object.entries(visualEvents)) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (event.kind === 'damage' && now - lastHitAtRef.current > HIT_COOLDOWN_MS) {
        playCue('hit');
        lastHitAtRef.current = now;
      }
    }
    // Prune the seen-set as visualEvents drop out so the Set
    // doesn't grow unbounded.
    if (seen.size > Object.keys(visualEvents).length + 32) {
      const live = new Set(Object.keys(visualEvents));
      for (const id of seen) {
        if (!live.has(id)) seen.delete(id);
      }
    }
  }, [visualEvents]);

  return null;
}
