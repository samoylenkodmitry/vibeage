import { memo, Suspense, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { QUEST_NPCS } from '../../../packages/content/npcs';
import type {
  EnemyEntity,
  PlayerEntity,
  Vec3,
  VisibleCast,
} from './gameTypes';
import {
  BossBeacon,
  CastVfx,
  EnemyHealthBar,
  EnemyHitFlash,
  EnemyThreatRing,
  LootMarker,
  SelectedEnemyBeacon,
  SelectedEnemyRing,
} from './SceneVfx';
import { NameLabel } from './NameLabel';
import { PlayerFigure } from './PlayerFigure';
import { GroundBlobShadow } from './GroundShadow';
import { AnimatedCharacter, type CharacterAnim } from './AnimatedCharacter';
import { pickPlayerModel, enemyModel, type CharacterModelId } from './characterModels';
import { equippedWeaponType } from './weaponModels';
import { AssetErrorBoundary } from './world-art/AssetErrorBoundary';
import { smoothingAlpha } from './cameraRig';
import { getEnemyVisual } from './worldVisuals';
import { getEnemyTemplate } from '../../../packages/content/enemies';
import { chooseWorldArtQuality } from './world-art/quality';
import { getTerrainY } from './worldSceneConfig';
import { advanceSmoothedGroup } from './entitySmoothing';
import { GlowEmitter } from './dynamicLights';

export { LootMarker };

function PlayerMarkerImpl({
  player,
  isSelf,
  isSelected,
  presentationRef,
  equipment,
  onSelect,
  onAttack,
}: {
  player: PlayerEntity;
  isSelf: boolean;
  isSelected?: boolean;
  presentationRef?: MutableRefObject<THREE.Vector3 | null>;
  equipment?: Record<string, string>;
  onSelect?: (targetId: string) => void;
  onAttack?: (targetId: string) => void;
}) {
  const color = player.isAlive ? (isSelf ? '#75f5c8' : '#8bb5ff') : '#64748b';
  const height = isSelf ? 1.8 : 1.55;
  const groundY = getTerrainY(player.position.x, player.position.z);
  const torsoHeight = height * 0.46;
  const headRadius = height * 0.16;

  const vx = player.velocity?.x ?? 0;
  const vz = player.velocity?.z ?? 0;
  const speedSq = vx * vx + vz * vz;
  const isMoving = player.isAlive && speedSq > 0.5;
  // Keep the last movement heading so an idle / attacking character holds
  // the direction it was last facing instead of snapping to rotation.y=0
  // (which read as "always facing the camera" when standing still).
  const lastFacingRef = useRef(player.rotation?.y ?? 0);
  if (isMoving) lastFacingRef.current = Math.atan2(vx, vz);
  const facingY = lastFacingRef.current;
  // Drive the rigged character's clip from live state: dead → death,
  // mid-cast → attack, fast → run, moving → walk, else idle.
  const anim: CharacterAnim = !player.isAlive
    ? 'death'
    : player.castingSkill
      ? 'attack'
      : speedSq > 16
        ? 'run'
        : isMoving
          ? 'walk'
          : 'idle';

  // Only other players are clickable in-world (the local player's own
  // hero plate already handles self-targeting via the HUD click).
  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    if (event.button !== 0 || !player.isAlive || isSelf || (!onSelect && !onAttack)) return;
    event.stopPropagation();
    if (isSelected && onAttack) {
      onAttack(player.id);
    } else if (onSelect) {
      onSelect(player.id);
    }
  }

  return (
    <SmoothedEntityGroup
      position={{ x: player.position.x, y: groundY, z: player.position.z }}
      velocity={player.velocity}
      rotationY={facingY}
      response={isSelf ? 16 : 10}
      presentationRef={presentationRef}
      groundedOffset={0}
    >
      {player.isAlive && <GroundBlobShadow y={0} radius={0.6} opacity={0.8} />}
      {isSelected && !isSelf && <SelectedEnemyRing />}
      <AnimatedPlayerBody
        anim={anim} height={height} torsoHeight={torsoHeight} headRadius={headRadius}
        color={color} isSelf={isSelf} isAlive={player.isAlive} isMoving={isMoving}
        modelId={pickPlayerModel(player.id)}
        equipment={equipment} onPointerDown={!isSelf ? handlePointerDown : undefined}
      />
      {player.isAlive && player.name && (
        <NameLabel
          text={player.level > 0 ? `${player.name}  Lv ${player.level}` : player.name}
          color={isSelf ? '#facc15' : '#bcd0ff'}
          yOffset={height + 0.45}
          height={isSelf ? 0.55 : 0.45}
        />
      )}
    </SmoothedEntityGroup>
  );
}

export const PlayerMarker = memo(PlayerMarkerImpl);

/** Rigged animated body for a player, falling back to the primitive
 *  PlayerFigure while the GLB streams in (Suspense) or if it fails to
 *  load (AssetErrorBoundary). The wrapper group carries the
 *  click-to-target handler for other players. */
function AnimatedPlayerBody({
  anim, height, torsoHeight, headRadius, color, isSelf, isAlive, isMoving, modelId, equipment, onPointerDown,
}: {
  anim: CharacterAnim;
  height: number;
  torsoHeight: number;
  headRadius: number;
  color: string;
  isSelf: boolean;
  isAlive: boolean;
  isMoving: boolean;
  modelId: CharacterModelId;
  equipment?: Record<string, string>;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const fallbackFigure = (
    <PlayerFigure
      height={height} torsoHeight={torsoHeight} headRadius={headRadius} color={color}
      isSelf={isSelf} isAlive={isAlive} isMoving={isMoving} equipment={equipment}
      onPointerDown={onPointerDown}
    />
  );
  return (
    <AssetErrorBoundary fallback={fallbackFigure}>
      <Suspense fallback={fallbackFigure}>
        <group onPointerDown={onPointerDown}>
          <AnimatedCharacter state={anim} targetHeight={height} modelId={modelId} weaponType={equippedWeaponType(equipment)} />
        </group>
      </Suspense>
    </AssetErrorBoundary>
  );
}

// Mob families that get the rigged humanoid model; everything else
// (beasts, dragons, elementals, constructs, aberrations, spirits, fey,
// plant) keeps its distinct primitive silhouette.
const ANIMATED_ENEMY_FAMILIES: ReadonlySet<string> = new Set(['humanoid', 'undead']);
// Resolve the device quality once (SSR-safe); low-end devices keep
// primitives for enemies to protect the frame budget.
const ENTITY_QUALITY = chooseWorldArtQuality();

function enemyAnim(enemy: EnemyEntity, speedSq: number): CharacterAnim {
  if (!enemy.isAlive) return 'death';
  if (enemy.aiState === 'attacking') return 'attack';
  if (speedSq > 16) return 'run';
  if (speedSq > 0.5) return 'walk';
  return 'idle';
}

function EnemyMarkerImpl({
  enemy,
  isSelected,
  onSelect,
  onAttack,
}: {
  enemy: EnemyEntity;
  isSelected: boolean;
  onSelect: (targetId: string | null) => void;
  onAttack?: (targetId: string) => void;
}) {
  const baseVisual = getEnemyVisual(enemy.type);
  const visual = enemy.isMiniBoss
    ? { ...baseVisual, height: baseVisual.height * 1.6, glow: true }
    : baseVisual;
  const color = enemy.isAlive ? visual.color : '#4b5563';
  const groundY = getTerrainY(enemy.position.x, enemy.position.z);
  const y = enemy.isAlive ? groundY + 0.55 : groundY + 0.1;

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    if (event.button !== 0 || !enemy.isAlive) {
      return;
    }

    event.stopPropagation();
    // Click on a not-yet-selected mob → just select it. Click on the
    // already-selected mob → attack it (which kicks off auto-attack
    // mode via castSkill('basicAttack') and handles approach if out
    // of range).
    if (isSelected && onAttack) {
      onAttack(enemy.id);
    } else {
      onSelect(enemy.id);
    }
  }

  const vx = enemy.velocity?.x ?? 0;
  const vz = enemy.velocity?.z ?? 0;
  const speedSq = vx * vx + vz * vz;
  const isMoving = enemy.isAlive && speedSq > 0.5;

  const groundedYOffset = enemy.isAlive ? 0.55 : 0.1;
  const [isHovered, setIsHovered] = useState(false);

  // Rigged humanoid for humanoid/undead families (quality-gated); faces the held movement heading so it never moonwalks.
  const enemyFamily = getEnemyTemplate(enemy.type).family;
  const animated = ENTITY_QUALITY !== 'low' && ANIMATED_ENEMY_FAMILIES.has(enemyFamily);
  const lastFacingRef = useRef(enemy.rotation?.y ?? 0);
  if (isMoving) lastFacingRef.current = Math.atan2(vx, vz);
  const facingY = animated ? lastFacingRef.current : (enemy.rotation?.y ?? 0);

  return (
    <SmoothedEntityGroup
      position={{ x: enemy.position.x, y, z: enemy.position.z }}
      velocity={enemy.velocity}
      rotationY={facingY}
      response={9}
      groundedOffset={groundedYOffset}
    >
      {enemy.isAlive && <GroundBlobShadow y={-groundedYOffset} radius={Math.max(0.55, visual.height * 0.42)} opacity={enemy.isMiniBoss ? 0.95 : 0.8} />}
      {isSelected && <SelectedEnemyRing />}
      {isSelected && enemy.isAlive && <SelectedEnemyBeacon />}
      {enemy.isAlive && enemy.aiState && enemy.aiState !== 'idle' && <EnemyThreatRing state={enemy.aiState} />}
      {enemy.isAlive && isHovered && !isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.48, 0]} raycast={() => null}>
          <ringGeometry args={[0.95, 1.12, 36]} />
          <meshBasicMaterial color="#cffafe" transparent opacity={0.45} depthWrite={false} />
        </mesh>
      )}
      <AnimatedEnemyBody
        animated={animated} anim={enemyAnim(enemy, speedSq)} shape={visual.shape} color={color}
        height={enemy.isAlive ? visual.height : 0.25} targetHeight={visual.height} isMoving={isMoving}
        modelId={enemyModel(enemyFamily)} isAlive={enemy.isAlive} groundedYOffset={groundedYOffset} onPointerDown={handlePointerDown} onHover={setIsHovered}
      />
      {enemy.isAlive && visual.glow && (
        <GlowEmitter color={visual.color} intensity={enemy.isMiniBoss ? 1.6 : 0.9} distance={enemy.isMiniBoss ? 7 : 4} priority={enemy.isMiniBoss ? 3 : 1} />
      )}
      {enemy.isAlive && enemy.isMiniBoss && <MiniBossCrown color={visual.color} height={visual.height} />}
      {enemy.isAlive && enemy.isMiniBoss && !isSelected && <BossBeacon color={visual.color} height={visual.height} />}
      {enemy.isAlive && <EnemyHitFlash health={enemy.health} />}
      <EnemyHealthBar enemy={enemy} visible={isSelected || enemy.health < enemy.maxHealth} />
      {enemy.isAlive && isSelected && (
        <NameLabel
          text={formatEnemyHpText(enemy.health, enemy.maxHealth)}
          color="#f8fafc"
          yOffset={visual.height + 0.95}
          height={0.36}
        />
      )}
      {enemy.isAlive && enemy.name && (
        <NameLabel
          text={enemy.name + (enemy.level ? `  Lv ${enemy.level}` : '')}
          color={enemy.isMiniBoss ? '#fde68a' : '#fca5a5'}
          yOffset={visual.height + 0.65}
          height={enemy.isMiniBoss ? 0.55 : 0.42}
        />
      )}
    </SmoothedEntityGroup>
  );
}

// Memoized — idle enemies keep their ref; skip reconciliation.
export const EnemyMarker = memo(EnemyMarkerImpl);

/** Rigged humanoid body for a humanoid/undead mob, or the primitive
 *  silhouette for everything else (and as the load/error fallback).
 *  The model is offset down by the group's grounded offset so its feet
 *  land on the terrain. */
function AnimatedEnemyBody({
  animated, anim, shape, color, height, targetHeight, isMoving, isAlive, modelId, groundedYOffset, onPointerDown, onHover,
}: {
  animated: boolean;
  anim: CharacterAnim;
  shape: 'box' | 'sphere';
  color: string;
  height: number;
  targetHeight: number;
  isMoving: boolean;
  isAlive: boolean;
  modelId: CharacterModelId;
  groundedYOffset: number;
  onPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  onHover: (hovered: boolean) => void;
}) {
  const primitive = (
    <EnemyBody
      shape={shape} color={color} height={height} isMoving={isMoving} isAlive={isAlive}
      onPointerDown={onPointerDown}
      onPointerOver={() => onHover(true)}
      onPointerOut={() => onHover(false)}
    />
  );
  if (!animated) return primitive;
  return (
    <AssetErrorBoundary fallback={primitive}>
      <Suspense fallback={primitive}>
        <group position={[0, -groundedYOffset, 0]} onPointerDown={onPointerDown}>
          <AnimatedCharacter state={anim} targetHeight={targetHeight} modelId={modelId} tint={color} />
        </group>
      </Suspense>
    </AssetErrorBoundary>
  );
}

function MiniBossCrown({ color, height }: { color: string; height: number }) {
  return (
    <group position={[0, height + 0.6, 0]}>
      <mesh>
        <torusGeometry args={[0.5, 0.12, 12, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} fog={false} />
      </mesh>
      <mesh position={[0, 0.35, 0]}>
        <coneGeometry args={[0.2, 0.4, 6]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} fog={false} />
      </mesh>
    </group>
  );
}

/**
 * Quantize HP text to 5% buckets so the underlying CanvasTexture
 * sprite doesn't regenerate on every tick of damage — only when
 * the visible "percent left" actually changes.
 */
function formatEnemyHpText(health: number, maxHealth: number): string {
  if (maxHealth <= 0) return '';
  const pct = Math.max(0, Math.min(100, Math.round((health / maxHealth) * 20) * 5));
  const approxHealth = Math.round((pct / 100) * maxHealth);
  return `${approxHealth} / ${Math.round(maxHealth)}`;
}

function EnemyBody({
  shape,
  color,
  height,
  isMoving,
  isAlive,
  onPointerDown,
  onPointerOver,
  onPointerOut,
}: {
  shape: 'sphere' | 'box';
  color: string;
  height: number;
  isMoving: boolean;
  isAlive: boolean;
  onPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  onPointerOver?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const deadPoseRef = useRef(false);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }
    if (!isAlive) {
      // Corpse pose is static: apply it once, then skip the per-frame
      // write until the entity revives (deadPoseRef cleared below).
      if (deadPoseRef.current) {
        return;
      }
      mesh.rotation.set(Math.PI / 2, 0, 0);
      mesh.position.y = -height * 0.3;
      deadPoseRef.current = true;
      return;
    }
    deadPoseRef.current = false;
    const t = clock.elapsedTime;
    if (isMoving) {
      mesh.position.y = Math.abs(Math.sin(t * 9)) * 0.18;
      mesh.rotation.z = Math.sin(t * 9) * 0.16;
      mesh.rotation.x = Math.sin(t * 9 + Math.PI / 2) * 0.08;
    } else {
      mesh.position.y = Math.sin(t * 1.6) * 0.04;
      mesh.rotation.set(0, 0, 0);
    }
  });

  return (
    <mesh
      ref={meshRef}
      castShadow
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      {shape === 'sphere'
        ? <sphereGeometry args={[0.58, 18, 14]} />
        : <boxGeometry args={[1.05, height, 1.05]} />}
      <meshStandardMaterial color={color} roughness={0.82} />
    </mesh>
  );
}

/**
 * Static markers for quest-giving NPCs. Read straight from QUEST_NPCS
 * content (no live entity in GameState — NPCs are content, not state).
 * Each NPC is a rigged humanoid (idle), with a floating glow + name so
 * players read it as an interactable quest-giver from across the square.
 */
// Memoized — NpcMarkers takes no props and renders from the static
// QUEST_NPCS constant, so with empty props memo bails on every
// re-render after the first. NPCs are stationary, so this removes
// their entire subtree from per-snapshot reconciliation.
const NPC_HEIGHT = 1.85;
function NpcMarkersImpl() {
  return (
    <>
      {Object.values(QUEST_NPCS).map((npc) => (
        <NpcBody key={npc.id} id={npc.id} name={npc.name} x={npc.position.x} z={npc.position.z} />
      ))}
    </>
  );
}

/** Stable per-id yaw so NPCs don't all face the same way. */
function npcYaw(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
  return (h % 360) * (Math.PI / 180);
}

function NpcBody({ id, name, x, z }: { id: string; name: string; x: number; z: number }) {
  const groundY = getTerrainY(x, z);
  // Cylinder fallback (matches the old look) while the GLB streams or if it fails.
  const fallback = (
    <mesh position={[0, 0.9, 0]} castShadow>
      <cylinderGeometry args={[0.35, 0.45, 1.8, 12]} />
      <meshStandardMaterial color="#facc15" roughness={0.55} metalness={0.15} />
    </mesh>
  );
  return (
    <group position={[x, groundY, z]}>
      <AssetErrorBoundary fallback={fallback}>
        <Suspense fallback={fallback}>
          <group rotation={[0, npcYaw(id), 0]}>
            <AnimatedCharacter state="idle" modelId={pickPlayerModel(id)} targetHeight={NPC_HEIGHT} />
          </group>
        </Suspense>
      </AssetErrorBoundary>
      <GroundBlobShadow y={0} radius={0.55} opacity={0.7} />
      {/* Floating glow marks the NPC as interactable (quest-giver). */}
      <mesh position={[0, NPC_HEIGHT + 0.6, 0]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#fde68a" emissive="#facc15" emissiveIntensity={0.9} fog={false} />
      </mesh>
      <NameLabel text={name} color="#facc15" yOffset={NPC_HEIGHT + 1.1} height={0.4} />
    </group>
  );
}

export const NpcMarkers = memo(NpcMarkersImpl);

export function CastMarker({ cast }: { cast: VisibleCast }) {
  const snapshot = cast.snapshot;
  const groundY = getTerrainY(snapshot.pos.x, snapshot.pos.z);

  return (
    <SmoothedEntityGroup position={{ x: snapshot.pos.x, y: groundY + 1, z: snapshot.pos.z }} response={18}>
      <CastVfx snapshot={snapshot} />
    </SmoothedEntityGroup>
  );
}

const MAX_EXTRAPOLATE_SECONDS = 0.2;

function SmoothedEntityGroup({
  position,
  velocity,
  rotationY = 0,
  response,
  children,
  presentationRef,
  groundedOffset,
}: {
  position: Vec3;
  velocity?: { x: number; z: number };
  rotationY?: number;
  response: number;
  children: ReactNode;
  presentationRef?: MutableRefObject<THREE.Vector3 | null>;
  /** When set, the group's y is derived from getTerrainY(lerped x, z) + this offset each frame. */
  groundedOffset?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const hasInitializedRef = useRef(false);
  const targetRef = useRef(new THREE.Vector3());
  const lastPosRef = useRef({ x: position.x, y: position.y, z: position.z });
  const lastVelRef = useRef({ x: velocity?.x ?? 0, z: velocity?.z ?? 0 });
  const lastSnapTimeRef = useRef(performance.now());

  const vxNow = velocity?.x ?? 0;
  const vzNow = velocity?.z ?? 0;
  if (
    lastPosRef.current.x !== position.x ||
    lastPosRef.current.y !== position.y ||
    lastPosRef.current.z !== position.z ||
    lastVelRef.current.x !== vxNow ||
    lastVelRef.current.z !== vzNow
  ) {
    lastPosRef.current = { x: position.x, y: position.y, z: position.z };
    lastVelRef.current = { x: vxNow, z: vzNow };
    lastSnapTimeRef.current = performance.now();
  }

  useEffect(() => {
    const group = groupRef.current;
    if (presentationRef && group) {
      presentationRef.current = group.position;
    }

    return () => {
      if (presentationRef?.current === group?.position) {
        presentationRef.current = null;
      }
    };
  }, [presentationRef]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }
    const elapsed = Math.min(
      (performance.now() - lastSnapTimeRef.current) / 1000,
      MAX_EXTRAPOLATE_SECONDS,
    );
    const vx = velocity?.x ?? 0;
    const vz = velocity?.z ?? 0;
    const targetX = position.x + vx * elapsed;
    const targetZ = position.z + vz * elapsed;

    if (!hasInitializedRef.current) {
      group.position.set(targetX, position.y, targetZ);
      group.rotation.y = rotationY;
      hasInitializedRef.current = true;
      if (typeof groundedOffset === 'number') {
        group.position.y = getTerrainY(group.position.x, group.position.z) + groundedOffset;
      }
      return;
    }

    advanceSmoothedGroup(group, targetRef.current, {
      targetX, targetZ, posY: position.y, rotationY,
      alpha: smoothingAlpha(response, delta),
      groundedOffset,
    });
  });

  return <group ref={groupRef}>{children}</group>;
}

