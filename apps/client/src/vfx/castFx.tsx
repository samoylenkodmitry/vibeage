import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SpellElement } from './spellFx';

/**
 * Element-distinct cast windup — a "gathering" layer that builds around the
 * charge core while a spell is being cast, so fire/ice/arcane/poison/holy read
 * differently during the wind-up (not just at impact):
 *   fire    embers spiral inward as the cast fills
 *   ice     frost spikes crystallize around the core, growing with progress
 *   arcane  runes/sparks orbit the core
 *   poison  bubbles rise and converge
 *   holy    light motes descend into the core
 *
 * Module-level geometry (shared buffers); one mote material built once + disposed.
 */

const MOTE_GEO = new THREE.SphereGeometry(1, 6, 6);
const SPIKE_GEO = (() => { const g = new THREE.ConeGeometry(0.13, 0.8, 4); g.translate(0, 0.4, 0); return g; })();
const MOTES = Array.from({ length: 10 }, (_, i) => ({ a: (i / 10) * Math.PI * 2, ph: (i % 4) * 0.6 }));

type ChargeMode = 'inward' | 'orbit' | 'rise' | 'descend' | 'spike';
const CHARGE_MODE: Record<SpellElement, ChargeMode> = {
  fire: 'inward', ice: 'spike', arcane: 'orbit', poison: 'rise', holy: 'descend',
};

export function ElementCharge({ element, glow, progress }: { element: SpellElement; glow: string; progress: number }) {
  const mode = CHARGE_MODE[element];
  const group = useRef<THREE.Group>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  const mat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  useEffect(() => { mat.color.set(glow); }, [glow, mat]);
  useEffect(() => () => mat.dispose(), [mat]);

  useFrame(({ clock }) => {
    const g = group.current; if (!g) return;
    const time = clock.elapsedTime;
    const p = progressRef.current;
    g.children.forEach((c, i) => {
      const m = MOTES[i]; if (!m) return;
      if (mode === 'spike') {
        // Frost crystals forming in a ring around the core, growing as it fills.
        const s = 0.3 + p * 1.3;
        c.position.set(Math.cos(m.a) * 0.22, -0.18, Math.sin(m.a) * 0.22);
        c.scale.set(0.7, s + Math.sin(time * 6 + m.ph) * 0.05, 0.7);
        return;
      }
      const mote = 0.07 + p * 0.05;
      c.scale.setScalar(mote);
      if (mode === 'orbit') {
        const ang = time * 1.8 + m.a;
        c.position.set(Math.cos(ang) * 0.7, Math.sin(time * 3 + m.ph) * 0.18, Math.sin(ang) * 0.7);
      } else if (mode === 'rise') {
        const ph = (time * 0.9 + i * 0.37) % 1;
        const rr = 0.55 * (1 - ph);
        c.position.set(Math.cos(m.a) * rr, -0.55 + ph * 0.85, Math.sin(m.a) * rr);
      } else if (mode === 'descend') {
        const ph = (time * 0.9 + i * 0.37) % 1;
        const rr = 0.5 * (1 - ph);
        c.position.set(Math.cos(m.a) * rr, 1.3 - ph * 1.3, Math.sin(m.a) * rr);
      } else { // inward (fire): embers spiral toward the core as the cast fills
        const sw = time * 3 + m.a;
        const rr = 0.75 * (1 - p * 0.7) * (0.5 + (i % 3) * 0.25);
        c.position.set(Math.cos(sw) * rr, Math.sin(time * 4 + m.ph) * 0.12, Math.sin(sw) * rr);
      }
    });
  });

  const isSpike = mode === 'spike';
  return (
    <group ref={group}>
      {MOTES.map((_, i) => (
        <mesh key={i} geometry={isSpike ? SPIKE_GEO : MOTE_GEO} material={mat} />
      ))}
    </group>
  );
}
