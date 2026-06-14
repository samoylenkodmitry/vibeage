import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FireCore, GroundShockwave, CORE_VERT, FIRE_FRAG, NOISE_GLSL } from './spellFx';
import { FractalBurst } from './fractalFx';

// Fire-explosion shader: the shared FIRE_FRAG's turbulent blackbody flame, but
// with a uFade alpha multiplier so the detonation can fade out (additive fire
// has no opacity otherwise). Local copy so the shared cores can't break.
const FIRE_BURST_FRAG = NOISE_GLSL + /* glsl */ `
  uniform float uTime; uniform float uFade;
  varying vec3 vPos; varying vec3 vNormal; varying vec3 vViewDir;
  void main() {
    vec3 p = vPos * 3.1; p.y -= uTime * 2.3;
    vec3 q = vec3(fbm(p), fbm(p + 4.7), fbm(p + 9.2));
    float n = fbm(p + q * 1.9);
    float fres = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), 1.4);
    float heat = clamp(n * 1.45 + (1.0 - fres) * 0.4 - vPos.y * 0.28, 0.0, 1.25);
    vec3 col = vec3(0.05, 0.0, 0.0);
    col = mix(col, vec3(0.85, 0.07, 0.0), smoothstep(0.10, 0.34, heat));
    col = mix(col, vec3(1.0, 0.42, 0.04), smoothstep(0.32, 0.55, heat));
    col = mix(col, vec3(1.0, 0.86, 0.30), smoothstep(0.55, 0.80, heat));
    col = mix(col, vec3(1.0, 0.98, 0.88), smoothstep(0.82, 1.06, heat));
    col *= 0.8 + heat * 0.45;                 // tamer emission so turbulence reads (not a white blob under bloom)
    float a = smoothstep(0.10, 0.46, heat + fres * 0.2);
    gl_FragColor = vec4(col, a * uFade);
  }
`;
const FIRE_BALL_GEO = new THREE.IcosahedronGeometry(1, 3);

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
const SHARD_GEO = new THREE.OctahedronGeometry(0.5, 0); // crystal shard (scaled elongated)
const CRYSTAL_GEO = new THREE.IcosahedronGeometry(0.55, 0); // faceted central crystal
const FROST_RING_GEO = new THREE.RingGeometry(0.5, 0.78, 6); // hexagonal frost ring
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

const FB_DUR = 1.0;
const FB_LICKS = 7;

/** Fireball detonation — a turbulent fire ball bursts out and rolls over, a ring
 *  of flames licks upward, embers fountain out and dark smoke rises. Its OWN fire
 *  character (rising turbulent flame), not a reused flash or the arcane swirl. */
export function FireballImpact({ glow, accent, radius }: { glow: string; accent: string; radius: number }) {
  const r = Math.max(1.3, radius);
  const blast = useRef<THREE.Mesh>(null);
  const flash = useRef<THREE.Mesh>(null);
  const licks = useRef<THREE.Group>(null);
  const embers = useRef<THREE.Group>(null);
  const smoke = useRef<THREE.Group>(null);
  const start = useRef<number | null>(null);

  // One fire material for the ball + the licks (same compiled program); uFade
  // burns the whole thing out at the end so nothing hard-pops.
  const fireMat = useMemo(() => new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uFade: { value: 1 } }, vertexShader: CORE_VERT, fragmentShader: FIRE_BURST_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const flashMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const emberMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const smokeMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, color: new THREE.Color('#241c16') }), []);
  useEffect(() => { flashMat.color.set('#ffd9a0'); emberMat.color.set(accent); }, [accent, flashMat, emberMat]);
  useEffect(() => () => fireMat.dispose(), [fireMat]);
  useEffect(() => () => flashMat.dispose(), [flashMat]);
  useEffect(() => () => emberMat.dispose(), [emberMat]);
  useEffect(() => () => smokeMat.dispose(), [smokeMat]);

  useFrame(({ clock }, delta) => {
    if (start.current === null) start.current = clock.elapsedTime;
    fireMat.uniforms.uTime.value += delta;
    const age = clock.elapsedTime - start.current;
    const t = Math.min(1, age / FB_DUR);
    if (age >= FB_DUR) {
      for (const rf of [blast, flash, licks, embers, smoke]) if (rf.current) rf.current.visible = false;
      return;
    }
    // Whole-burst burn-out (held bright, then fades over the last ~30%).
    fireMat.uniforms.uFade.value = 1 - Math.max(0, (t - 0.7) / 0.3);
    // Fire ball: bursts out fast, then settles + shrinks as it cools.
    const bt = Math.min(1, age / 0.3);
    if (blast.current) blast.current.scale.setScalar(r * (0.3 + bt * 0.55) * (1 - t * 0.3));
    // White-hot flash: a fast, contained bright pop.
    if (flash.current) flash.current.scale.setScalar(r * (0.4 + bt * 0.7));
    flashMat.opacity = Math.max(0, (1 - bt) * (1 - bt)) * 0.55 * (age < 0.05 ? age / 0.05 : 1);
    // Flame licks: erupt upward then drop back as the fire dies.
    const rise = Math.min(1, age / 0.18);
    const fall = 1 - Math.max(0, (t - 0.4) / 0.6);
    if (licks.current) licks.current.children.forEach((c, i) => {
      const flick = 0.8 + Math.sin(age * 15.0 + i * 1.9) * 0.25;
      c.scale.set(0.4 * fall + 0.15, Math.max(0.02, rise * flick * fall * 0.7), 0.4 * fall + 0.15);
    });
    // Ember fountain + rising smoke.
    emberMat.opacity = 1 - t;
    if (embers.current) embers.current.children.forEach((c, i) => {
      const d = EMBER_DIRS[i]; if (!d) return;
      const rr = r * 1.5 * d.sj * t;
      c.position.set(Math.cos(d.az) * rr, r * 1.6 * d.rj * t - 4.2 * t * t, Math.sin(d.az) * rr);
      c.scale.setScalar(Math.max(0.02, 0.22 * (1 - t * 0.7)));
    });
    smokeMat.opacity = (1 - t) * 0.5;
    if (smoke.current) smoke.current.children.forEach((c, i) => {
      const s = SMOKE[i]; if (!s) return;
      c.position.set(Math.cos(s.a) * s.r * (0.5 + t), 0.4 + t * 2.6, Math.sin(s.a) * s.r * (0.5 + t));
      c.scale.setScalar(0.8 + t * 1.8);
    });
  });

  return (
    <group position={[0, 0.2, 0]}>
      <GroundShockwave color={glow} accent={accent} size={r * 2.4} durationMs={780} y={-0.18} />
      <mesh ref={flash} geometry={BALL_GEO} material={flashMat} />
      <mesh ref={blast} geometry={FIRE_BALL_GEO} material={fireMat} />
      <group ref={licks}>
        {Array.from({ length: FB_LICKS }).map((_, i) => {
          const a = (i / FB_LICKS) * Math.PI * 2;
          return <mesh key={i} geometry={FLAME_CONE} material={fireMat} position={[Math.cos(a) * r * 0.7, -0.3, Math.sin(a) * r * 0.7]} scale={[0.5, 0.02, 0.5]} />;
        })}
      </group>
      <group ref={embers}>{EMBER_DIRS.map((_, i) => (<mesh key={i} geometry={BALL_GEO} material={emberMat} />))}</group>
      <group ref={smoke}>{SMOKE.map((_, i) => (<mesh key={i} geometry={BALL_GEO} material={smokeMat} />))}</group>
    </group>
  );
}

const ICE_DUR = 0.95;
const ICE_SHATTER_AT = 0.13;
const ICE_SHARDS = Array.from({ length: 13 }, (_, i) => ({
  az: i * 2.399963, sp: 0.75 + (i % 4) * 0.2, rise: 0.9 + ((i * 5) % 4) * 0.12,
  spin: (i % 2 ? 1 : -1) * (4 + (i % 3) * 2), tilt: ((i % 5) - 2) * 0.3,
}));

/** Ice shatter — a faceted crystal forms at the strike then SHATTERS: sharp ice
 *  shards burst outward spinning and fall, over a frost flash, a hexagonal frost
 *  ring and lingering cold mist. Crystalline (faceted, solid) character — not a
 *  glow bloom, not the arcane swirl. */
export function IceShatterImpact({ core, glow, accent, radius }: { core: string; glow: string; accent: string; radius: number }) {
  const r = Math.max(1.1, radius);
  const crystal = useRef<THREE.Mesh>(null);
  const shards = useRef<THREE.Group>(null);
  const flash = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const mist = useRef<THREE.Group>(null);
  const start = useRef<number | null>(null);

  // Crystals: faceted, semi-transparent, lit (MeshStandard) + an emissive ice
  // tint so they glint without washing to a bloom blob.
  const crystalMat = useMemo(() => new THREE.MeshStandardMaterial({ color: core, emissive: new THREE.Color(glow), emissiveIntensity: 0.5, roughness: 0.15, metalness: 0.0, transparent: true, opacity: 0.92 }), [core, glow]);
  const flashMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), []);
  const mistMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, color: new THREE.Color('#cfe9ff') }), []);
  useEffect(() => { flashMat.color.set(accent); ringMat.color.set(accent); }, [accent, flashMat, ringMat]);
  useEffect(() => () => crystalMat.dispose(), [crystalMat]);
  useEffect(() => () => flashMat.dispose(), [flashMat]);
  useEffect(() => () => ringMat.dispose(), [ringMat]);
  useEffect(() => () => mistMat.dispose(), [mistMat]);

  useFrame(({ clock }, delta) => {
    if (start.current === null) start.current = clock.elapsedTime;
    const age = clock.elapsedTime - start.current;
    const t = Math.min(1, age / ICE_DUR);
    if (age >= ICE_DUR) {
      for (const rf of [crystal, shards, flash, ring, mist]) if (rf.current) rf.current.visible = false;
      return;
    }
    const forming = age < ICE_SHATTER_AT;
    if (crystal.current) crystal.current.visible = forming;
    if (shards.current) shards.current.visible = !forming;
    // Frost flash on impact.
    if (flash.current) flash.current.scale.setScalar(r * (0.4 + t * 1.1));
    flashMat.opacity = Math.max(0, (1 - t) * (1 - t)) * 0.6 * (age < 0.04 ? age / 0.04 : 1);
    // Hexagonal frost ring spreads on the ground.
    if (ring.current) ring.current.scale.setScalar(r * (0.6 + t * 2.0));
    ringMat.opacity = (1 - t) * 0.7;
    if (forming) {
      // The crystal stabs up fast before it bursts.
      const p = age / ICE_SHATTER_AT;
      if (crystal.current) { crystal.current.scale.setScalar(r * (0.3 + p * 0.7)); crystal.current.rotation.y += delta * 5.0; }
      return;
    }
    // Shatter: shards fly out, spinning, rising then falling under gravity, fading.
    const st = (age - ICE_SHATTER_AT) / (ICE_DUR - ICE_SHATTER_AT);
    crystalMat.opacity = 0.92 * (1 - st);
    if (shards.current) shards.current.children.forEach((c, i) => {
      const d = ICE_SHARDS[i]; if (!d) return;
      const rr = r * 2.2 * d.sp * st;
      c.position.set(Math.cos(d.az) * rr, 0.3 + r * 1.7 * d.rise * st - 4.6 * st * st, Math.sin(d.az) * rr);
      c.rotation.set(d.tilt + st * d.spin, d.az + st * d.spin, st * d.spin * 0.5);
      const s = Math.max(0.06, (0.7 - i % 3 * 0.08) * (1 - st * 0.45));
      c.scale.set(s * 0.55, s * 1.7, s * 0.55); // elongated shards
    });
    // Cold mist: low subtle ground fog (kept small so the shards stay the hero).
    mistMat.opacity = Math.max(0, (1 - st)) * 0.16;
    if (mist.current) mist.current.children.forEach((c, i) => {
      const a = i * 2.1;
      c.position.set(Math.cos(a) * r * (0.6 + st * 0.7), -0.3 + st * 0.25, Math.sin(a) * r * (0.6 + st * 0.7));
      c.scale.setScalar(0.4 + st * 0.7);
    });
  });

  return (
    <group position={[0, 0.2, 0]}>
      <GroundShockwave color={glow} accent={accent} size={r * 2.2} durationMs={720} y={-0.18} />
      <mesh ref={flash} geometry={BALL_GEO} material={flashMat} />
      <mesh ref={crystal} geometry={CRYSTAL_GEO} material={crystalMat} />
      <mesh ref={ring} geometry={FROST_RING_GEO} material={ringMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.18, 0]} />
      <group ref={shards}>{ICE_SHARDS.map((_, i) => (<mesh key={i} geometry={SHARD_GEO} material={crystalMat} />))}</group>
      <group ref={mist}>{[0, 1, 2, 3].map((i) => (<mesh key={i} geometry={BALL_GEO} material={mistMat} />))}</group>
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

/** Arcane vortex windup — a big swirling hurricane opens over the target and
 *  SPINS UP for the whole cast: it grows, the disc spin accelerates and the
 *  internal flow churns faster as the cast charges, so the player actually SEES
 *  the storm gathering (not a one-frame impact flash). Held at full through the
 *  brief travel, then ArcaneImplodeImpact detonates it. */
export function ArcaneVortexCast({ progress, glow, radius }: { progress: number; glow: string; radius: number }) {
  const pRef = useRef(progress);
  pRef.current = progress;
  const grp = useRef<THREE.Group>(null);
  const size = Math.max(3.6, radius * 2.6);
  useFrame(({ clock }) => {
    // Grows as it charges, with a gentle bob so it reads as alive, not pinned.
    if (grp.current) {
      grp.current.scale.setScalar(0.5 + pRef.current * 0.85);
      grp.current.position.y = Math.sin(clock.elapsedTime * 2.0) * 0.12;
    }
  });
  return (
    <group position={[0, 1.5, 0]}>
      <group ref={grp}>
        <FractalBurst
          color={glow}
          size={size}
          getAlpha={() => Math.min(1, pRef.current * 2.4) * 0.92}
          getSpinRate={() => 1.5 + pRef.current * 6.0}
          getSwirl={() => 1.0 + pRef.current * 2.6}
        />
      </group>
    </group>
  );
}

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
    <group position={[0, 0.9, 0]}>
      <group ref={center}>
        <FractalBurst color={glow} size={2.6} getAlpha={() => fade.current} getSpinRate={() => 5.0} getSwirl={() => 2.4} />
      </group>
      <mesh ref={ring} geometry={RING_GEO} material={ringMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.78, 0]} />
      <group ref={motes}>{IMPLODE_MOTES.map((_, i) => (<mesh key={i} geometry={BALL_GEO} material={moteMat} />))}</group>
    </group>
  );
}
