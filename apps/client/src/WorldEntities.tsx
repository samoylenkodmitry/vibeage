import { memo, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
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
import { smoothingAlpha } from './cameraRig';
import { getEnemyVisual } from './worldVisuals';
import { getTerrainY } from './worldSceneConfig';

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
  const facingY = isMoving ? Math.atan2(vx, vz) : (player.rotation?.y ?? 0);

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
      {isSelected && !isSelf && <SelectedEnemyRing />}
      <PlayerFigure
        height={height}
        torsoHeight={torsoHeight}
        headRadius={headRadius}
        color={color}
        isSelf={isSelf}
        isAlive={player.isAlive}
        isMoving={isMoving}
        equipment={equipment}
        onPointerDown={!isSelf ? handlePointerDown : undefined}
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

  const speedSq = (enemy.velocity?.x ?? 0) ** 2 + (enemy.velocity?.z ?? 0) ** 2;
  const isMoving = enemy.isAlive && speedSq > 0.5;

  const groundedYOffset = enemy.isAlive ? 0.55 : 0.1;
  const [isHovered, setIsHovered] = useState(false);

  return (
    <SmoothedEntityGroup
      position={{ x: enemy.position.x, y, z: enemy.position.z }}
      velocity={enemy.velocity}
      rotationY={enemy.rotation?.y ?? 0}
      response={9}
      groundedOffset={groundedYOffset}
    >
      {isSelected && <SelectedEnemyRing />}
      {isSelected && enemy.isAlive && <SelectedEnemyBeacon />}
      {enemy.isAlive && enemy.aiState && enemy.aiState !== 'idle' && <EnemyThreatRing state={enemy.aiState} />}
      {enemy.isAlive && isHovered && !isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.48, 0]} raycast={() => null}>
          <ringGeometry args={[0.95, 1.12, 36]} />
          <meshBasicMaterial color="#cffafe" transparent opacity={0.45} depthWrite={false} />
        </mesh>
      )}
      <EnemyBody
        shape={visual.shape}
        color={color}
        height={enemy.isAlive ? visual.height : 0.25}
        isMoving={isMoving}
        isAlive={enemy.isAlive}
        onPointerDown={handlePointerDown}
        onPointerOver={() => setIsHovered(true)}
        onPointerOut={() => setIsHovered(false)}
      />
      {enemy.isAlive && visual.glow && (
        <pointLight color={visual.color} intensity={enemy.isMiniBoss ? 1.6 : 0.9} distance={enemy.isMiniBoss ? 7 : 4} />
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

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }
    if (!isAlive) {
      mesh.rotation.set(Math.PI / 2, 0, 0);
      mesh.position.y = -height * 0.3;
      return;
    }
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
 * Visuals: a tall yellow cylinder with a glowing "!" sphere above to
 * read as "questionable / interactable" without an icon system.
 */
export function NpcMarkers() {
  return (
    <>
      {Object.values(QUEST_NPCS).map((npc) => {
        const groundY = getTerrainY(npc.position.x, npc.position.z);
        return (
          <group key={npc.id} position={[npc.position.x, groundY, npc.position.z]}>
            <mesh position={[0, 0.9, 0]} castShadow>
              <cylinderGeometry args={[0.35, 0.45, 1.8, 12]} />
              <meshStandardMaterial color="#facc15" roughness={0.55} metalness={0.15} />
            </mesh>
            <mesh position={[0, 2.4, 0]}>
              <sphereGeometry args={[0.2, 16, 16]} />
              <meshStandardMaterial color="#fde68a" emissive="#facc15" emissiveIntensity={0.9} />
            </mesh>
            {/* PR KK — floating name label so players can identify
                NPCs from across the square instead of having to walk
                up to every yellow cone to find Thala vs Drev. */}
            <NameLabel text={npc.name} color="#facc15" yOffset={2.95} height={0.4} />
          </group>
        );
      })}
    </>
  );
}

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
// World units: any positional update larger than this snaps the
// entity instead of lerping. Picked so a normal walk-to-target
// update (a few units) still smooths, but a teleport (>10 units)
// reads as instant.
const SNAP_THRESHOLD = 10;

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

    const alpha = smoothingAlpha(response, delta);
    targetRef.current.set(targetX, position.y, targetZ);
    // Teleports (Escape skill, GM setPosition, etc.) push the target
    // far enough that the smooth lerp would visibly drift across the
    // world for many frames. Snap when the gap is larger than the
    // SNAP_THRESHOLD so a teleport reads as instant.
    const gap = group.position.distanceTo(targetRef.current);
    if (gap > SNAP_THRESHOLD) {
      group.position.copy(targetRef.current);
    } else {
      group.position.lerp(targetRef.current, alpha);
    }
    if (typeof groundedOffset === 'number') {
      group.position.y = getTerrainY(group.position.x, group.position.z) + groundedOffset;
    }
    group.rotation.y = lerpAngle(group.rotation.y, rotationY, alpha);
  });

  return <group ref={groupRef}>{children}</group>;
}

function lerpAngle(from: number, to: number, alpha: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * alpha;
}
