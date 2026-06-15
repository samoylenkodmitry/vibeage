import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SkillArchetype } from './skillThemeConfig';

/** Dispatches the support-archetype impact VFX (heal / buff / curse). */
export function ArchetypeImpact({ arch, glow, accent, radius }: { arch: SkillArchetype; glow: string; accent: string; radius: number }) {
  if (arch === 'heal') return <HealVfx glow={glow} accent={accent} radius={radius} />;
  if (arch === 'buff') return <BuffVfx glow={glow} accent={accent} />;
  return <CurseVfx glow={glow} accent={accent} radius={radius} />;
}

/**
 * ARCHETYPE VFX — one distinct effect per *support* archetype (heal / buff /
 * curse), dispatched from the skill's EFFECTS rather than its delivery. This is
 * the systemic fix for "every skill looks the same": dozens of heals, shields,
 * blessings and debuffs previously fell through to the generic damage impact (a
 * heal even rendered as a holy SMITE). Now a heal looks restorative, a buff
 * uplifting, a curse noxious — each tinted by the skill's own colour.
 *
 * Module-level geometry (shared); per-instance materials disposed on unmount;
 * each plays from mount (the Impact/cast moment) and self-culls when done.
 */
const RING = new THREE.RingGeometry(0.62, 0.84, 40);
const HEX = new THREE.RingGeometry(0.5, 0.78, 6);
const BALL = new THREE.SphereGeometry(1, 12, 12);
const SPARK = new THREE.SphereGeometry(1, 8, 8);
const BEAM = new THREE.CylinderGeometry(0.06, 0.06, 1, 8); // unit, scaled in Y

// Deterministic rising spark spread (golden-angle azimuth, per-spark radius/rise).
const SPARKS = Array.from({ length: 14 }, (_, i) => ({
  az: i * 2.399963, r: 0.4 + (i % 4) * 0.22, rise: 0.8 + ((i * 5) % 4) * 0.18, ph: i * 0.7,
}));

// ---- HEAL — a warm restorative bloom rises around the target ----------------
const HEAL_DUR = 1.05;
export function HealVfx({ glow, accent, radius }: { glow: string; accent: string; radius: number }) {
  const r = Math.max(0.9, radius * 0.7);
  const ring = useRef<THREE.Mesh>(null);
  const glowM = useRef<THREE.Mesh>(null);
  const sparks = useRef<THREE.Group>(null);
  const start = useRef<number | null>(null);
  const done = useRef(false);

  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), []);
  const glowMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const sparkMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  useEffect(() => { ringMat.color.set(accent); glowMat.color.set(glow); sparkMat.color.set('#eafff0'); }, [glow, accent, ringMat, glowMat, sparkMat]);
  useEffect(() => () => ringMat.dispose(), [ringMat]);
  useEffect(() => () => glowMat.dispose(), [glowMat]);
  useEffect(() => () => sparkMat.dispose(), [sparkMat]);

  useFrame(({ clock }) => {
    if (done.current) return;
    if (start.current === null) start.current = clock.elapsedTime;
    const t = Math.min(1, (clock.elapsedTime - start.current) / HEAL_DUR);
    if (t >= 1) { for (const m of [ring, glowM, sparks]) if (m.current) m.current.visible = false; done.current = true; return; }
    if (ring.current) ring.current.scale.setScalar(r * (0.5 + t * 1.6));
    ringMat.opacity = (1 - t) * 0.7;
    if (glowM.current) glowM.current.scale.setScalar(r * (0.7 + (1 - (1 - t) * (1 - t)) * 0.5));
    glowMat.opacity = Math.max(0, 1 - t * 1.4) * 0.5 * (t < 0.1 ? t / 0.1 : 1);
    sparkMat.opacity = (1 - t);
    if (sparks.current) sparks.current.children.forEach((c, i) => {
      const s = SPARKS[i]; if (!s) return;
      const a = clock.elapsedTime * 0.6 + s.ph;
      c.position.set(Math.cos(s.az + a * 0.3) * r * s.r * (0.6 + t * 0.6), 0.2 + s.rise * t * 2.4, Math.sin(s.az + a * 0.3) * r * s.r * (0.6 + t * 0.6));
      c.scale.setScalar(Math.max(0.02, 0.12 * (1 - t) * (0.7 + 0.3 * Math.sin(a * 4))));
    });
  });

  return (
    <group position={[0, 0.05, 0]}>
      <mesh ref={ring} geometry={RING} material={ringMat} rotation={[-Math.PI / 2, 0, 0]} />
      <mesh ref={glowM} geometry={BALL} material={glowMat} position={[0, 0.7, 0]} />
      <group ref={sparks}>{SPARKS.map((_, i) => (<mesh key={i} geometry={SPARK} material={sparkMat} />))}</group>
    </group>
  );
}

// ---- BUFF — an uplifting aura sweeps UP around the caster -------------------
const BUFF_DUR = 0.95;
const BUFF_STREAKS = 9;
export function BuffVfx({ glow, accent }: { glow: string; accent: string }) {
  const ring = useRef<THREE.Mesh>(null);
  const streaks = useRef<THREE.Group>(null);
  const flash = useRef<THREE.Mesh>(null);
  const start = useRef<number | null>(null);
  const done = useRef(false);

  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), []);
  const streakMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const flashMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  useEffect(() => { ringMat.color.set(accent); streakMat.color.set(glow); flashMat.color.set('#ffffff'); }, [glow, accent, ringMat, streakMat, flashMat]);
  useEffect(() => () => ringMat.dispose(), [ringMat]);
  useEffect(() => () => streakMat.dispose(), [streakMat]);
  useEffect(() => () => flashMat.dispose(), [flashMat]);

  useFrame(({ clock }) => {
    if (done.current) return;
    if (start.current === null) start.current = clock.elapsedTime;
    const t = Math.min(1, (clock.elapsedTime - start.current) / BUFF_DUR);
    if (t >= 1) { for (const m of [ring, streaks, flash]) if (m.current) m.current.visible = false; done.current = true; return; }
    // A ground ring rises as a band of light around the caster.
    if (ring.current) { ring.current.position.y = 0.05 + t * 2.2; ring.current.scale.setScalar(1.5 - t * 0.6); }
    ringMat.opacity = Math.max(0, 1 - t) * 0.8;
    // Vertical light streaks sweep up and fade.
    streakMat.opacity = Math.max(0, (1 - t)) * 0.7;
    if (streaks.current) streaks.current.children.forEach((c, i) => {
      const a = (i / BUFF_STREAKS) * Math.PI * 2;
      const h = 0.4 + t * 2.6;
      c.scale.set(1, h, 1);
      c.position.set(Math.cos(a) * 0.9, h / 2 + t * 0.4, Math.sin(a) * 0.9);
    });
    if (flash.current) flash.current.scale.setScalar(0.6 + t * 1.4);
    flashMat.opacity = Math.max(0, (1 - t) * (1 - t)) * 0.5 * (t < 0.12 ? t / 0.12 : 1);
  });

  return (
    <group position={[0, 0.0, 0]}>
      <mesh ref={ring} geometry={RING} material={ringMat} rotation={[-Math.PI / 2, 0, 0]} />
      <mesh ref={flash} geometry={BALL} material={flashMat} position={[0, 1.0, 0]} />
      <group ref={streaks}>{Array.from({ length: BUFF_STREAKS }).map((_, i) => (<mesh key={i} geometry={BEAM} material={streakMat} />))}</group>
    </group>
  );
}

// ---- CURSE — a noxious sigil sinks onto the target, motes spiral DOWN -------
const CURSE_DUR = 1.05;
const CURSE_MOTES = Array.from({ length: 12 }, (_, i) => ({ az: i * 2.399963, sp: 0.7 + (i % 3) * 0.25 }));
export function CurseVfx({ glow, accent, radius }: { glow: string; accent: string; radius: number }) {
  const r = Math.max(0.8, radius * 0.7);
  const sigil = useRef<THREE.Mesh>(null);
  const motes = useRef<THREE.Group>(null);
  const start = useRef<number | null>(null);
  const done = useRef(false);
  // Darken the skill colour so a curse reads sickly/oppressive, not bright.
  const dark = useMemo(() => new THREE.Color(glow).multiplyScalar(0.5), [glow]);

  const sigilMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), []);
  const moteMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  useEffect(() => { sigilMat.color.set(accent); moteMat.color.copy(dark); }, [accent, dark, sigilMat, moteMat]);
  useEffect(() => () => sigilMat.dispose(), [sigilMat]);
  useEffect(() => () => moteMat.dispose(), [moteMat]);

  useFrame(({ clock }) => {
    if (done.current) return;
    if (start.current === null) start.current = clock.elapsedTime;
    const t = Math.min(1, (clock.elapsedTime - start.current) / CURSE_DUR);
    if (t >= 1) { for (const m of [sigil, motes]) if (m.current) m.current.visible = false; done.current = true; return; }
    // Hex sigil snaps in, rotates, then sinks + fades into the target.
    if (sigil.current) {
      sigil.current.scale.setScalar(r * (1.4 - Math.min(1, t * 2.5) * 0.6));
      sigil.current.rotation.z += 0.05;
      sigil.current.position.y = 0.05 - Math.max(0, (t - 0.5)) * 0.6;
    }
    sigilMat.opacity = (t < 0.15 ? t / 0.15 : 1) * (1 - Math.max(0, (t - 0.4) / 0.6)) * 0.85;
    // Motes spiral DOWN onto the target (the opposite of a heal's rise).
    moteMat.opacity = (1 - t) * 0.9;
    if (motes.current) motes.current.children.forEach((c, i) => {
      const m = CURSE_MOTES[i]; if (!m) return;
      const spin = clock.elapsedTime * 2.2 * m.sp;
      const rr = r * (1.3 - t) * m.sp;
      c.position.set(Math.cos(m.az + spin) * rr, 2.4 * (1 - t) + 0.2, Math.sin(m.az + spin) * rr);
      c.scale.setScalar(Math.max(0.02, 0.13 * (0.5 + t * 0.5)));
    });
  });

  return (
    <group position={[0, 0.05, 0]}>
      <mesh ref={sigil} geometry={HEX} material={sigilMat} rotation={[-Math.PI / 2, 0, 0]} />
      <group ref={motes}>{CURSE_MOTES.map((_, i) => (<mesh key={i} geometry={SPARK} material={moteMat} />))}</group>
    </group>
  );
}
