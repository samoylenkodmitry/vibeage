import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { StatusEffect } from '../../../../packages/protocol/messages';
import { effectRemainingMs } from '../hud/effectMeta';

/**
 * Persistent on-entity VFX for active buffs/debuffs. Every timed status effect a
 * skill applies (burn, poison, bleed, freeze, slow, stun, shield, bless, …) gets
 * a continuous visual on the affected body, so you can read combat state at a
 * glance — not just from the HUD panel.
 *
 * Data-driven: the effect TYPE picks an archetype (rising motes / falling drips /
 * orbiting stars / body shell / ground ring) + colour. Module-level geometry is
 * shared; each aura owns one material, disposed on unmount.
 */

type Archetype = 'rising' | 'falling' | 'orbit' | 'shell' | 'ring';

const EFFECT_VFX: Record<string, { archetype: Archetype; color: string }> = {
  burn: { archetype: 'rising', color: '#ff6a1a' },
  poison: { archetype: 'rising', color: '#22c55e' },
  bless: { archetype: 'rising', color: '#fde68a' },
  speed_boost: { archetype: 'rising', color: '#67e8f9' },
  evasion: { archetype: 'rising', color: '#e5e7eb' },
  dot: { archetype: 'falling', color: '#ef4444' },
  stun: { archetype: 'orbit', color: '#fde047' },
  shield: { archetype: 'shell', color: '#38bdf8' },
  invuln: { archetype: 'shell', color: '#facc15' },
  invisible: { archetype: 'shell', color: '#cbd5e1' },
  freeze: { archetype: 'shell', color: '#a5f3fc' },
  waterWeakness: { archetype: 'shell', color: '#38bdf8' },
  slow: { archetype: 'ring', color: '#60a5fa' },
  taunt: { archetype: 'ring', color: '#ef4444' },
};
const MAX_AURAS = 5; // bound per-entity cost if many effects stack at once

const MOTE_GEO = new THREE.SphereGeometry(1, 6, 6);
const SHELL_GEO = new THREE.SphereGeometry(1, 16, 12);
const RING_GEO = new THREE.RingGeometry(0.74, 0.94, 32);
const RISE = Array.from({ length: 6 }, (_, i) => ({ a: (i / 6) * Math.PI * 2, ph: i / 6, sp: 0.5 + (i % 3) * 0.12 }));
const ORBIT = Array.from({ length: 4 }, (_, i) => ({ a: (i / 4) * Math.PI * 2 }));

export type StatusAura = { id: string; archetype: Archetype; color: string; endsAt?: number };

/** Pick the visualized, still-active effects to render (capped). Pure so the
 *  type→archetype mapping + expiry filter can be unit-tested. */
export function selectStatusAuras(effects: StatusEffect[] | undefined, now: number = Date.now()): StatusAura[] {
  const auras: StatusAura[] = [];
  for (const e of effects ?? []) {
    const vfx = EFFECT_VFX[e.type];
    if (!vfx || (effectRemainingMs(e, now) ?? 1) <= 0) continue;
    auras.push({ id: e.id, archetype: vfx.archetype, color: vfx.color, endsAt: e.startTimeTs && e.durationMs ? e.startTimeTs + e.durationMs : undefined });
    if (auras.length >= MAX_AURAS) break;
  }
  return auras;
}

export function StatusEffectsVfx({ effects, height }: { effects: StatusEffect[] | undefined; height: number }) {
  const auras = selectStatusAuras(effects);
  if (auras.length === 0) return null;
  return (
    <>
      {auras.map((a) => (
        <EffectAura key={a.id} archetype={a.archetype} color={a.color} height={height} endsAt={a.endsAt} />
      ))}
    </>
  );
}

function EffectAura({ archetype, color, height, endsAt }: { archetype: Archetype; color: string; height: number; endsAt?: number }) {
  const root = useRef<THREE.Group>(null);
  const additive = archetype !== 'shell';
  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    transparent: true, depthWrite: false, side: archetype === 'ring' ? THREE.DoubleSide : THREE.FrontSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  }), [additive, archetype]);
  useEffect(() => { mat.color.set(color); }, [color, mat]);
  useEffect(() => () => mat.dispose(), [mat]);

  const bodyMidY = height * 0.5;
  const shellR = Math.max(0.55, height * 0.46);

  useFrame(({ clock }) => {
    const g = root.current; if (!g) return;
    if (endsAt !== undefined && Date.now() > endsAt) { g.visible = false; return; }
    g.visible = true;
    const t = clock.elapsedTime;
    if (archetype === 'shell') {
      const s = shellR * (1 + Math.sin(t * 3) * 0.03);
      g.scale.setScalar(s);
      mat.opacity = 0.16 + Math.sin(t * 3) * 0.05;
      return;
    }
    if (archetype === 'ring') {
      g.rotation.z = t * 1.4;
      mat.opacity = 0.5 + Math.sin(t * 4) * 0.12;
      return;
    }
    if (archetype === 'orbit') {
      mat.opacity = 0.85;
      g.children.forEach((c, i) => {
        const o = ORBIT[i]; if (!o) return;
        const ang = t * 3 + o.a;
        c.position.set(Math.cos(ang) * 0.42, Math.sin(t * 6 + i) * 0.06, Math.sin(ang) * 0.42);
      });
      return;
    }
    // rising / falling motes loop along the body height.
    mat.opacity = 0.8;
    g.children.forEach((c, i) => {
      const m = RISE[i]; if (!m) return;
      let ph = (t * m.sp + m.ph) % 1;
      if (archetype === 'falling') ph = 1 - ph;
      const rr = 0.32 * (0.6 + 0.4 * Math.sin(t * 2 + m.a));
      c.position.set(Math.cos(m.a + t) * rr, 0.15 + ph * (height - 0.2), Math.sin(m.a + t) * rr);
      c.scale.setScalar(0.09 * (0.6 + (1 - Math.abs(ph - 0.5) * 2) * 0.7));
    });
  });

  if (archetype === 'shell') {
    return <group ref={root} position={[0, bodyMidY, 0]}><mesh geometry={SHELL_GEO} material={mat} /></group>;
  }
  if (archetype === 'ring') {
    return <group ref={root} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}><mesh geometry={RING_GEO} material={mat} /></group>;
  }
  const count = archetype === 'orbit' ? ORBIT.length : RISE.length;
  const y = archetype === 'orbit' ? height + 0.5 : 0;
  return (
    <group ref={root} position={[0, y, 0]}>
      {Array.from({ length: count }, (_, i) => (<mesh key={i} geometry={MOTE_GEO} material={mat} />))}
    </group>
  );
}
