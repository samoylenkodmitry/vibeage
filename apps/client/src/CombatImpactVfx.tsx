import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DamageNumber } from './DamageNumber';
import type { VisualEvent } from './gameTypes';
import { getVisualEventMeta } from './visualEventState';
import { getTerrainY } from './worldSceneConfig';
import { motionGain } from './combatFeel';
import { COMBAT_NUMBER_COLORS } from './combatFeedback';

/**
 * The moment a hit lands, in the world.
 *
 * Supersedes the generic damage pulse in SceneEventVfx for `damage` events
 * (WorldScene routes them here): same cheap ring + flash budget, but the punch
 * is sized by how heavy the hit actually was, a crit gets a second shockwave
 * and a burst of shards, and a killing blow gets the brightest beat of all —
 * so finishing something reads differently from chipping at it.
 *
 * All of it is additive-blended billboarding on shared geometry: no lights, no
 * extra draw-call class, nothing that recompiles a shader mid-fight.
 */

// Shared geometry — every impact in a fight is the same shape at a different
// scale, so they all point at one buffer instead of allocating per hit.
const IMPACT_RING_GEO = new THREE.RingGeometry(0.34, 0.52, 32);
const IMPACT_SHOCK_GEO = new THREE.RingGeometry(0.5, 0.58, 32);
const IMPACT_FLASH_GEO = new THREE.SphereGeometry(0.28, 12, 12);
const IMPACT_SHARD_GEO = (() => { const g = new THREE.ConeGeometry(0.07, 0.42, 4); g.translate(0, 0.21, 0); return g; })();
/** Eight shards read as a burst without becoming a starburst clip-art. */
const IMPACT_SHARDS = Array.from({ length: 8 }, (_, i) => ({ angle: (i / 8) * Math.PI * 2 }));

/** Lifetime of the ground pulse. Longer than the flash so the hit has a wake. */
const IMPACT_DURATION = 0.9;
/** The flash is the *contact*: it must be gone before the eye can dwell on it. */
const FLASH_DURATION = 0.22;
/** Crit/kill shockwave — outruns the base ring, which is what sells the weight. */
const SHOCK_DURATION = 0.45;
/** How far the base ring grows beyond its severity-scaled size over its life. */
const RING_GROWTH = 0.7;
/** Extra scale a full-severity hit adds on spawn, on top of the base ring size. */
const SEVERITY_SCALE = 1.1;
/** Fraction of the lifetime the spawn overshoot takes to settle — the "pop". */
const POP_WINDOW = 0.12;

export function CombatImpactVfx({ event }: { event: VisualEvent }) {
  const meta = getVisualEventMeta(event.id);
  const variant = meta?.variant ?? (event.isCrit ? 'crit' : 'outgoing');
  const severity = meta?.severity ?? 0.4;
  const lethal = meta?.lethal ?? false;
  const heavy = lethal || variant === 'crit';
  const color = event.color ?? COMBAT_NUMBER_COLORS[variant];
  const groundY = getTerrainY(event.position.x, event.position.z);
  const gain = useMemo(() => motionGain(), []);

  const ringRef = useRef<THREE.Mesh>(null);
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const shockRef = useRef<THREE.Mesh>(null);
  const shockMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const flashMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const shardRef = useRef<THREE.Group>(null);
  const startedAtRef = useRef<number | null>(null);
  // One material shared by all eight shards (they always animate in lockstep) —
  // a per-mesh JSX material would need eight refs and only the last one would
  // ever be reachable to fade.
  // Only heavy hits build one: an ordinary swing shouldn't allocate a material
  // it will never show, and a fight is a long stream of ordinary swings.
  const shardMat = useMemo(() => (heavy ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }) : null), [color, heavy]);
  useEffect(() => () => shardMat?.dispose(), [shardMat]);

  // Severity scales the whole footprint: a chip hit is a tick, a big one is a
  // crater. `heavy` widens it further so kills/crits stand out from the stream.
  const baseScale = 0.75 + severity * SEVERITY_SCALE + (heavy ? 0.35 : 0);

  useFrame(({ clock }) => {
    if (startedAtRef.current === null) startedAtRef.current = clock.elapsedTime;
    const age = Math.max(0, clock.elapsedTime - startedAtRef.current);
    const t = Math.min(1, age / IMPACT_DURATION);
    // Spawn overshoot, settling back over POP_WINDOW: the scale-pop that ties
    // the visual to the frame the hit resolved on. Motion-gated so a
    // reduced-motion player still gets the ring, just without the snap.
    const pop = 1 + severity * gain * (t < POP_WINDOW ? 1 - t / POP_WINDOW : 0);
    if (ringRef.current) ringRef.current.scale.setScalar((baseScale + t * RING_GROWTH) * pop);
    if (ringMatRef.current) ringMatRef.current.opacity = 0.74 * (1 - t);

    const shockT = Math.min(1, age / SHOCK_DURATION);
    if (shockRef.current) {
      shockRef.current.visible = shockT < 1;
      shockRef.current.scale.setScalar(baseScale * (0.6 + shockT * 2.6));
    }
    if (shockMatRef.current) shockMatRef.current.opacity = 0.55 * (1 - shockT);

    const flashT = Math.min(1, age / FLASH_DURATION);
    if (flashRef.current) {
      flashRef.current.position.y = 0.45 + flashT * 0.5;
      flashRef.current.scale.setScalar(pop * (heavy ? 1.7 : 1));
    }
    if (flashMatRef.current) flashMatRef.current.opacity = 0.55 * (1 - flashT);

    if (shardRef.current) {
      shardRef.current.visible = shockT < 1;
      // Shards fly out and fall — a decelerating spread plus gravity, so the
      // burst has a direction instead of just fading in place.
      shardRef.current.children.forEach((child, index) => {
        const shard = IMPACT_SHARDS[index];
        if (!shard) return;
        const reach = baseScale * (0.4 + shockT * 1.9);
        child.position.set(Math.cos(shard.angle) * reach, 0.5 + shockT * 1.1 - shockT * shockT * 1.6, Math.sin(shard.angle) * reach);
      });
    }
    if (shardMat) shardMat.opacity = 0.8 * (1 - shockT);
  });

  return (
    <group position={[event.position.x, groundY + 0.12, event.position.z]}>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} geometry={IMPACT_RING_GEO}>
        <meshBasicMaterial ref={ringMatRef} color={color} transparent opacity={0.74} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* Crit / kill only — the second shockwave and the shard burst are what
          separate an event from the steady stream of ordinary hits. */}
      {heavy && (
        <mesh ref={shockRef} rotation={[-Math.PI / 2, 0, 0]} geometry={IMPACT_SHOCK_GEO}>
          <meshBasicMaterial ref={shockMatRef} color={lethal ? KILL_ACCENT : color} transparent opacity={0.55} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      )}
      <mesh ref={flashRef} position={[0, 0.45, 0]} geometry={IMPACT_FLASH_GEO}>
        <meshBasicMaterial ref={flashMatRef} color={lethal ? KILL_ACCENT : FLASH_COLOR} transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {shardMat && (
        <group ref={shardRef}>
          {IMPACT_SHARDS.map((shard) => (
            <mesh key={shard.angle} geometry={IMPACT_SHARD_GEO} material={shardMat} rotation={[0, -shard.angle, -Math.PI / 2.6]} />
          ))}
        </group>
      )}
      {event.amount !== undefined && event.amount > 0 && (
        <DamageNumber amount={event.amount} color={color} variant={variant} baseY={1.1} />
      )}
    </group>
  );
}

/** Hot white-gold core: reads as the spark of contact against any terrain. */
const FLASH_COLOR = '#fff7ad';
/** A kill's accent — brighter and whiter than a crit's amber, so it out-ranks it. */
const KILL_ACCENT = '#fffbe8';
