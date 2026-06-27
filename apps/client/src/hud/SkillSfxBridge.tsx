import { useEffect, useRef } from 'react';
import { CastState } from '../../../../packages/protocol/messages';
import type { VisibleCast } from '../gameTypes';
import { playSpatial } from '../audio/spatial';
import { castVoice, impactVoice } from '../audio/spatialVoices';
import { skillThemeFor } from '../vfx/skillThemeConfig';

/**
 * Plays element-flavoured skill sounds at their world position: a soft windup
 * when a cast starts, and a satisfying impact (fire boom, ice shatter, …) where
 * it lands — both routed through playSpatial so distance + pan match the scene.
 * Headless; watches the same cast state the VFX renders from.
 */
export function SkillSfxBridge({ casts }: { casts: Record<string, VisibleCast> }) {
  const castedRef = useRef<Set<string>>(new Set());
  const impactedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const [id, cast] of Object.entries(casts)) {
      const snap = cast.snapshot;
      // Basic attacks already get a positional hit via CombatSfxBridge — a
      // windup+impact on every swing would just be noise.
      if (snap.skillId === 'basicAttack') continue;
      const element = skillThemeFor(snap.skillId).element;
      if (snap.state === CastState.Casting && !castedRef.current.has(id)) {
        castedRef.current.add(id);
        playSpatial((ctx, dest) => castVoice(element, ctx, dest), snap.pos.x, snap.pos.z);
      }
      if (snap.state === CastState.Impact && !impactedRef.current.has(id)) {
        impactedRef.current.add(id);
        playSpatial((ctx, dest) => impactVoice(element, ctx, dest), snap.pos.x, snap.pos.z);
      }
    }
    pruneStale(castedRef.current, casts);
    pruneStale(impactedRef.current, casts);
  }, [casts]);

  return null;
}

function pruneStale(seen: Set<string>, casts: Record<string, VisibleCast>): void {
  if (seen.size <= Object.keys(casts).length + 32) return;
  for (const id of seen) {
    if (!(id in casts)) seen.delete(id);
  }
}
