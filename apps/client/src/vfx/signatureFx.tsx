import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FireCore } from './spellFx';

/**
 * Per-skill SIGNATURE mechanics — bespoke choreography for marquee spells so they
 * don't reuse a generic impact. Each plays its whole animation from mount (the
 * Impact state), self-culling when done.
 *
 *  - MeteorImpact: a flaming rock falls from the sky, tumbling with a fire wake,
 *    then slams into a fiery crater burst (embers + ground ring + smoke).
 *
 * Module-level geometry (shared buffers); materials per-instance, disposed on
 * unmount.
 */

const ROCK_GEO = new THREE.IcosahedronGeometry(0.42, 0); // jagged molten rock
const BALL_GEO = new THREE.SphereGeometry(1, 8, 8);
const RING_GEO = new THREE.RingGeometry(0.62, 1.0, 48);
// Deterministic ember spread: azimuth by golden angle, per-ember speed/rise.
const EMBER_DIRS = Array.from({ length: 20 }, (_, i) => ({
  az: i * 2.399963, sj: 0.7 + (i % 4) * 0.2, rj: 0.8 + ((i * 7) % 5) * 0.09,
}));
const TRAIL_OFFSETS = [0.85, 1.6, 2.5, 3.5, 4.7]; // fire wake above the head
const SMOKE = [{ a: 0.4, r: 0.5 }, { a: 2.5, r: 0.8 }, { a: 4.4, r: 0.6 }, { a: 5.6, r: 0.9 }];

const FALL_DUR = 0.36;
const TOTAL_DUR = 1.2;
const START_Y = 14;

/** Meteor — a flaming rock plummets from the sky and slams the target. */
export function MeteorImpact({ color, glow, accent }: { color: string; glow: string; accent: string }) {
  const head = useRef<THREE.Group>(null);
  const burst = useRef<THREE.Group>(null);
  const smoke = useRef<THREE.Group>(null);
  const flash = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const start = useRef<number | null>(null);

  const rockMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1a120c', emissive: new THREE.Color(color), emissiveIntensity: 1.3, roughness: 1 }), [color]);
  const emberMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const trailMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const flashMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), []);
  const smokeMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, color: new THREE.Color('#241c16') }), []);
  useEffect(() => {
    emberMat.color.set(glow); trailMat.color.set(accent); flashMat.color.set(glow); ringMat.color.set(accent);
  }, [glow, accent, emberMat, trailMat, flashMat, ringMat]);
  useEffect(() => () => { rockMat.dispose(); emberMat.dispose(); trailMat.dispose(); flashMat.dispose(); ringMat.dispose(); smokeMat.dispose(); },
    [rockMat, emberMat, trailMat, flashMat, ringMat, smokeMat]);

  useFrame(({ clock }) => {
    if (start.current === null) start.current = clock.elapsedTime;
    const age = clock.elapsedTime - start.current;
    const falling = age < FALL_DUR;
    if (head.current) head.current.visible = falling;
    if (flash.current) flash.current.visible = !falling;
    if (burst.current) burst.current.visible = !falling;
    if (ring.current) ring.current.visible = !falling;
    if (smoke.current) smoke.current.visible = !falling;

    if (falling) {
      // Accelerating plunge from the sky, tumbling as it comes.
      const p = age / FALL_DUR;
      const h = head.current;
      if (h) { h.position.y = START_Y * (1.0 - p * p); h.rotation.x += 0.45; h.rotation.z += 0.32; }
      return;
    }
    // Slam: bright flash, expanding ground ring, ember fountain, rising smoke.
    const bt = Math.min(1, (age - FALL_DUR) / (TOTAL_DUR - FALL_DUR));
    const dead = age >= TOTAL_DUR;
    if (dead) { if (flash.current) flash.current.visible = false; if (burst.current) burst.current.visible = false; if (ring.current) ring.current.visible = false; if (smoke.current) smoke.current.visible = false; return; }
    const tb = age - FALL_DUR;
    if (flash.current) flash.current.scale.setScalar(1.3 + bt * 3.5);
    flashMat.opacity = Math.max(0, (1 - bt) * (1 - bt)) * 0.95 * (bt < 0.12 ? bt / 0.12 : 1);
    if (ring.current) ring.current.scale.setScalar(1.2 + bt * 5.5);
    ringMat.opacity = (1 - bt) * 0.8;
    emberMat.opacity = 1 - bt;
    if (burst.current) burst.current.children.forEach((c, i) => {
      const d = EMBER_DIRS[i]; if (!d) return;
      const r = 8.5 * d.sj * tb;
      c.position.set(Math.cos(d.az) * r, 6.5 * d.rj * tb - 10.0 * tb * tb, Math.sin(d.az) * r);
      c.scale.setScalar(Math.max(0.04, 0.5 * (1 - bt * 0.7)));
    });
    smokeMat.opacity = (1 - bt) * 0.55;
    if (smoke.current) smoke.current.children.forEach((c, i) => {
      const s = SMOKE[i]; if (!s) return;
      c.position.set(Math.cos(s.a) * s.r * (0.6 + bt), 0.3 + bt * 2.4, Math.sin(s.a) * s.r * (0.6 + bt));
      c.scale.setScalar(0.7 + bt * 1.6);
    });
  });

  return (
    <group>
      {/* Falling flaming rock: a dark molten core wrapped in a fire-shader ball,
          with a short fire wake streaking up behind it. */}
      <group ref={head} position={[0, START_Y, 0]}>
        <mesh geometry={ROCK_GEO} material={rockMat} scale={0.95} />
        <FireCore radius={0.7} />
        {TRAIL_OFFSETS.map((o, i) => (
          <mesh key={o} geometry={BALL_GEO} material={trailMat} position={[0, o, 0]} scale={Math.max(0.08, 0.55 - i * 0.08)} />
        ))}
      </group>
      {/* Slam debris (anchored just above the ground at the target). */}
      <mesh ref={flash} geometry={BALL_GEO} material={flashMat} position={[0, -0.55, 0]} scale={1.5} />
      <mesh ref={ring} geometry={RING_GEO} material={ringMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.9, 0]} />
      <group ref={burst} position={[0, -0.6, 0]}>
        {EMBER_DIRS.map((_, i) => (<mesh key={i} geometry={BALL_GEO} material={emberMat} />))}
      </group>
      <group ref={smoke} position={[0, -0.6, 0]}>
        {SMOKE.map((_, i) => (<mesh key={i} geometry={BALL_GEO} material={smokeMat} />))}
      </group>
    </group>
  );
}
