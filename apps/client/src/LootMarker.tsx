import { memo, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { ITEMS } from '../../../packages/content/items';
import type { GroundLootStack } from './gameTypes';
import { NameLabel } from './NameLabel';
import { getTerrainY } from './worldSceneConfig';
import { GlowEmitter } from './dynamicLights';
import { lootTreatment, type LootTreatment } from './lootRarity';
import { motionGain } from './combatFeel';
import { useResolvedGraphics } from './graphicsSettings';

/**
 * A ground-loot pile. Split out of SceneVfx.tsx (which was at the 700-line
 * budget) when the marker grew a rarity treatment.
 *
 * Every colour and motion knob comes from `lootTreatment` so the ring, sparks,
 * beam and label all say the same thing about the drop's grade. Geometries and
 * materials are module-level and shared per colour: a farmed field can have
 * dozens of piles up at once, and each one allocating its own would churn the
 * GPU for nothing.
 */

const RING_GEOMETRY = new THREE.RingGeometry(0.62, 0.8, 28);
const BOX_GEOMETRY = new THREE.BoxGeometry(0.62, 0.62, 0.62);
const SPARK_GEOMETRY = new THREE.SphereGeometry(0.055, 8, 8);
// Open-ended, wider at the top: the shaft fades into the sky rather than
// ending in a visible lid.
const BEAM_GEOMETRY = new THREE.CylinderGeometry(0.5, 0.16, 7, 12, 1, true);

// Materials are shared by (colour, role) and NEVER mutated per frame — pulses
// ride on object transforms so one pile can't animate another's material.
const materialCache = new Map<string, THREE.Material>();

function cached<T extends THREE.Material>(key: string, build: () => T): T {
  const hit = materialCache.get(key);
  if (hit) return hit as T;
  const made = build();
  materialCache.set(key, made);
  return made;
}

function ringMaterial(color: string, opacity: number): THREE.Material {
  return cached(`ring|${color}|${opacity}`, () => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false,
  }));
}

function boxMaterial(color: string, emissiveIntensity: number): THREE.Material {
  return cached(`box|${color}|${emissiveIntensity}`, () => new THREE.MeshStandardMaterial({
    color, emissive: new THREE.Color(color), emissiveIntensity, roughness: 0.48,
  }));
}

function sparkMaterial(color: string): THREE.Material {
  return cached(`spark|${color}`, () => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.82, depthWrite: false,
  }));
}

function beamMaterial(color: string): THREE.Material {
  return cached(`beam|${color}`, () => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.16, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
}

/** Orbit slots, sliced off one ring so spark count is the only thing that varies. */
const SPARK_SLOTS = [
  { angle: 0.2, height: 0.28, radius: 0.72 },
  { angle: 1.7, height: 0.45, radius: 0.58 },
  { angle: 3.1, height: 0.34, radius: 0.68 },
  { angle: 4.6, height: 0.52, radius: 0.5 },
  { angle: 2.4, height: 0.6, radius: 0.66 },
  { angle: 5.5, height: 0.22, radius: 0.6 },
];

/** How far past `labelRange` the player must back off before the name hides
 *  again — without it a label flickers on and off as you strafe at the edge. */
const LABEL_HYSTERESIS = 3;
/** Distance re-check interval. Piles don't move; the camera doesn't teleport. */
const LABEL_POLL_SECONDS = 0.2;

function LootMarkerImpl({
  loot,
  onPickUpLoot,
  revealed = false,
  frozen = false,
}: {
  loot: GroundLootStack;
  onPickUpLoot: (lootId: string) => void;
  /** Treasure Sense — show the loot's name without hovering. */
  revealed?: boolean;
  frozen?: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const sparkGroupRef = useRef<THREE.Group>(null);
  const beamRef = useRef<THREE.Mesh>(null);
  const treatment = useMemo(() => lootTreatment(loot.items), [loot.items]);
  const { tier } = useResolvedGraphics();
  // §46/slice-new — the display name is derived client-side from ITEMS[itemId]
  // so the server never ships it with the LootSpawn payload. Stacked drops
  // show "Item A +N more".
  const [hovered, setHovered] = useState(false);
  const labelText = useMemo(() => labelFor(loot), [loot]);

  const position = useMemo<[number, number, number]>(
    () => [loot.position.x, getTerrainY(loot.position.x, loot.position.z) + 0.42, loot.position.z],
    [loot.position.x, loot.position.z],
  );
  // The low tier already drops shadows and post; a beam per pile is the same
  // kind of cost, so the phone budget spends it on the box and ring instead.
  const showBeam = treatment.beam && tier !== 'low';
  const inLabelRange = useLabelRange(position, treatment.labelRange);
  useLootIdle({ meshRef, sparkGroupRef, beamRef, treatment, frozen });

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    if (event.button !== 0) {
      return;
    }

    event.stopPropagation();
    onPickUpLoot(loot.id);
  }

  const showLabel = (hovered || revealed || inLabelRange) && labelText;
  return (
    <group position={position} scale={treatment.scale}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.38, 0]}
        geometry={RING_GEOMETRY}
        material={ringMaterial(treatment.color, treatment.ringOpacity)}
      />
      {showBeam ? (
        <mesh
          ref={beamRef}
          position={[0, 3.2, 0]}
          geometry={BEAM_GEOMETRY}
          material={beamMaterial(treatment.color)}
        />
      ) : null}
      <mesh
        ref={meshRef}
        castShadow
        geometry={BOX_GEOMETRY}
        material={boxMaterial(treatment.color, glowEmissive(treatment))}
        onPointerDown={handlePointerDown}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
      />
      {showLabel ? (
        <NameLabel text={labelText} color={treatment.labelColor} yOffset={1.1} height={0.42} />
      ) : null}
      <GlowEmitter
        color={treatment.color}
        intensity={treatment.glowIntensity}
        distance={treatment.glowDistance}
        priority={treatment.glowPriority}
      />
      <LootSparks groupRef={sparkGroupRef} treatment={treatment} />
    </group>
  );
}

/**
 * The name shows unprompted once the player is inside the treatment's range, so
 * "is that worth walking to?" is answered from where they stand rather than by
 * hovering every box in the field. Polled rather than per-frame: piles don't
 * move, and re-rendering dozens of markers every frame to toggle a sprite would
 * cost more than the label is worth.
 */
function useLabelRange(position: readonly [number, number, number], range: number): boolean {
  const [inRange, setInRange] = useState(false);
  const pollRef = useRef(0);
  useFrame(({ camera }, delta) => {
    pollRef.current += delta;
    if (pollRef.current < LABEL_POLL_SECONDS) return;
    pollRef.current = 0;
    setInRange((was) => {
      // Hysteresis: without it the label flickers as you strafe at the edge.
      const reach = range + (was ? LABEL_HYSTERESIS : 0);
      const d = camera.position.distanceToSquared(TMP_POS.set(position[0], position[1], position[2]));
      return d <= reach * reach;
    });
  });
  return inRange;
}

/**
 * Idle motion: spin, bob, and (epic and up) the beam's breathing swell.
 *
 * motionGain is 0 under prefers-reduced-motion and damped on the low tier, so
 * the pile holds still for anyone who asked for that — rarity stays fully
 * legible from colour, scale, beam and label without any of it moving.
 */
function useLootIdle({ meshRef, sparkGroupRef, beamRef, treatment, frozen }: {
  meshRef: RefObject<THREE.Mesh | null>;
  sparkGroupRef: RefObject<THREE.Group | null>;
  beamRef: RefObject<THREE.Mesh | null>;
  treatment: LootTreatment;
  frozen: boolean;
}): void {
  useFrame(({ clock }, delta) => {
    if (frozen) return;
    const motion = motionGain();
    const spin = delta * treatment.spinRate * (0.35 + 0.65 * motion);
    if (meshRef.current) {
      meshRef.current.position.y = Math.sin(clock.elapsedTime * 2.4) * treatment.bobAmplitude * motion;
      meshRef.current.rotation.y += spin;
    }
    if (sparkGroupRef.current) sparkGroupRef.current.rotation.y += spin * 0.8;
    if (beamRef.current && treatment.pulseRate > 0) {
      // Transform-only pulse: the beam's material is shared with every other
      // pile of this grade, so widening the mesh is the safe way to breathe.
      const swell = 1 + Math.sin(clock.elapsedTime * treatment.pulseRate) * 0.18 * motion;
      beamRef.current.scale.set(swell, 1, swell);
    }
  });
}

function LootSparks({ groupRef, treatment }: {
  groupRef: RefObject<THREE.Group | null>;
  treatment: LootTreatment;
}) {
  const material = sparkMaterial(treatment.sparkColor);
  return (
    <group ref={groupRef}>
      {SPARK_SLOTS.slice(0, treatment.sparkCount).map((spark) => (
        <mesh
          key={spark.angle}
          position={[
            Math.cos(spark.angle) * spark.radius,
            spark.height,
            Math.sin(spark.angle) * spark.radius,
          ]}
          geometry={SPARK_GEOMETRY}
          material={material}
        />
      ))}
    </group>
  );
}

const TMP_POS = new THREE.Vector3();

/** Emissive punch tracks the glow, so a rare box self-lights in a dark biome. */
function glowEmissive(treatment: LootTreatment): number {
  return Math.round(Math.min(1.4, 0.34 + treatment.glowIntensity * 0.24) * 100) / 100;
}

function labelFor(loot: GroundLootStack): string {
  const first = loot.items[0];
  if (!first) return '';
  const name = ITEMS[first.itemId]?.name ?? first.itemId;
  const moreStacks = loot.items.length - 1;
  return moreStacks > 0 ? `${name} +${moreStacks} more` : name;
}

// Memoized: a ground-loot pile is static once dropped (position + items don't
// change), and onPickUpLoot is a stable callback, so shallow compare skips
// re-rendering every pile on each snapshot.
export const LootMarker = memo(LootMarkerImpl);
