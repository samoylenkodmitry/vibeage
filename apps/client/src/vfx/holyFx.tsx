import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GroundShockwave } from './spellFx';

/**
 * Holy "strike" family (Smite / Holy Light) — a beam of light is CALLED DOWN.
 * Replaces the old static fading cylinder with a telegraphed, dynamic smite:
 * during the cast a radiant beam reaches down from the heavens toward the target
 * (so the player sees it coming, not a one-frame flash), then it SLAMS into a
 * burst — a flaring pillar, a ground flash, light rays raking out along the
 * ground, an expanding shock ring and rising holy motes.
 *
 * Module-level geometry (shared buffers); materials per-instance, disposed on
 * unmount.
 */
const BEAM_GEO = new THREE.CylinderGeometry(0.32, 0.5, 1, 16, 1, true); // unit height, scaled in Y
const PILLAR_GEO = new THREE.CylinderGeometry(0.55, 1.05, 9, 22, 1, true);
const BALL_GEO = new THREE.SphereGeometry(1, 14, 14);
// Ground ray: a flat sliver pointing +X (laid along the ground), grown outward.
const RAY_GEO = (() => { const g = new THREE.PlaneGeometry(1, 0.16); g.translate(0.5, 0, 0); return g; })();
const RAYS = 10;
const MOTES = Array.from({ length: 12 }, (_, i) => ({ az: i * 2.399963, sp: 0.7 + (i % 3) * 0.22, rise: 0.8 + ((i * 5) % 4) * 0.12 }));
const SKY_Y = 11; // where the light gathers, high above the target
const STRIKE_DUR = 0.85;

/** Cast windup — light gathers high above the target and a beam reaches DOWN to
 *  the ground as the cast charges (the heavens opening). */
export function StrikeCast({ progress, color, accent }: { progress: number; color: string; accent: string }) {
  const pRef = useRef(progress);
  pRef.current = progress;
  const beam = useRef<THREE.Mesh>(null);
  const orb = useRef<THREE.Mesh>(null);
  const beamMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), []);
  const orbMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  useEffect(() => { beamMat.color.set(accent); orbMat.color.set(color); }, [color, accent, beamMat, orbMat]);
  useEffect(() => () => beamMat.dispose(), [beamMat]);
  useEffect(() => () => orbMat.dispose(), [orbMat]);
  useFrame(({ clock }) => {
    const p = pRef.current;
    const pulse = 0.85 + Math.sin(clock.elapsedTime * 8.0) * 0.15;
    // Beam grows downward from the sky: top stays at SKY_Y, bottom reaches the ground.
    const len = 1.2 + p * (SKY_Y - 1.0);
    if (beam.current) {
      beam.current.scale.set(0.32 + p * 0.42, len, 0.32 + p * 0.42);
      beam.current.position.y = SKY_Y - len / 2;
      beamMat.opacity = (0.14 + p * 0.4) * pulse;
    }
    if (orb.current) {
      orb.current.scale.setScalar((0.4 + p * 0.95) * pulse);
      orbMat.opacity = 0.45 + p * 0.4;
    }
  });
  return (
    <group>
      <mesh ref={beam} geometry={BEAM_GEO} material={beamMat} />
      <mesh ref={orb} geometry={BALL_GEO} material={orbMat} position={[0, SKY_Y, 0]} />
    </group>
  );
}

/** Impact — the beam SLAMS down: a flaring pillar, a ground flash, light rays
 *  raking out along the ground, an expanding shock ring and rising holy motes. */
export function StrikeImpact({ color, accent }: { color: string; accent: string }) {
  const pillar = useRef<THREE.Mesh>(null);
  const flash = useRef<THREE.Mesh>(null);
  const rays = useRef<THREE.Group>(null);
  const motes = useRef<THREE.Group>(null);
  const start = useRef<number | null>(null);

  const pillarMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), []);
  const flashMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const rayMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), []);
  const moteMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  useEffect(() => { pillarMat.color.set(accent); flashMat.color.set('#fffbe8'); rayMat.color.set(color); moteMat.color.set(accent); }, [color, accent, pillarMat, flashMat, rayMat, moteMat]);
  useEffect(() => () => pillarMat.dispose(), [pillarMat]);
  useEffect(() => () => flashMat.dispose(), [flashMat]);
  useEffect(() => () => rayMat.dispose(), [rayMat]);
  useEffect(() => () => moteMat.dispose(), [moteMat]);

  useFrame(({ clock }) => {
    if (start.current === null) start.current = clock.elapsedTime;
    const age = clock.elapsedTime - start.current;
    const t = Math.min(1, age / STRIKE_DUR);
    if (age >= STRIKE_DUR) {
      for (const rf of [pillar, flash, rays, motes]) if (rf.current) rf.current.visible = false;
      return;
    }
    // Pillar: a hard bright column at the strike, flaring wide then fading.
    if (pillar.current) {
      const w = 0.7 + t * 0.5;
      pillar.current.scale.set(w, 1, w);
      pillarMat.opacity = Math.max(0, (1 - t)) * 0.72 * (age < 0.04 ? age / 0.04 : 1);
    }
    // Ground flash pop.
    if (flash.current) flash.current.scale.setScalar(0.6 + t * 2.6);
    flashMat.opacity = Math.max(0, (1 - t) * (1 - t)) * 0.95 * (age < 0.05 ? age / 0.05 : 1);
    // Light rays rake outward along the ground, then fade.
    if (rays.current) rays.current.children.forEach((c, i) => {
      const len = 1.2 + t * (3.6 + (i % 3) * 0.6);
      c.scale.set(len, 1, 1);
    });
    rayMat.opacity = Math.max(0, (1 - t)) * 0.8 * (age < 0.05 ? age / 0.05 : 1);
    // Holy motes rise and fade.
    moteMat.opacity = (1 - t);
    if (motes.current) motes.current.children.forEach((c, i) => {
      const m = MOTES[i]; if (!m) return;
      const rr = 1.2 * m.sp * t;
      c.position.set(Math.cos(m.az) * rr, 0.2 + 3.4 * m.rise * t, Math.sin(m.az) * rr);
      c.scale.setScalar(Math.max(0.02, 0.16 * (1 - t * 0.6)));
    });
  });

  return (
    <group>
      <GroundShockwave color={color} accent={accent} size={5.0} durationMs={620} />
      <mesh ref={pillar} geometry={PILLAR_GEO} material={pillarMat} position={[0, 4.0, 0]} />
      <mesh ref={flash} geometry={BALL_GEO} material={flashMat} position={[0, 0.3, 0]} />
      <group ref={rays} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        {Array.from({ length: RAYS }).map((_, i) => {
          const a = (i / RAYS) * Math.PI * 2;
          return <mesh key={i} geometry={RAY_GEO} material={rayMat} rotation={[0, 0, a]} />;
        })}
      </group>
      <group ref={motes}>{MOTES.map((_, i) => (<mesh key={i} geometry={BALL_GEO} material={moteMat} />))}</group>
    </group>
  );
}
