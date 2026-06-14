import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FireCore, GroundShockwave, CORE_VERT, FIRE_FRAG } from './spellFx';
import { FractalBurst } from './fractalFx';

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
// Flame column: base at y=0 so scaling Y erupts it up from the ground.
const FLAME_CONE = (() => { const g = new THREE.ConeGeometry(0.5, 2.7, 7); g.translate(0, 1.35, 0); return g; })();
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
  // One dispose per material — a combined effect keyed on all of them would,
  // when rockMat is recreated (colour change), dispose the OTHER five (still
  // live, never recreated) too.
  useEffect(() => () => rockMat.dispose(), [rockMat]);
  useEffect(() => () => emberMat.dispose(), [emberMat]);
  useEffect(() => () => trailMat.dispose(), [trailMat]);
  useEffect(() => () => flashMat.dispose(), [flashMat]);
  useEffect(() => () => ringMat.dispose(), [ringMat]);
  useEffect(() => () => smokeMat.dispose(), [smokeMat]);

  useFrame(({ clock }, delta) => {
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
      if (h) { h.position.y = START_Y * (1.0 - p * p); h.rotation.x += 12.0 * delta; h.rotation.z += 9.0 * delta; }
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

const INFERNO_COLUMNS = 11;
const INFERNO_DUR = 1.2;
const INFERNO_EMBERS = Array.from({ length: 16 }, (_, i) => ({
  az: i * 2.399963, sj: 0.65 + (i % 4) * 0.2, rj: 0.8 + ((i * 5) % 4) * 0.1,
}));

/** Inferno — a fierce blaze: a ring of fire-shader flame columns erupts up out
 *  of the ground around the caster, with an expanding fire ring + rising embers,
 *  then dies down. (Replaces the generic nova for inferno-type auras.) */
export function InfernoImpact({ glow, accent, radius }: { glow: string; accent: string; radius: number }) {
  const r = Math.max(1.6, radius);
  const cols = useRef<THREE.Group>(null);
  const embers = useRef<THREE.Group>(null);
  const flash = useRef<THREE.Mesh>(null);
  const start = useRef<number | null>(null);

  // One shared fire material for every column (same compiled program); uTime
  // drives the upward flame flow.
  const fireMat = useMemo(() => new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: CORE_VERT, fragmentShader: FIRE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const emberMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const flashMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  useEffect(() => { emberMat.color.set(glow); flashMat.color.set(glow); }, [glow, emberMat, flashMat]);
  useEffect(() => () => fireMat.dispose(), [fireMat]);
  useEffect(() => () => emberMat.dispose(), [emberMat]);
  useEffect(() => () => flashMat.dispose(), [flashMat]);

  useFrame(({ clock }, delta) => {
    if (start.current === null) start.current = clock.elapsedTime;
    fireMat.uniforms.uTime.value += delta;
    const age = clock.elapsedTime - start.current;
    const t = Math.min(1, age / INFERNO_DUR);
    if (age >= INFERNO_DUR) {
      if (cols.current) cols.current.visible = false;
      if (embers.current) embers.current.visible = false;
      if (flash.current) flash.current.visible = false;
      return;
    }
    // Columns erupt (rise), flicker, then die down.
    const rise = Math.min(1, age / 0.18);
    const die = 1 - Math.max(0, (t - 0.55) / 0.45);
    if (cols.current) cols.current.children.forEach((c, i) => {
      const flick = 0.85 + Math.sin(age * 16.0 + i * 1.7) * 0.25;
      const h = Math.max(0.02, rise * flick * die * (0.85 + (i % 3) * 0.14));
      const w = 0.7 * die + 0.25;
      c.scale.set(w, h, w);
    });
    flashMat.opacity = Math.max(0, (1 - t) * (1 - t)) * 0.8 * (age < 0.1 ? age / 0.1 : 1);
    if (flash.current) flash.current.scale.setScalar(r * (0.4 + t * 0.7));
    emberMat.opacity = 1 - t;
    if (embers.current) embers.current.children.forEach((c, i) => {
      const d = INFERNO_EMBERS[i]; if (!d) return;
      const rr = r * (0.45 + d.sj * 0.5);
      c.position.set(Math.cos(d.az) * rr, 0.3 + 5.0 * d.rj * t - 4.0 * t * t, Math.sin(d.az) * rr);
      c.scale.setScalar(Math.max(0.04, 0.42 * (1 - t * 0.7)));
    });
  });

  return (
    <group position={[0, -0.9, 0]}>
      <GroundShockwave color={glow} accent={accent} size={r * 2.4} durationMs={950} y={0.02} />
      <mesh ref={flash} geometry={BALL_GEO} material={flashMat} position={[0, 0.4, 0]} />
      <group ref={cols}>
        {Array.from({ length: INFERNO_COLUMNS }).map((_, i) => {
          const a = (i / INFERNO_COLUMNS) * Math.PI * 2;
          return <mesh key={i} geometry={FLAME_CONE} material={fireMat} position={[Math.cos(a) * r * 0.82, 0, Math.sin(a) * r * 0.82]} scale={[0.7, 0.02, 0.7]} />;
        })}
      </group>
      <group ref={embers}>{INFERNO_EMBERS.map((_, i) => (<mesh key={i} geometry={BALL_GEO} material={emberMat} />))}</group>
    </group>
  );
}

const IMPLODE_MOTES = Array.from({ length: 18 }, (_, i) => ({
  az: i * 2.399963, el: ((i % 5) - 2) * 0.32, sp: 0.8 + (i % 3) * 0.25,
}));
const IMPLODE_DUR = 1.15;
const COLLAPSE_AT = 0.44;

/** Arcane implosion — motes spiral INWARD and the energy gathers into a churning
 *  fractal SINGULARITY (the raymarched reference look), which then DETONATES:
 *  the fractal flares and blooms outward, an arcane ring expands, motes fling out.
 *  The fractal IS the spectacle here — no white flash sphere to wash it out. */
export function ArcaneImplodeImpact({ glow, accent, radius }: { glow: string; accent: string; radius: number }) {
  const r = Math.max(1.4, radius);
  const motes = useRef<THREE.Group>(null);
  const center = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const start = useRef<number | null>(null);
  // Per-frame fractal alpha — ramps in as the singularity gathers, flares at the
  // collapse, then decays through the detonation (read by FractalBurst.getAlpha).
  const fade = useRef(0);

  const moteMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), []);
  useEffect(() => { moteMat.color.set(glow); ringMat.color.set(accent); }, [glow, accent, moteMat, ringMat]);
  useEffect(() => () => moteMat.dispose(), [moteMat]);
  useEffect(() => () => ringMat.dispose(), [ringMat]);

  useFrame(({ clock }) => {
    if (start.current === null) start.current = clock.elapsedTime;
    const age = clock.elapsedTime - start.current;
    if (age >= IMPLODE_DUR) {
      if (motes.current) motes.current.visible = false;
      if (center.current) center.current.visible = false;
      if (ring.current) ring.current.visible = false;
      return;
    }
    const imploding = age < COLLAPSE_AT;
    if (ring.current) ring.current.visible = !imploding;
    if (imploding) {
      // Gathering: motes accelerate inward; the fractal singularity grows and
      // brightens as the energy is drawn into it.
      const p = age / COLLAPSE_AT;
      moteMat.opacity = 0.45 + p * 0.5;
      if (motes.current) motes.current.children.forEach((c, i) => {
        const m = IMPLODE_MOTES[i]; if (!m) return;
        const rr = r * (1 - p * p);                    // accelerate inward
        const spin = age * 3.2 * m.sp;
        c.position.set(Math.cos(m.az + spin) * rr, m.el * rr * 0.6 + 0.35, Math.sin(m.az + spin) * rr);
        c.scale.setScalar(0.10 + p * 0.12);
      });
      if (center.current) center.current.scale.setScalar(0.5 + p * p * 1.4); // tightens, then swells at collapse
      fade.current = 0.35 + p * 0.65;
      return;
    }
    // Detonation: the singularity flares bright then blooms outward and fades;
    // the ring expands and motes are flung outward.
    const bt = (age - COLLAPSE_AT) / (IMPLODE_DUR - COLLAPSE_AT);
    if (ring.current) ring.current.scale.setScalar(1.0 + bt * (r * 2.4));
    ringMat.opacity = (1 - bt) * 0.85;
    moteMat.opacity = 1 - bt;
    if (motes.current) motes.current.children.forEach((c, i) => {
      const m = IMPLODE_MOTES[i]; if (!m) return;
      const rr = r * 1.6 * bt * m.sp;
      const spin = age * 2.0 * m.sp;
      c.position.set(Math.cos(m.az + spin) * rr, m.el * rr * 0.5 + 0.35 + bt * 1.1, Math.sin(m.az + spin) * rr);
      c.scale.setScalar(Math.max(0.03, 0.22 * (1 - bt)));
    });
    // Flare for the first ~12% (the detonation pop), then bloom out + decay.
    if (center.current) center.current.scale.setScalar(1.9 + bt * bt * 3.4);
    fade.current = (bt < 0.12 ? 0.6 + (bt / 0.12) * 0.4 : 1) * (1 - bt) * (1 - bt);
  });

  return (
    <group position={[0, 0.6, 0]}>
      <group ref={center}><FractalBurst color={glow} size={1.8} getAlpha={() => fade.current} /></group>
      <mesh ref={ring} geometry={RING_GEO} material={ringMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.48, 0]} />
      <group ref={motes}>{IMPLODE_MOTES.map((_, i) => (<mesh key={i} geometry={BALL_GEO} material={moteMat} />))}</group>
    </group>
  );
}
