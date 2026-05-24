import { useEffect, useRef, type MutableRefObject, type ReactNode } from 'react';
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
import { ITEMS } from '../../../packages/content/items';
import { smoothingAlpha } from './cameraRig';
import { getEnemyVisual } from './worldVisuals';
import { getTerrainY } from './worldSceneConfig';

export { LootMarker };

export function PlayerMarker({
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

type PlayerAnimationRefs = {
  group: THREE.Group | null;
  leftLeg: THREE.Mesh | null;
  rightLeg: THREE.Mesh | null;
  torso: THREE.Mesh | null;
  torsoHeight: number;
  legPivotY: number;
  isMoving: boolean;
  isAlive: boolean;
};

type WalkBlendState = { value: number };

function makeWalkBlend(): WalkBlendState {
  return { value: 0 };
}

function drivePlayerAnimation(
  time: number,
  delta: number,
  blend: WalkBlendState,
  refs: PlayerAnimationRefs,
): void {
  const { group, leftLeg, rightLeg, torso, torsoHeight, legPivotY, isMoving, isAlive } = refs;
  if (!group) {
    return;
  }
  if (!isAlive) {
    blend.value = 0;
    group.position.y = -torsoHeight * 0.4;
    group.rotation.x = -Math.PI / 2;
    return;
  }
  group.rotation.x = 0;

  const target = isMoving ? 1 : 0;
  const blendSpeed = isMoving ? 6 : 4;
  blend.value += (target - blend.value) * Math.min(1, delta * blendSpeed);
  const w = blend.value;

  const swing = Math.sin(time * 7.4);
  const idleBob = Math.sin(time * 2.2) * 0.03;
  group.position.y = idleBob * (1 - w);

  if (leftLeg) {
    leftLeg.position.set(-0.32, legPivotY, swing * 0.32 * w);
    leftLeg.rotation.x = swing * 0.45 * w;
  }
  if (rightLeg) {
    rightLeg.position.set(0.32, legPivotY, -swing * 0.32 * w);
    rightLeg.rotation.x = -swing * 0.45 * w;
  }
  if (torso) {
    torso.rotation.z = Math.sin(time * 7.4 + Math.PI) * 0.04 * w;
  }
}

function PlayerFigure({
  height,
  torsoHeight,
  headRadius,
  color,
  isSelf,
  isAlive,
  isMoving,
  equipment,
  onPointerDown,
}: {
  height: number;
  torsoHeight: number;
  headRadius: number;
  color: string;
  isSelf: boolean;
  isAlive: boolean;
  isMoving: boolean;
  equipment?: Record<string, string>;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Mesh>(null);
  const rightLegRef = useRef<THREE.Mesh>(null);
  const torsoRef = useRef<THREE.Mesh>(null);
  const blendRef = useRef<WalkBlendState>(makeWalkBlend());
  const cloakColor = isSelf ? '#1f2937' : '#374151';
  const skinColor = '#f5d9b8';
  const trimColor = isSelf ? '#facc15' : '#94a3b8';
  const torsoY = height * 0.45;
  const cloakY = torsoY - torsoHeight * 0.18;
  const headY = torsoY + torsoHeight * 0.5 + headRadius * 0.55;
  const ringY = torsoY + torsoHeight * 0.55 + headRadius * 1.65;
  const legPivotY = 0.55;

  useFrame(({ clock }, delta) => {
    drivePlayerAnimation(clock.elapsedTime, delta, blendRef.current, {
      group: groupRef.current,
      leftLeg: leftLegRef.current,
      rightLeg: rightLegRef.current,
      torso: torsoRef.current,
      torsoHeight,
      legPivotY,
      isMoving,
      isAlive,
    });
  });

  return (
    <group ref={groupRef} onPointerDown={onPointerDown}>
      <mesh ref={leftLegRef} position={[-0.32, legPivotY, 0]} castShadow>
        <capsuleGeometry args={[0.16, 0.42, 6, 10]} />
        <meshStandardMaterial color={cloakColor} roughness={0.78} />
      </mesh>
      <mesh ref={rightLegRef} position={[0.32, legPivotY, 0]} castShadow>
        <capsuleGeometry args={[0.16, 0.42, 6, 10]} />
        <meshStandardMaterial color={cloakColor} roughness={0.78} />
      </mesh>
      <mesh ref={torsoRef} position={[0, torsoY, 0]} castShadow>
        <capsuleGeometry args={[0.4, torsoHeight, 8, 14]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.16} />
        {/* Chest armour rides on the torso so it tilts with the walk sway. */}
        {isAlive && equipment?.CHEST && (
          <mesh>
            <capsuleGeometry args={[0.46, torsoHeight * 0.9, 8, 14]} />
            <meshStandardMaterial color={templateColor(equipment.CHEST, '#7c2d12')} roughness={0.45} metalness={0.32} transparent opacity={0.92} />
          </mesh>
        )}
      </mesh>
      <mesh position={[0, cloakY, -0.12]} castShadow>
        <coneGeometry args={[0.78, torsoHeight * 1.05, 14, 1, true]} />
        <meshStandardMaterial color={cloakColor} roughness={0.82} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, torsoY + torsoHeight * 0.46, 0]} castShadow>
        <torusGeometry args={[0.46, 0.06, 8, 18]} />
        <meshStandardMaterial color={trimColor} roughness={0.42} metalness={0.36} />
      </mesh>
      <mesh position={[0, headY, 0]} castShadow>
        <sphereGeometry args={[headRadius, 18, 14]} />
        <meshStandardMaterial color={skinColor} roughness={0.62} />
      </mesh>
      {isSelf && (
        <mesh position={[0, ringY, 0]}>
          <torusGeometry args={[0.62, 0.04, 8, 36]} />
          <meshStandardMaterial color="#facc15" emissive="#8a5f00" emissiveIntensity={0.55} />
        </mesh>
      )}
      {isAlive && equipment && (
        <EquipmentOverlay
          equipment={equipment}
          torsoY={torsoY}
          torsoHeight={torsoHeight}
          headY={headY}
          headRadius={headRadius}
        />
      )}
    </group>
  );
}

function EquipmentOverlay({
  equipment,
  torsoY,
  torsoHeight,
  headY,
  headRadius,
}: {
  equipment: Record<string, string>;
  torsoY: number;
  torsoHeight: number;
  headY: number;
  headRadius: number;
}) {
  const helmetColor = templateColor(equipment.HEAD, '#a8a29e');
  const mainHand = equipment.MAIN_HAND;
  const offHand = equipment.OFF_HAND;
  const handY = torsoY - torsoHeight * 0.1;
  return (
    <group>
      {equipment.HEAD && (
        <mesh position={[0, headY + headRadius * 0.4, 0]} castShadow>
          <sphereGeometry args={[headRadius * 1.18, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={helmetColor} roughness={0.4} metalness={0.5} />
        </mesh>
      )}
      {mainHand && (
        <WeaponMesh templateId={mainHand} y={handY} x={0.45} hand="main" />
      )}
      {offHand && (
        offHandIsShield(offHand)
          ? <ShieldMesh templateId={offHand} y={torsoY} x={-0.48} />
          : <WeaponMesh templateId={offHand} y={handY} x={-0.45} hand="off" />
      )}
    </group>
  );
}

function WeaponMesh({ templateId, y, x, hand }: { templateId: string; y: number; x: number; hand: 'main' | 'off' }) {
  const template = ITEMS[templateId];
  const handUsage = template?.equip?.handUsage;
  const weaponType = template?.equip?.weaponType ?? 'sword';
  const color = templateColor(templateId, '#94a3b8');
  const isOrb = weaponType === 'staff' || weaponType === 'orb';
  const isTwoHanded = handUsage === 'twoHand' || handUsage === 'bow' || handUsage === 'dualWield';
  const length = isOrb || isTwoHanded ? 1.6 : 1.0;
  const radius = weaponType === 'mace' ? 0.07 : weaponType === 'dagger' ? 0.04 : 0.05;
  // Swords / daggers / staves taper toward the tip; maces flare outward.
  const radiusTop = weaponType === 'mace' ? radius : radius * 0.6;
  const radiusBottom = weaponType === 'mace' ? radius * 0.8 : radius;
  const angle = hand === 'main' ? -0.35 : 0.35;
  return (
    <group position={[x, y, 0.1]} rotation={[0, 0, angle]}>
      <mesh position={[0, length / 2, 0]} castShadow>
        <cylinderGeometry args={[radiusTop, radiusBottom, length, 10]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.6} />
      </mesh>
      {weaponType === 'mace' && (
        <mesh position={[0, length, 0]} castShadow>
          <icosahedronGeometry args={[0.16, 0]} />
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.7} />
        </mesh>
      )}
      {isOrb && (
        <mesh position={[0, length, 0]} castShadow>
          <sphereGeometry args={[0.14, 12, 8]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
        </mesh>
      )}
    </group>
  );
}

function ShieldMesh({ templateId, y, x }: { templateId: string; y: number; x: number }) {
  const color = templateColor(templateId, '#9a5b2c');
  return (
    <mesh position={[x, y, 0.15]} rotation={[0, Math.PI / 2, 0]} castShadow>
      <cylinderGeometry args={[0.32, 0.32, 0.08, 18]} />
      <meshStandardMaterial color={color} roughness={0.5} metalness={0.4} />
    </mesh>
  );
}

function offHandIsShield(templateId: string): boolean {
  const spec = ITEMS[templateId]?.equip;
  return spec?.bodyPart === 'shield';
}

function templateColor(templateId: string | undefined, fallback: string): string {
  if (!templateId) return fallback;
  // Future: read from ItemTemplate.visual once it's added. For now, derive a
  // stable colour from the item grade so different grades read differently.
  const grade = ITEMS[templateId]?.grade ?? 'none';
  switch (grade) {
    case 'd': return '#9ca3af';
    case 'c': return '#86efac';
    case 'b': return '#7dd3fc';
    case 'a': return '#fde68a';
    case 's': return '#fca5a5';
    default: return fallback;
  }
}

export function EnemyMarker({
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
      <EnemyBody
        shape={visual.shape}
        color={color}
        height={enemy.isAlive ? visual.height : 0.25}
        isMoving={isMoving}
        isAlive={enemy.isAlive}
        onPointerDown={handlePointerDown}
      />
      {enemy.isAlive && visual.glow && (
        <pointLight color={visual.color} intensity={enemy.isMiniBoss ? 1.6 : 0.9} distance={enemy.isMiniBoss ? 7 : 4} />
      )}
      {enemy.isAlive && enemy.isMiniBoss && <MiniBossCrown color={visual.color} height={visual.height} />}
      {enemy.isAlive && enemy.isMiniBoss && !isSelected && <BossBeacon color={visual.color} height={visual.height} />}
      {enemy.isAlive && <EnemyHitFlash health={enemy.health} />}
      <EnemyHealthBar enemy={enemy} visible={isSelected || enemy.health < enemy.maxHealth} />
      {enemy.isAlive && enemy.name && (
        <NameLabel
          text={enemy.name + (enemy.level ? ` Lv${enemy.level}` : '')}
          color={enemy.isMiniBoss ? '#fde68a' : '#fca5a5'}
          yOffset={visual.height + 0.65}
          height={enemy.isMiniBoss ? 0.55 : 0.42}
        />
      )}
    </SmoothedEntityGroup>
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

function EnemyBody({
  shape,
  color,
  height,
  isMoving,
  isAlive,
  onPointerDown,
}: {
  shape: 'sphere' | 'box';
  color: string;
  height: number;
  isMoving: boolean;
  isAlive: boolean;
  onPointerDown: (event: ThreeEvent<PointerEvent>) => void;
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
    <mesh ref={meshRef} castShadow onPointerDown={onPointerDown}>
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
