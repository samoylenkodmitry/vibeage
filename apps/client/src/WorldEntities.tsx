import { useEffect, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type {
  EnemyEntity,
  PlayerEntity,
  Vec3,
  VisibleCast,
} from './gameTypes';
import {
  CastVfx,
  EnemyHealthBar,
  EnemyHitFlash,
  EnemyThreatRing,
  LootMarker,
  SelectedEnemyBeacon,
  SelectedEnemyRing,
} from './SceneVfx';
import { smoothingAlpha } from './cameraRig';
import { getEnemyVisual } from './worldVisuals';
import { getTerrainY } from './worldSceneConfig';

export { LootMarker };

export function PlayerMarker({
  player,
  isSelf,
  presentationRef,
}: {
  player: PlayerEntity;
  isSelf: boolean;
  presentationRef?: MutableRefObject<THREE.Vector3 | null>;
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

  return (
    <SmoothedEntityGroup
      position={{ x: player.position.x, y: groundY, z: player.position.z }}
      rotationY={facingY}
      response={isSelf ? 16 : 10}
      presentationRef={presentationRef}
    >
      <PlayerFigure
        height={height}
        torsoHeight={torsoHeight}
        headRadius={headRadius}
        color={color}
        isSelf={isSelf}
        isAlive={player.isAlive}
        isMoving={isMoving}
      />
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
}: {
  height: number;
  torsoHeight: number;
  headRadius: number;
  color: string;
  isSelf: boolean;
  isAlive: boolean;
  isMoving: boolean;
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
    <group ref={groupRef}>
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
    </group>
  );
}

export function EnemyMarker({
  enemy,
  isSelected,
  onSelect,
}: {
  enemy: EnemyEntity;
  isSelected: boolean;
  onSelect: (targetId: string | null) => void;
}) {
  const visual = getEnemyVisual(enemy.type);
  const color = enemy.isAlive ? visual.color : '#4b5563';
  const groundY = getTerrainY(enemy.position.x, enemy.position.z);
  const y = enemy.isAlive ? groundY + 0.55 : groundY + 0.1;

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    if (event.button !== 0 || !enemy.isAlive) {
      return;
    }

    event.stopPropagation();
    onSelect(enemy.id);
  }

  const speedSq = (enemy.velocity?.x ?? 0) ** 2 + (enemy.velocity?.z ?? 0) ** 2;
  const isMoving = enemy.isAlive && speedSq > 0.5;

  return (
    <SmoothedEntityGroup
      position={{ x: enemy.position.x, y, z: enemy.position.z }}
      rotationY={enemy.rotation?.y ?? 0}
      response={9}
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
        <pointLight color={visual.color} intensity={0.9} distance={4} />
      )}
      {enemy.isAlive && <EnemyHitFlash health={enemy.health} />}
      <EnemyHealthBar enemy={enemy} visible={isSelected || enemy.health < enemy.maxHealth} />
    </SmoothedEntityGroup>
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

export function CastMarker({ cast }: { cast: VisibleCast }) {
  const snapshot = cast.snapshot;
  const groundY = getTerrainY(snapshot.pos.x, snapshot.pos.z);

  return (
    <SmoothedEntityGroup position={{ x: snapshot.pos.x, y: groundY + 1, z: snapshot.pos.z }} response={18}>
      <CastVfx snapshot={snapshot} />
    </SmoothedEntityGroup>
  );
}

function SmoothedEntityGroup({
  position,
  rotationY = 0,
  response,
  children,
  presentationRef,
}: {
  position: Vec3;
  rotationY?: number;
  response: number;
  children: ReactNode;
  presentationRef?: MutableRefObject<THREE.Vector3 | null>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const hasInitializedRef = useRef(false);
  const targetRef = useRef(new THREE.Vector3());

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

    if (!hasInitializedRef.current) {
      group.position.set(position.x, position.y, position.z);
      group.rotation.y = rotationY;
      hasInitializedRef.current = true;
      return;
    }

    const alpha = smoothingAlpha(response, delta);
    group.position.lerp(targetRef.current.set(position.x, position.y, position.z), alpha);
    group.rotation.y = lerpAngle(group.rotation.y, rotationY, alpha);
  });

  return <group ref={groupRef}>{children}</group>;
}

function lerpAngle(from: number, to: number, alpha: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * alpha;
}
