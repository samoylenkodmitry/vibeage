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
  LootMarker,
  SelectedEnemyRing,
} from './SceneVfx';
import { smoothingAlpha } from './cameraRig';
import { getEnemyVisual } from './worldVisuals';
import { GROUND_Y } from './worldSceneConfig';

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

  return (
    <SmoothedEntityGroup
      position={{ x: player.position.x, y: GROUND_Y + height / 2, z: player.position.z }}
      rotationY={player.rotation?.y ?? 0}
      response={isSelf ? 16 : 10}
      presentationRef={presentationRef}
    >
      <mesh castShadow>
        <capsuleGeometry args={[0.48, height - 0.8, 8, 16]} />
        <meshStandardMaterial color={color} roughness={0.48} metalness={0.12} />
      </mesh>
      {isSelf && (
        <mesh position={[0, height * 0.65, 0]}>
          <torusGeometry args={[0.72, 0.035, 8, 36]} />
          <meshStandardMaterial color="#facc15" emissive="#8a5f00" emissiveIntensity={0.5} />
        </mesh>
      )}
    </SmoothedEntityGroup>
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
  const y = enemy.isAlive ? GROUND_Y + 0.55 : GROUND_Y + 0.1;

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

  return (
    <SmoothedEntityGroup position={{ x: snapshot.pos.x, y: GROUND_Y + 1, z: snapshot.pos.z }} response={18}>
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
