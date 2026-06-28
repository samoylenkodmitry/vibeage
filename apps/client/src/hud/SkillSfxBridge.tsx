import { useEffect, useRef } from 'react';
import { CastState } from '../../../../packages/protocol/messages';
import type { VisibleCast } from '../gameTypes';
import { playSampleLayersAt } from '../audio/samples';
import { impactLayersFor, travelLayersFor, windupLayersFor } from '../audio/skillAudio';

/**
 * Three-phase, per-skill spell audio — headless, watching the same cast state
 * the VFX render from. Every cast moves through up to three distinct sounds,
 * each positioned in the world via the spatial bus:
 *
 *   - CASTING   → a sampled energy charge (element-pitched, per-skill detune)
 *   - TRAVELING → an in-flight whoosh sample (projectiles only)
 *   - IMPACT    → layered landing samples (element + heavy sub-boom; heals sparkle)
 *
 * A bitmask per cast id fires each phase exactly once. Basic attacks are skipped
 * (their hit already plays via CombatSfxBridge).
 */
const PHASE_CAST = 1;
const PHASE_TRAVEL = 2;
const PHASE_IMPACT = 4;

export function SkillSfxBridge({ casts }: { casts: Record<string, VisibleCast> }) {
  const phasesRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const phases = phasesRef.current;
    for (const [id, cast] of Object.entries(casts)) {
      const snap = cast.snapshot;
      if (snap.skillId === 'basicAttack') continue;
      const done = phases.get(id) ?? 0;

      if (snap.state === CastState.Casting && !(done & PHASE_CAST)) {
        phases.set(id, done | PHASE_CAST);
        playSampleLayersAt(windupLayersFor(snap.skillId), snap.pos.x, snap.pos.z);
      } else if (snap.state === CastState.Traveling && !(done & PHASE_TRAVEL)) {
        phases.set(id, done | PHASE_TRAVEL);
        playSampleLayersAt(travelLayersFor(snap.skillId), snap.pos.x, snap.pos.z);
      } else if (snap.state === CastState.Impact && !(done & PHASE_IMPACT)) {
        phases.set(id, done | PHASE_IMPACT);
        playSampleLayersAt(impactLayersFor(snap.skillId), snap.pos.x, snap.pos.z);
      }
    }

    // Prune ids that have dropped out of the cast set so the map can't grow.
    if (phases.size > Object.keys(casts).length + 32) {
      for (const id of phases.keys()) {
        if (!(id in casts)) phases.delete(id);
      }
    }
  }, [casts]);

  return null;
}
