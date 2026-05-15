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

  return (
    <SmoothedEntityGroup
      position={{ x: player.position.x, y: groundY, z: player.position.z }}
      rotationY={player.rotation?.y ?? 0}
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
      />
    </SmoothedEntityGroup>
  );
}

function PlayerFigure({
  height,
  torsoHeight,
  headRadius,
  color,
  isSelf,
  isAlive,
}: {
  height: number;
  torsoHeight: number;
  headRadius: number;
  color: string;
  isSelf: boolean;
  isAlive: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const cloakColor = isSelf ? '#1f2937' : '#374151';
  const skinColor = '#f5d9b8';
  const trimColor = isSelf ? '#facc15' : '#94a3b8';
  const torsoY = height * 0.45;
  const cloakY = torsoY - torsoHeight * 0.18;
  const headY = torsoY + torsoHeight * 0.5 + headRadius * 0.55;
  const ringY = torsoY + torsoHeight * 0.55 + headRadius * 1.65;
  const ankleY = 0.06;

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }
    if (!isAlive) {
      group.position.y = -torsoHeight * 0.4;
      return;
    }
    const bob = Math.sin(clock.elapsedTime * 2.2) * 0.04;
    group.position.y = bob;
  });

  return (
    <group ref={groupRef}>
      <mesh position={[-0.32, ankleY + 0.45, 0]} castShadow>
        <capsuleGeometry args={[0.16, 0.42, 6, 10]} />
        <meshStandardMaterial color={cloakColor} roughness={0.78} />
      </mesh>
      <mesh position={[0.32, ankleY + 0.45, 0]} castShadow>
        <capsuleGeometry args={[0.16, 0.42, 6, 10]} />
        <meshStandardMaterial color={cloakColor} roughness={0.78} />
      </mesh>
      <mesh position={[0, torsoY, 0]} castShadow>
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

  return (
    <SmoothedEntityGroup
      position={{ x: enemy.position.x, y, z: enemy.position.z }}
      rotationY={enemy.rotation?.y ?? 0}
      response={9}
    >
      {isSelected && <SelectedEnemyRing />}
      {isSelected && enemy.isAlive && <SelectedEnemyBeacon />}
      {enemy.isAlive && enemy.aiState && enemy.aiState !== 'idle' && <EnemyThreatRing state={enemy.aiState} />}
      <mesh castShadow onPointerDown={handlePointerDown}>
        {visual.shape === 'sphere' ? (
          <sphereGeometry args={[0.58, 18, 14]} />
        ) : (
          <boxGeometry args={[1.05, enemy.isAlive ? visual.height : 0.25, 1.05]} />
        )}
        <meshStandardMaterial color={color} roughness={0.82} />
      </mesh>
      {enemy.isAlive && visual.glow && (
        <pointLight color={visual.color} intensity={0.9} distance={4} />
      )}
      {enemy.isAlive && <EnemyHitFlash health={enemy.health} />}
      <EnemyHealthBar enemy={enemy} visible={isSelected || enemy.health < enemy.maxHealth} />
    </SmoothedEntityGroup>
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
