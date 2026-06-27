import { useEffect, useRef } from 'react';
import { CastState } from '../../../../packages/protocol/messages';
import type { VisibleCast } from '../gameTypes';
import { playSampleAt } from '../audio/samples';
import { impactGainFor, impactSamplesFor } from '../audio/sampleMap';
import { skillThemeFor } from '../vfx/skillThemeConfig';

/**
 * Plays an element-flavoured impact (Kenney CC0 samples) where a spell lands —
 * fire explodes, ice shatters glass, holy rings a bell, poison thuds soft,
 * arcane zaps — positioned in the world via playSampleAt. Headless; watches the
 * same cast state the VFX renders from. Basic attacks are skipped (their hit
 * already plays via CombatSfxBridge).
 */
export function SkillSfxBridge({ casts }: { casts: Record<string, VisibleCast> }) {
  const impactedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const [id, cast] of Object.entries(casts)) {
      const snap = cast.snapshot;
      if (snap.skillId === 'basicAttack') continue;
      if (snap.state === CastState.Impact && !impactedRef.current.has(id)) {
        impactedRef.current.add(id);
        const element = skillThemeFor(snap.skillId).element;
        playSampleAt(impactSamplesFor(element), snap.pos.x, snap.pos.z, impactGainFor(element));
      }
    }
    if (impactedRef.current.size > Object.keys(casts).length + 32) {
      for (const id of impactedRef.current) {
        if (!(id in casts)) impactedRef.current.delete(id);
      }
    }
  }, [casts]);

  return null;
}
