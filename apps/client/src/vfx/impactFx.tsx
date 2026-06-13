import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GroundShockwave, type SpellElement } from './spellFx';

/**
 * Element-distinct projectile impacts. Every projectile spell used to land with
 * the same generic flash; now fire bursts into rising embers, ice shatters into
 * shards, poison splatters and lingers, arcane implodes, holy flares upward —
 * each on a shared shockwave + flash base.
 *
 * GLSL/geometry is module-level (shared compiled program / buffers), and the
 * per-impact spark material is built once and disposed on unmount.
 */

const SPARK_GEO = new THREE.SphereGeometry(1, 6, 6);
// Elongated shard for ice. Translate so the base sits at the origin, then lay it
// along +Z so a Y-rotation aims it outward along the shard's flight direction.
const SHARD_GEO = (() => { const g = new THREE.ConeGeometry(0.4, 2.2, 4); g.translate(0, 1.1, 0); g.rotateX(Math.PI / 2); return g; })();
const FLASH_GEO = new THREE.SphereGeometry(0.78, 18, 18);
// Soft element-coloured bloom — bigger and slower than the white core flash, so
// the AFTERMATH carries the element's colour (fire stays orange, ice cyan, …)
// instead of every impact reading as the same white-hot pop at MMO range.
const GLOW_GEO = new THREE.SphereGeometry(1.5, 18, 18);
const PILLAR_GEO = new THREE.CylinderGeometry(0.16, 0.42, 3.4, 12, 1, true);
const GAS_GEO = new THREE.CircleGeometry(1, 24);
const RING_GEO = new THREE.RingGeometry(0.5, 0.7, 32);
const GENERIC_RING_GEO = new THREE.RingGeometry(0.4, 0.88, 48);
// Nova: a thin unit ring (scaled to the skill's area) + flame tongues around it.
const NOVA_RING_GEO = new THREE.RingGeometry(0.78, 1.0, 48);
const FLAME_GEO = (() => { const g = new THREE.ConeGeometry(0.34, 1.5, 5); g.translate(0, 0.75, 0); return g; })();
const NOVA_FLAMES = Array.from({ length: 14 }, (_, i) => ({ a: (i / 14) * Math.PI * 2, ph: (i % 5) * 0.7 }));

// Deterministic spread: azimuth by golden angle, per-particle speed/rise jitter.
const IMPACT_DIRS = Array.from({ length: 24 }, (_, i) => ({
  az: i * 2.399963,
  sj: 0.75 + (i % 4) * 0.18,
  rj: 0.85 + ((i * 7) % 5) * 0.07,
}));

type BurstConfig = {
  count: number; speed: number; rise: number; gravity: number;
  scale: number; additive: boolean; elongate: boolean; duration: number;
  /** Element-coloured bloom: peak scale + how long it lingers (s). */
  glowScale: number; glowDur: number;
};
// Punchier + bigger than before so they read as MASS at the MMO camera, and each
// keeps its own character: fire fountains embers, ice shatters shards outward,
// poison splatters a fat lingering glob, arcane implodes a dense spark cloud,
// holy flares a tall column.
const IMPACT_BURST: Record<SpellElement, BurstConfig> = {
  fire: { count: 22, speed: 3.0, rise: 4.2, gravity: 5.5, scale: 0.28, additive: true, elongate: false, duration: 0.8, glowScale: 2.4, glowDur: 0.55 },
  ice: { count: 20, speed: 5.4, rise: 0.9, gravity: 6.5, scale: 0.24, additive: false, elongate: true, duration: 0.6, glowScale: 1.7, glowDur: 0.4 },
  poison: { count: 18, speed: 2.4, rise: 1.8, gravity: 3.6, scale: 0.30, additive: false, elongate: false, duration: 1.2, glowScale: 1.8, glowDur: 0.9 },
  arcane: { count: 24, speed: 3.6, rise: 1.4, gravity: 1.4, scale: 0.22, additive: true, elongate: false, duration: 0.75, glowScale: 2.2, glowDur: 0.5 },
  holy: { count: 16, speed: 1.9, rise: 4.8, gravity: 3.0, scale: 0.24, additive: true, elongate: false, duration: 0.85, glowScale: 2.6, glowDur: 0.6 },
};

export function ElementImpact({ element, core, glow, accent }: { element: SpellElement; core: string; glow: string; accent: string }) {
  const cfg = IMPACT_BURST[element];
  const flashRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const sparks = useRef<THREE.Group>(null);
  const extra = useRef<THREE.Mesh>(null);
  const start = useRef<number | null>(null);

  // Materials built once (empty deps) — blending + colour are set in an effect so
  // an aborted concurrent render can't orphan a material before its dispose runs.
  const sparkMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }), []);
  const flashMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const glowMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const extraMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }), []);
  useEffect(() => {
    sparkMat.blending = cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    extraMat.blending = element === 'poison' ? THREE.NormalBlending : THREE.AdditiveBlending;
    sparkMat.color.set(glow); flashMat.color.set(core); glowMat.color.set(glow); extraMat.color.set(element === 'poison' ? glow : accent);
  }, [glow, core, accent, element, cfg.additive, sparkMat, flashMat, glowMat, extraMat]);
  useEffect(() => () => sparkMat.dispose(), [sparkMat]);
  useEffect(() => () => flashMat.dispose(), [flashMat]);
  useEffect(() => () => glowMat.dispose(), [glowMat]);
  useEffect(() => () => extraMat.dispose(), [extraMat]);

  useFrame(({ clock }) => {
    if (start.current === null) start.current = clock.elapsedTime;
    const age = clock.elapsedTime - start.current;
    const t = Math.min(1, age / cfg.duration);
    // White-hot core flash: a fast bright pop that shrinks + fades.
    if (flashRef.current) flashRef.current.scale.setScalar(1.1 + age * 0.6);
    flashMat.opacity = Math.max(0, (1 - t) * 0.6) * (age < 0.08 ? age / 0.08 : 1);
    // Element-coloured bloom: blooms wider and lingers past the white flash, so
    // the impact's AFTERMATH carries the element colour (fire orange, ice cyan…).
    const gt = Math.min(1, age / cfg.glowDur);
    if (glowRef.current) glowRef.current.scale.setScalar(0.5 + cfg.glowScale * (1 - (1 - gt) * (1 - gt)));
    glowMat.opacity = Math.max(0, (1 - gt) * (1 - gt)) * 0.85 * (age < 0.05 ? age / 0.05 : 1);
    // Particle burst: ballistic fountain, each element shaped by its config.
    sparkMat.opacity = (1 - t);
    if (sparks.current) {
      sparks.current.children.forEach((c, i) => {
        const d = IMPACT_DIRS[i]; if (!d) return;
        const r = cfg.speed * d.sj * age;
        c.position.set(Math.cos(d.az) * r, cfg.rise * d.rj * age - 0.5 * cfg.gravity * age * age, Math.sin(d.az) * r);
      });
    }
    // Element signature extra (holy pillar rises, poison gas spreads).
    if (extra.current) {
      if (element === 'holy') {
        extra.current.scale.set(1, 0.3 + t * 0.9, 1);
        extraMat.opacity = (1 - t) * 0.7;
      } else if (element === 'poison') {
        extra.current.scale.setScalar(0.6 + t * 1.6);
        extraMat.opacity = (1 - t) * 0.4;
      } else { // ice frost ring / arcane shock ring
        extra.current.scale.setScalar(0.5 + t * 2.2);
        extraMat.opacity = (1 - t) * 0.6;
      }
    }
  });

  return (
    <group>
      <GroundShockwave color={glow} accent={accent} />
      <mesh ref={glowRef} geometry={GLOW_GEO} material={glowMat} />
      <mesh ref={flashRef} geometry={FLASH_GEO} material={flashMat} />
      <group ref={sparks}>
        {IMPACT_DIRS.slice(0, cfg.count).map((d, i) => (
          <mesh key={i} geometry={cfg.elongate ? SHARD_GEO : SPARK_GEO} material={sparkMat}
            scale={cfg.elongate ? [cfg.scale, cfg.scale, cfg.scale * 2.4] : cfg.scale} rotation={[0, Math.PI / 2 - d.az, 0]} />
        ))}
      </group>
      <ElementExtra element={element} meshRef={extra} material={extraMat} />
    </group>
  );
}

/** Generic impact for projectiles with no element (e.g. arrows) — shockwave +
 *  ground ring + flash, coloured by the skill theme. */
export function GenericImpact({ glow, accent }: { glow: string; accent: string }) {
  const ringRef = useRef<THREE.Mesh>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const start = useRef<number | null>(null);
  useFrame(({ clock }) => {
    if (start.current === null) start.current = clock.elapsedTime;
    const age = Math.min(1.8, clock.elapsedTime - start.current);
    const fade = Math.max(0, 1 - age / 1.8);
    if (ringRef.current) {
      ringRef.current.scale.setScalar(0.85 + age * 1.35);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.64 * fade;
    }
    if (flashRef.current) {
      flashRef.current.scale.setScalar(1.1 + age * 0.32);
      (flashRef.current.material as THREE.MeshBasicMaterial).opacity = 0.5 * fade;
    }
  });
  return (
    <group>
      <GroundShockwave color={glow} accent={accent} />
      <mesh ref={ringRef} geometry={GENERIC_RING_GEO} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.92, 0]}>
        <meshBasicMaterial color={accent} transparent opacity={0.64} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={flashRef} geometry={FLASH_GEO}>
        <meshBasicMaterial color={glow} transparent opacity={0.5} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Self-centered nova — an expanding ground ring + a ring of rising flame tongues
 *  sized to the skill's area. For auras like Inferno Aura that surround the caster
 *  (no projectile, no single-target burst). */
export function NovaImpact({ glow, accent, radius }: { glow: string; accent: string; radius: number }) {
  const ring = useRef<THREE.Mesh>(null);
  const flames = useRef<THREE.Group>(null);
  const start = useRef<number | null>(null);
  const r = Math.max(1.5, radius);

  const flameMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), []);
  useEffect(() => { flameMat.color.set(glow); ringMat.color.set(accent); }, [glow, accent, flameMat, ringMat]);
  useEffect(() => () => flameMat.dispose(), [flameMat]);
  useEffect(() => () => ringMat.dispose(), [ringMat]);

  const DUR = 0.9;
  useFrame(({ clock }) => {
    if (start.current === null) start.current = clock.elapsedTime;
    const age = clock.elapsedTime - start.current;
    // Animation is over but the visual event lingers until pruned — cull the
    // meshes and skip the per-flame work instead of churning every frame.
    if (age >= DUR) {
      if (ring.current) ring.current.visible = false;
      if (flames.current) flames.current.visible = false;
      return;
    }
    const t = age / DUR;
    const ease = 1 - (1 - t) * (1 - t);
    if (ring.current) ring.current.scale.setScalar(r * (0.2 + ease * 0.8));
    ringMat.opacity = (1 - t) * 0.8;
    flameMat.opacity = (1 - t) * 0.85;
    if (flames.current) {
      flames.current.children.forEach((c, i) => {
        const f = NOVA_FLAMES[i]; if (!f) return;
        const rad = r * (0.25 + ease * 0.7);
        c.position.set(Math.cos(f.a) * rad, 0, Math.sin(f.a) * rad);
        const flick = 0.7 + Math.sin(age * 14 + f.ph) * 0.25;
        c.scale.set(0.8, flick * (1.4 - t), 0.8);
      });
    }
  });

  return (
    <group position={[0, -0.88, 0]}>
      <mesh ref={ring} geometry={NOVA_RING_GEO} material={ringMat} rotation={[-Math.PI / 2, 0, 0]} />
      <group ref={flames}>
        {NOVA_FLAMES.map((_, i) => (<mesh key={i} geometry={FLAME_GEO} material={flameMat} />))}
      </group>
    </group>
  );
}

function ElementExtra({ element, meshRef, material }: { element: SpellElement; meshRef: RefObject<THREE.Mesh>; material: THREE.Material }) {
  if (element === 'holy') {
    return <mesh ref={meshRef} geometry={PILLAR_GEO} material={material} position={[0, 0.4, 0]} />;
  }
  if (element === 'poison') {
    return <mesh ref={meshRef} geometry={GAS_GEO} material={material} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.9, 0]} />;
  }
  // ice / arcane / fire: a flat ring that snaps outward on the ground.
  return <mesh ref={meshRef} geometry={RING_GEO} material={material} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.88, 0]} />;
}
