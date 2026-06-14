import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { CastState, type CastSnapshot } from '../../../packages/protocol/messages';
import { ITEMS, getItemGrade } from '../../../packages/content/items';
import { getGradeSpec } from '../../../packages/content/equipmentTypes';
function pickBestGradeColor(items: readonly { itemId: string }[]): string {
  let bestRank = -1;
  let bestColor = items.length > 1 ? '#facc15' : '#eab308';
  for (const i of items) {
    const item = ITEMS[i.itemId];
    if (!item) continue;
    const spec = getGradeSpec(getItemGrade(item));
    if (spec.rank > bestRank) {
      bestRank = spec.rank;
      bestColor = spec.color;
    }
  }
  return bestColor;
}
import type { EnemyEntity, GroundLootStack, Vec3 } from './gameTypes';
import { Billboard } from './SceneEventVfx';
import { NameLabel } from './NameLabel';
import { getTerrainY } from './worldSceneConfig';
import { GlowEmitter } from './dynamicLights';
import {
  SpellCore, SpellProjectile, StrikeImpact, EruptImpact, FLYING_MECHANICS, arcLift, spiralOffset, type SpellMechanic,
} from './vfx/spellFx';
import { DelugeImpact, DelugeCast } from './vfx/delugeFx';
import { ElementImpact, GenericImpact, NovaImpact } from './vfx/impactFx';
import { ElementCharge } from './vfx/castFx';
import { MeteorImpact, InfernoImpact, ArcaneImplodeImpact, ArcaneVortexCast } from './vfx/signatureFx';
import { getCastEffectRadius, getTimeStopDurationMs } from './vfx/castVfxConfig';
import { skillThemeFor, type SkillTheme } from './vfx/skillThemeConfig';
import { TimeSphereDome } from './vfx/timeSphereFx';

const LOOT_SPARKS = [
  { angle: 0.2, height: 0.28, radius: 0.72 },
  { angle: 1.7, height: 0.45, radius: 0.58 },
  { angle: 3.1, height: 0.34, radius: 0.68 },
  { angle: 4.6, height: 0.52, radius: 0.5 },
];

// Element-distinct projectile tail. `rise` drifts each bead up (fire heat /
// holy light) or down (poison drip); `grow` billows the tail wider (smoke);
// `flicker` makes it breathe. Tuned per element so a fireball leaves a churning
// ember-smoke wake while an ice shard leaves a tight crystalline streak.
type TrailCfg = { beads: number; baseR: number; spacing: number; taper: number; rise: number; grow: number; flicker: number; additive: boolean };
const TRAIL_CFG: Record<string, TrailCfg> = {
  fire: { beads: 7, baseR: 0.20, spacing: 0.30, taper: 0.022, rise: 0.085, grow: 0.020, flicker: 0.28, additive: true },
  ice: { beads: 5, baseR: 0.12, spacing: 0.30, taper: 0.020, rise: -0.015, grow: -0.004, flicker: 0.16, additive: false },
  arcane: { beads: 6, baseR: 0.14, spacing: 0.32, taper: 0.018, rise: 0.0, grow: 0.0, flicker: 0.34, additive: true },
  poison: { beads: 6, baseR: 0.16, spacing: 0.28, taper: 0.016, rise: -0.075, grow: 0.016, flicker: 0.12, additive: false },
  holy: { beads: 6, baseR: 0.15, spacing: 0.33, taper: 0.020, rise: 0.05, grow: 0.0, flicker: 0.22, additive: true },
  default: { beads: 4, baseR: 0.15, spacing: 0.34, taper: 0.026, rise: 0.0, grow: 0.0, flicker: 0.12, additive: true },
};

/**
 * PR Q — Boss signature telegraph. A ring on the ground that grows
 * from a thin inner stroke to the impact radius over windUpMs, then
 * flashes red briefly when the impact lands. Pure visual; damage
 * application is server-authoritative via EnemyAttack messages.
 */
export function BossTelegraphRing({
  x, z, radius, innerRadius, directionRad, halfAngleDeg, startedAt, impactAt,
}: {
  x: number;
  z: number;
  radius: number;
  /** Archwork #6 — donut mechanic safe-spot radius. When > 0 the
   *  inner area is rendered as a soft "safe" ring so the player can
   *  see where to stand to dodge. */
  innerRadius?: number;
  /** Archwork #6 follow-up — cone mechanic forward direction
   *  (world XZ plane, radians). When set alongside `halfAngleDeg`,
   *  the renderer draws a wedge instead of a ring. */
  directionRad?: number;
  halfAngleDeg?: number;
  startedAt: number;
  impactAt: number;
}) {
  const ringRef = useRef<THREE.Mesh>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const totalMs = Math.max(1, impactAt - startedAt);

  useFrame(() => {
    const ring = ringRef.current;
    const flash = meshRef.current;
    if (!ring || !flash) return;
    const now = Date.now();
    const ringMat = ring.material as THREE.MeshBasicMaterial;
    const flashMat = flash.material as THREE.MeshBasicMaterial;
    if (now < impactAt) {
      const progress = Math.min(1, (now - startedAt) / totalMs);
      // The danger footprint is full-size from the start (so the player
      // reads the real area immediately); the rim brightens as impact
      // nears and a quickening pulse signals urgency.
      ring.scale.setScalar(1);
      const pulseHz = 3 + progress * 7; // 3→10 Hz as it winds up
      const pulse = (Math.sin((now / 1000) * pulseHz * Math.PI * 2) + 1) / 2;
      ringMat.opacity = 0.45 + progress * 0.4 + pulse * 0.12;
      // Danger fill ramps in over the wind-up ("get out of the red")
      // instead of only flashing at the end.
      flashMat.opacity = 0.08 + progress * progress * 0.34 + pulse * 0.05 * progress;
    } else {
      // Impact: a brief bright bloom, then fade.
      const sincePost = now - impactAt;
      ring.scale.setScalar(1 + Math.min(0.12, sincePost / 1200));
      ringMat.opacity = Math.max(0, 0.9 - sincePost / 550);
      flashMat.opacity = Math.max(0, 0.7 - sincePost / 480);
    }
  });

  const hasSafeSpot = (innerRadius ?? 0) > 0.1;
  const isCone = directionRad !== undefined && halfAngleDeg !== undefined;
  if (isCone) {
    // Archwork #6 follow-up — cone telegraph. ringGeometry's
    // thetaStart/thetaLength carve a wedge out of a disc. Three.js
    // measures the wedge angle in the local XY plane; we rotate the
    // mesh -PI/2 on X so that's the world XZ plane, but the wedge
    // is then mirrored along Z. Apply a Y rotation of `directionRad`
    // to align with the server's atan2(dz, dx) direction.
    const halfRad = ((halfAngleDeg ?? 0) * Math.PI) / 180;
    const thetaStart = -halfRad;
    const thetaLength = halfRad * 2;
    return (
      <group position={[x, getTerrainY(x, z) + 0.04, z]} rotation={[0, -(directionRad ?? 0), 0]}>
        <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(0.1, radius - 0.3), radius, 48, 1, thetaStart, thetaLength]} />
          <meshBasicMaterial color="#ef4444" transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0, radius, 48, 1, thetaStart, thetaLength]} />
          <meshBasicMaterial color="#fb923c" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      </group>
    );
  }
  return (
    <group position={[x, getTerrainY(x, z) + 0.04, z]}>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[Math.max(0.1, radius - 0.3), radius, 64]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {hasSafeSpot && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(0.1, (innerRadius ?? 0) - 0.25), innerRadius ?? 0, 48]} />
          <meshBasicMaterial color="#22c55e" transparent opacity={0.45} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
      <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
        {hasSafeSpot
          ? <ringGeometry args={[innerRadius ?? 0, radius, 64]} />
          : <circleGeometry args={[radius, 64]} />}
        <meshBasicMaterial color="#fb923c" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function TargetDestinationMarker({ target }: { target: Vec3 | null }) {
  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  const beamRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    const beam = beamRef.current;
    if (!outer || !inner || !beam) {
      return;
    }

    const pulse = (Math.sin(clock.elapsedTime * 7) + 1) / 2;
    outer.scale.setScalar(1 + pulse * 0.28);
    inner.scale.setScalar(0.76 + pulse * 0.1);
    (outer.material as THREE.MeshBasicMaterial).opacity = 0.34 + pulse * 0.38;
    (inner.material as THREE.MeshBasicMaterial).opacity = 0.72 + pulse * 0.18;
    (beam.material as THREE.MeshBasicMaterial).opacity = 0.2 + pulse * 0.24;
  });

  if (!target) {
    return null;
  }

  return (
    <group position={[target.x, getTerrainY(target.x, target.z) + 0.05, target.z]}>
      <mesh ref={outerRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.54, 0.76, 42]} />
        <meshBasicMaterial color="#8de9d7" transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={innerRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, 0.26, 28]} />
        <meshBasicMaterial color="#facc15" transparent opacity={0.86} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={beamRef} position={[0, 0.52, 0]}>
        <cylinderGeometry args={[0.04, 0.08, 1.04, 12]} />
        <meshBasicMaterial color="#8de9d7" transparent opacity={0.28} depthWrite={false} />
      </mesh>
    </group>
  );
}

// Mechanics delivered AT the target rather than flying there: their snapshot.pos
// stays at the caster (non-flying), so the effect must be anchored at the target
// or it erupts/slams/implodes on the CASTER. (Auras — nova/inferno — are
// self-centred on the caster, so they're deliberately NOT here.)
const TARGET_DELIVERED: ReadonlySet<SpellMechanic> = new Set(['deluge', 'strike', 'erupt', 'meteor', 'implode']);

/** True when a skill's effect should anchor at the cast's TARGET for the whole
 *  cast (deluge gathers its cloud above the target; strike/erupt/meteor/implode
 *  land on the target), rather than at the caster where the snapshot's pos sits
 *  while charging. */
export function castAnchorsAtTarget(skillId: CastSnapshot['skillId']): boolean {
  if (skillId === 'time_sphere') return true;
  return TARGET_DELIVERED.has(skillThemeFor(skillId).mechanic ?? 'projectile');
}

export function CastVfx({ snapshot, frozen = false }: { snapshot: CastSnapshot; frozen?: boolean }) {
  const theme = skillThemeFor(snapshot.skillId);
  const progress = Math.min(1, snapshot.progressMs / Math.max(1, snapshot.castTimeMs));

  // World-space radius the skill affects — sizes the AoE VFX.
  const radius = getCastEffectRadius(snapshot.skillId);

  if (snapshot.state === CastState.Impact) {
    if (snapshot.skillId === 'time_sphere') {
      return <TimeSphereDome radius={radius} durationMs={getTimeStopDurationMs(snapshot.skillId)} />;
    }
    if (theme.mechanic === 'meteor') return <MeteorImpact color={theme.core} glow={theme.glow} accent={theme.accent} />;
    if (theme.mechanic === 'inferno') return <InfernoImpact glow={theme.glow} accent={theme.accent} radius={radius} />;
    if (theme.mechanic === 'implode') return <ArcaneImplodeImpact glow={theme.glow} accent={theme.accent} radius={radius} />;
    if (theme.mechanic === 'strike') return <StrikeImpact color={theme.glow} accent={theme.accent} />;
    if (theme.mechanic === 'erupt') return <EruptImpact color={theme.core} accent={theme.glow} />;
    if (theme.mechanic === 'deluge') return <DelugeImpact color={theme.core} accent={theme.glow} radius={radius} />;
    if (theme.mechanic === 'nova') return <NovaImpact glow={theme.glow} accent={theme.accent} radius={radius} />;
    if (theme.element) return <ElementImpact element={theme.element} core={theme.core} glow={theme.glow} accent={theme.accent} />;
    return <GenericImpact glow={theme.glow} accent={theme.accent} />;
  }

  if (snapshot.state === CastState.Casting) {
    // Deluge gathers its water cloud above the target DURING the cast windup.
    if (theme.mechanic === 'deluge') return <DelugeCast progress={progress} color={theme.core} accent={theme.glow} radius={radius} />;
    // Arcane opens a spinning hurricane over the target that spins up as it charges.
    if (theme.mechanic === 'implode') return <ArcaneVortexCast progress={progress} glow={theme.glow} radius={radius} />;
    return <CastingChargeVfx progress={progress} theme={theme} frozen={frozen} />;
  }

  // Traveling phase: deluge / arcane hold their gathered windup until impact; the
  // other non-projectile mechanics show nothing (they're delivered at impact).
  if (theme.mechanic === 'deluge') return <DelugeCast progress={1} color={theme.core} accent={theme.glow} radius={radius} />;
  if (theme.mechanic === 'implode') return <ArcaneVortexCast progress={1} glow={theme.glow} radius={radius} />;
  if (theme.mechanic && !FLYING_MECHANICS.has(theme.mechanic)) return null;
  return <ProjectileVfx snapshot={snapshot} theme={theme} frozen={frozen} />;
}

function CastingChargeVfx({ progress, theme, frozen = false }: { progress: number; theme: SkillTheme; frozen?: boolean }) {
  const ringRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Group>(null);

  useFrame(({ clock }, delta) => {
    if (frozen) return;
    const pulse = (Math.sin(clock.elapsedTime * 9) + 1) / 2;
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 2.2;
      ringRef.current.scale.setScalar(0.7 + progress * 0.65 + pulse * 0.05);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.42 + progress * 0.36;
    }
    // Charge grows as the cast fills (the orb spins/pulses on its own shader).
    coreRef.current?.scale.setScalar(0.32 + progress * 0.44 + pulse * 0.05);
  });

  return (
    <group>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.92, 0]}>
        <ringGeometry args={[0.72, 0.94, 44]} />
        <meshBasicMaterial color={theme.accent} transparent opacity={0.58} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <group ref={coreRef}>
        <SpellCore element={theme.element} core={theme.core} glow={theme.glow} radius={0.46} spin={1.6} />
      </group>
      {theme.element && <ElementCharge element={theme.element} glow={theme.glow} progress={progress} />}
    </group>
  );
}

const PROJECTILE_WORLD = new THREE.Vector3(); // scratch for the live world position
const TRAIL_GEOMETRY = new THREE.SphereGeometry(1, 10, 10); // unit sphere, scaled per trail bead

function ProjectileVfx({ snapshot, theme, frozen = false }: { snapshot: CastSnapshot; theme: SkillTheme; frozen?: boolean }) {
  const dir = snapshot.dir;
  const yaw = Math.atan2(dir?.x ?? 0, dir?.z ?? 1);
  const mechanic = theme.mechanic ?? 'projectile';
  const pathRef = useRef<THREE.Group>(null);   // arc lift (world-Y under Y-only yaw)
  const pitchRef = useRef<THREE.Group>(null);   // tilt to the arc's velocity so the tail follows the curve
  const weaveRef = useRef<THREE.Group>(null);   // spiral corkscrew
  const coreRef = useRef<THREE.Group>(null);

  // Horizontal origin→target span, to recover travel progress p from the live pos.
  const ox = snapshot.origin.x;
  const oz = snapshot.origin.z;
  const total = snapshot.target ? Math.hypot(snapshot.target.x - ox, snapshot.target.z - oz) : 0;
  const longZ = mechanic === 'lance' ? 2.4 : 1; // elongated fast bolt

  useFrame(({ clock }) => {
    if (frozen) return;
    coreRef.current?.scale.setScalar(1 + Math.sin(clock.elapsedTime * 14) * 0.08);
    // Travel progress from the smoothed parent group's live world position.
    let p = 0;
    const parent = pathRef.current?.parent;
    if (parent && total > 0.5) {
      parent.updateWorldMatrix(true, false); // ensure this frame's smoothed transform
      parent.getWorldPosition(PROJECTILE_WORLD);
      p = Math.min(1, Math.max(0, Math.hypot(PROJECTILE_WORLD.x - ox, PROJECTILE_WORLD.z - oz) / total));
    }
    // Arc: lob in a parabola that peaks mid-flight (0 lift at both ends).
    if (pathRef.current) pathRef.current.position.y = mechanic === 'arc' ? arcLift(p) : 0;
    // Pitch the projectile + tail to the arc's VELOCITY tangent (nose up on the
    // way out, down on the way in) so the tail follows the curve instead of
    // pointing flat-back-and-up regardless of trajectory. dy/dp of arcLift =
    // 9.6*(1-2p) (height 2.4); horizontal span is `total`. -pitch tilts +Z up.
    if (pitchRef.current) {
      pitchRef.current.rotation.x = mechanic === 'arc' && total > 0.5
        ? -Math.atan2(9.6 * (1 - 2 * p), total) : 0;
    }
    // Spiral: corkscrew around the travel axis (local X horiz-perp, local Y vertical).
    if (weaveRef.current) {
      if (mechanic === 'spiral') {
        const offset = spiralOffset(p);
        weaveRef.current.position.set(offset.x, offset.y, 0);
      } else {
        weaveRef.current.position.set(0, 0, 0);
      }
    }
  });

  return (
    <group ref={pathRef}>
      <group rotation={[0, yaw, 0]}>
        <group ref={pitchRef}>
          <group ref={weaveRef}>
            <group ref={coreRef}>
              {/* form silhouette; inner group elongates it for the lance mechanic. */}
              <group scale={[1, 1, longZ]}>
                <SpellProjectile form={theme.form} element={theme.element} core={theme.core} glow={theme.glow} />
              </group>
            </group>
            {[0.5, 0.86, 1.2].map((offset, index) => (
              <mesh key={offset} geometry={TRAIL_GEOMETRY} position={[0, 0, -offset * longZ]} scale={(1 - index * 0.22) * 0.17}>
                <meshBasicMaterial color={theme.accent} transparent opacity={0.34 - index * 0.08} depthWrite={false} />
              </mesh>
            ))}
            <ProjectileTrail theme={theme} longZ={longZ} frozen={frozen} />
          </group>
        </group>
      </group>
    </group>
  );
}

function ProjectileTrail({ theme, longZ = 1, frozen = false }: { theme: SkillTheme; longZ?: number; frozen?: boolean }) {
  const cfg = TRAIL_CFG[theme.element ?? 'default'] ?? TRAIL_CFG.default;
  const groupRef = useRef<THREE.Group>(null);
  // Per-bead materials so each can fade independently; built once per config and
  // disposed on unmount. Colour tracks the theme without rebuilding.
  const mats = useMemo(
    () => Array.from({ length: cfg.beads }, () => new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, blending: cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    })),
    [cfg],
  );
  useEffect(() => {
    mats.forEach((m, i) => { m.color.set(theme.glow); m.opacity = (1 - i / cfg.beads) * 0.55; });
  }, [mats, theme.glow, cfg]);
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);

  useFrame(({ clock }) => {
    if (frozen) return;
    const g = groupRef.current; if (!g) return;
    const t = clock.elapsedTime;
    g.children.forEach((c, i) => {
      const flick = 1.0 + Math.sin(t * 12.0 + i * 0.8) * cfg.flicker;
      const r = Math.max(0.02, cfg.baseR - cfg.taper * i + cfg.grow * i) * flick;
      c.scale.setScalar(r);
      // Trail behind (-Z, stretched by longZ for lances); drift up/down per
      // element + a gentle weave so the tail isn't a dead straight line.
      c.position.set(
        Math.sin(t * 4.0 + i * 1.3) * 0.035,
        cfg.rise * i + Math.sin(t * 6.0 + i) * 0.02,
        -cfg.spacing * (i + 1) * longZ,
      );
    });
  });

  return (
    <group ref={groupRef}>
      {mats.map((m, i) => (<mesh key={i} geometry={TRAIL_GEOMETRY} material={m} />))}
    </group>
  );
}

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
  // Pile color reflects the best item in the pile so rare drops
  // read different from common ones across the field.
  const color = useMemo(() => pickBestGradeColor(loot.items), [loot.items]);
  const sparks = useMemo(() => LOOT_SPARKS, []);
  // §46/slice-new — cursor-hover label. Derived client-side from
  // ITEMS[itemId] so the server never has to ship the display name
  // with the LootSpawn payload. Stacked drops show "Item A +N more".
  const [hovered, setHovered] = useState(false);
  const labelText = useMemo(() => {
    const first = loot.items[0];
    if (!first) return '';
    const name = ITEMS[first.itemId]?.name ?? first.itemId;
    const moreStacks = loot.items.length - 1;
    return moreStacks > 0 ? `${name} +${moreStacks} more` : name;
  }, [loot.items]);

  useFrame(({ clock }, delta) => {
    if (frozen) return;
    if (meshRef.current) {
      meshRef.current.position.y = Math.sin(clock.elapsedTime * 2.4) * 0.08;
      meshRef.current.rotation.y += delta * 1.4;
    }

    if (sparkGroupRef.current) {
      sparkGroupRef.current.rotation.y += delta * 1.1;
    }
  });

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    if (event.button !== 0) {
      return;
    }

    event.stopPropagation();
    onPickUpLoot(loot.id);
  }

  return (
    <group position={[loot.position.x, getTerrainY(loot.position.x, loot.position.z) + 0.42, loot.position.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.38, 0]}>
        <ringGeometry args={[0.62, 0.8, 28]} />
        <meshBasicMaterial color="#facc15" transparent opacity={0.45} side={THREE.DoubleSide} />
      </mesh>
      <mesh
        ref={meshRef}
        castShadow
        onPointerDown={handlePointerDown}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[0.62, 0.62, 0.62]} />
        <meshStandardMaterial color={color} emissive="#7c4a03" emissiveIntensity={0.75} roughness={0.48} />
      </mesh>
      {(hovered || revealed) && labelText ? (
        <NameLabel text={labelText} color="#fde68a" yOffset={1.1} height={0.42} />
      ) : null}
      <GlowEmitter color={color} intensity={1.6} distance={7} priority={2} />
      <group ref={sparkGroupRef}>
        {sparks.map((spark) => (
          <mesh
            key={spark.angle}
            position={[
              Math.cos(spark.angle) * spark.radius,
              spark.height,
              Math.sin(spark.angle) * spark.radius,
            ]}
          >
            <sphereGeometry args={[0.055, 8, 8]} />
            <meshBasicMaterial color="#fff7ad" transparent opacity={0.78} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// Memoized: a ground-loot pile is static once dropped (position +
// items don't change), and onPickUpLoot is a stable callback, so
// shallow compare skips re-rendering every pile on each snapshot.
export const LootMarker = memo(LootMarkerImpl);

export function SelectedEnemyRing() {
  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const pulse = (Math.sin(clock.elapsedTime * 6.5) + 1) / 2;
    if (outerRef.current) {
      outerRef.current.scale.setScalar(1 + pulse * 0.08);
      (outerRef.current.material as THREE.MeshBasicMaterial).opacity = 0.72 + pulse * 0.2;
    }

    if (innerRef.current) {
      innerRef.current.rotation.z -= 0.012;
    }
  });

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.48, 0]}>
      <mesh ref={outerRef}>
        <ringGeometry args={[1.05, 1.25, 54]} />
        <meshBasicMaterial color="#facc15" transparent opacity={0.86} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={innerRef}>
        <ringGeometry args={[0.78, 0.86, 6]} />
        <meshBasicMaterial color="#8de9d7" transparent opacity={0.62} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function SelectedEnemyBeacon() {
  const haloRef = useRef<THREE.Mesh>(null);
  const pointerRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }, delta) => {
    const pulse = (Math.sin(clock.elapsedTime * 5.5) + 1) / 2;
    if (haloRef.current) {
      haloRef.current.rotation.z += delta * 1.8;
      (haloRef.current.material as THREE.MeshBasicMaterial).opacity = 0.38 + pulse * 0.24;
    }

    if (pointerRef.current) {
      pointerRef.current.position.y = 1.52 + pulse * 0.12;
      pointerRef.current.rotation.y += delta * 2.4;
    }
  });

  return (
    <group>
      <mesh ref={haloRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.32, 0]}>
        <ringGeometry args={[0.42, 0.58, 36]} />
        <meshBasicMaterial color="#facc15" transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={pointerRef} position={[0, 1.58, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.22, 0.42, 4]} />
        <meshStandardMaterial color="#facc15" emissive="#8a5f00" emissiveIntensity={0.58} roughness={0.42} />
      </mesh>
    </group>
  );
}

/**
 * §49/M2 — always-on far-visible beacon for live mini-bosses. The
 * `MiniBossCrown` (torus on the boss's head) is only legible up
 * close; this is the long-range "X marks the boss" pillar a player
 * sees from across the zone while they're still navigating to the
 * fight. Renders as a tall narrow glowing column with a slow
 * upward shimmer so it reads as a *marker*, not a hostile spell
 * effect. Hidden when the boss is dead or selected (the selection
 * halo + corpse cue take over).
 */
export function BossBeacon({ color, height }: { color: string; height: number }) {
  const innerRef = useRef<THREE.Mesh>(null);
  const outerRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const pulse = (Math.sin(clock.elapsedTime * 2.0) + 1) / 2;
    if (innerRef.current) {
      (innerRef.current.material as THREE.MeshBasicMaterial).opacity = 0.55 + pulse * 0.25;
    }
    if (outerRef.current) {
      (outerRef.current.material as THREE.MeshBasicMaterial).opacity = 0.18 + pulse * 0.12;
    }
  });

  const beaconTop = height + 12;
  const center = (height + beaconTop) / 2;
  const length = beaconTop - height;

  return (
    <group>
      <mesh ref={innerRef} position={[0, center, 0]}>
        <cylinderGeometry args={[0.12, 0.18, length, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.7} depthWrite={false} fog={false} />
      </mesh>
      <mesh ref={outerRef} position={[0, center, 0]}>
        <cylinderGeometry args={[0.32, 0.48, length, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.22} depthWrite={false} fog={false} />
      </mesh>
    </group>
  );
}

export function EnemyThreatRing({ state }: { state?: string }) {
  const ringRef = useRef<THREE.Mesh>(null);
  const isAttacking = state === 'attacking';
  const color = isAttacking ? '#fb7185' : '#f59e0b';

  useFrame(({ clock }) => {
    const ring = ringRef.current;
    if (!ring) {
      return;
    }

    const pulse = (Math.sin(clock.elapsedTime * (isAttacking ? 8 : 4.8)) + 1) / 2;
    ring.scale.setScalar(0.95 + pulse * (isAttacking ? 0.14 : 0.08));
    (ring.material as THREE.MeshBasicMaterial).opacity = 0.34 + pulse * (isAttacking ? 0.34 : 0.18);
  });

  return (
    <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
      <ringGeometry args={[0.9, 1.04, 44]} />
      <meshBasicMaterial color={color} transparent opacity={0.45} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

export function EnemyHitFlash({ health }: { health: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const previousHealthRef = useRef(health);
  const flashSecondsRef = useRef(0);

  useEffect(() => {
    if (health < previousHealthRef.current) {
      flashSecondsRef.current = 0.22;
    }

    previousHealthRef.current = health;
  }, [health]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    // No active flash → opacity is already 0 from the last animated frame,
    // so skip the per-enemy material write entirely until the next hit
    // (useEffect re-arms flashSecondsRef). Saves a write/frame per enemy.
    if (!mesh || flashSecondsRef.current <= 0) {
      return;
    }

    flashSecondsRef.current = Math.max(0, flashSecondsRef.current - delta);
    const opacity = flashSecondsRef.current / 0.22;
    (mesh.material as THREE.MeshBasicMaterial).opacity = opacity * 0.48;
  });

  return (
    <mesh ref={meshRef} scale={[1.22, 1.18, 1.22]}>
      <boxGeometry args={[1.05, 1.1, 1.05]} />
      <meshBasicMaterial color="#fff7ad" transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

export function EnemyHealthBar({ enemy, visible }: { enemy: EnemyEntity; visible: boolean }) {
  const width = 1.7;
  const healthRatio = THREE.MathUtils.clamp(enemy.health / Math.max(1, enemy.maxHealth), 0, 1);

  if (!visible) {
    return null;
  }

  return (
    <Billboard position={[0, 1.15, 0]}>
      <mesh position={[0, 0, -0.002]}>
        <planeGeometry args={[width, 0.18]} />
        <meshBasicMaterial color="#111827" transparent opacity={0.86} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh position={[-(width * (1 - healthRatio)) / 2, 0, 0]}>
        <planeGeometry args={[width * healthRatio, 0.1]} />
        <meshBasicMaterial color={healthRatio > 0.35 ? '#86efac' : '#fb7185'} depthTest={false} depthWrite={false} />
      </mesh>
    </Billboard>
  );
}
