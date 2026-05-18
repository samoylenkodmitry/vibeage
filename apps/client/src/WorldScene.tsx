import { useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WORLD_SETTINGS } from '../../../packages/content/world';
import { type VecXZ } from '../../../packages/protocol/messages';
import type { GameClientState } from './gameTypes';
import { WorldEventVfx } from './SceneEventVfx';
import { WorldEnvironment } from './WorldEnvironment';
import { WorldFeatures } from './WorldFeatures';
import { ZoneLandmarks } from './ZoneLandmarks';
import { CameraRig, type CameraControls } from './CameraRig';
import {
  CastMarker,
  EnemyMarker,
  NpcMarkers,
  LootMarker,
  PlayerMarker,
} from './WorldEntities';
import { WorldGround } from './WorldGround';
import { TargetDestinationMarker } from './SceneVfx';
import { getTerrainY } from './worldSceneConfig';

type WorldSceneProps = {
  state: GameClientState;
  onMove: (target: VecXZ) => void;
  onSelectTarget: (targetId: string | null) => void;
  onAttackTarget?: (targetId: string) => void;
  onPickUpLoot: (lootId: string) => void;
  cameraAngleRef?: MutableRefObject<number>;
  cameraControlsRef?: MutableRefObject<CameraControls | null>;
  touchClaimRef?: MutableRefObject<Set<number>>;
  navigationMarker?: VecXZ | null;
};

export function WorldScene({ state, onMove, onSelectTarget, onAttackTarget, onPickUpLoot, cameraAngleRef, cameraControlsRef, touchClaimRef, navigationMarker }: WorldSceneProps) {
  const myPlayer = state.myPlayerId ? state.players[state.myPlayerId] ?? null : null;
  const focus = myPlayer?.position ?? { x: 0, y: 0.5, z: 0 };
  const cameraAnchorRef = useRef<THREE.Vector3 | null>(null) as MutableRefObject<THREE.Vector3 | null>;

  return (
    <Canvas
      camera={{ position: [0, 18, 22], fov: 55, near: 0.1, far: WORLD_SETTINGS.cameraFar }}
      onCreated={({ gl }) => {
        gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      }}
    >
      <color attach="background" args={['#071015']} />
      <fog attach="fog" args={['#071015', WORLD_SETTINGS.fogNear, WORLD_SETTINGS.fogFar]} />
      <WorldEnvironment focus={focus} />
      <WorldGround focus={focus} onMove={onMove} cameraControlsRef={cameraControlsRef} touchClaimRef={touchClaimRef} />
      <WorldFeatures focus={focus} />
      <ZoneLandmarks focus={focus} />
      <TargetDestinationMarker target={state.targetWorldPos} />
      {navigationMarker && <NavigationPin marker={navigationMarker} />}
      {navigationMarker && myPlayer && (
        <NavigationArrow marker={navigationMarker} player={myPlayer.position} />
      )}
      {Object.values(state.players).map((player) => (
        <PlayerMarker
          key={player.id}
          player={player}
          isSelf={player.id === state.myPlayerId}
          isSelected={player.id === state.selectedTargetId}
          presentationRef={player.id === state.myPlayerId ? cameraAnchorRef : undefined}
          equipment={player.id === state.myPlayerId ? state.equipment : undefined}
          onSelect={onSelectTarget}
          onAttack={onAttackTarget}
        />
      ))}
      {Object.values(state.enemies).map((enemy) => (
        <EnemyMarker
          key={enemy.id}
          enemy={enemy}
          isSelected={enemy.id === state.selectedTargetId}
          onSelect={onSelectTarget}
          onAttack={onAttackTarget}
        />
      ))}
      <NpcMarkers />

      {Object.values(state.groundLoot).map((loot) => (
        <LootMarker key={loot.id} loot={loot} onPickUpLoot={onPickUpLoot} />
      ))}
      {Object.values(state.casts).map((cast) => (
        <CastMarker key={cast.snapshot.castId} cast={cast} />
      ))}
      {Object.values(state.visualEvents).map((event) => (
        <WorldEventVfx key={event.id} event={event} />
      ))}
      <CameraRig
        focus={focus}
        presentationFocusRef={cameraAnchorRef}
        cameraAngleRef={cameraAngleRef}
        cameraControlsRef={cameraControlsRef}
        touchClaimRef={touchClaimRef}
      />
    </Canvas>
  );
}

function NavigationPin({ marker }: { marker: VecXZ }) {
  const groundY = getTerrainY(marker.x, marker.z);
  const pillarHeight = 220;
  const pillarRadius = 4.5;
  return (
    <group position={[marker.x, groundY, marker.z]}>
      <mesh position={[0, pillarHeight / 2, 0]}>
        <cylinderGeometry args={[pillarRadius, pillarRadius * 0.5, pillarHeight, 14]} />
        <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.7} fog={false} transparent opacity={0.85} />
      </mesh>
      <mesh position={[0, pillarHeight + 8, 0]}>
        <octahedronGeometry args={[10, 1]} />
        <meshStandardMaterial color="#fff7ad" emissive="#facc15" emissiveIntensity={1.4} fog={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[6, 10, 36]} />
        <meshBasicMaterial color="#facc15" side={THREE.DoubleSide} transparent opacity={0.6} depthWrite={false} fog={false} />
      </mesh>
    </group>
  );
}

function NavigationArrow({ marker, player }: { marker: VecXZ; player: { x: number; y: number; z: number } }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const dx = marker.x - player.x;
    const dz = marker.z - player.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 5) {
      group.visible = false;
      return;
    }
    group.visible = true;
    const playerY = getTerrainY(player.x, player.z);
    group.position.set(player.x, playerY + 4.4 + Math.sin(clock.elapsedTime * 3) * 0.18, player.z);
    group.rotation.y = Math.atan2(dx, dz);
  });

  return (
    <group ref={groupRef}>
      <mesh position={[0, 0, 1.6]} rotation={[Math.PI / 2, 0, 0]} castShadow={false}>
        <coneGeometry args={[0.6, 1.6, 4]} />
        <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={1.2} fog={false} />
      </mesh>
      <mesh position={[0, 0, 0.4]}>
        <boxGeometry args={[0.4, 0.4, 1.4]} />
        <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.8} fog={false} />
      </mesh>
    </group>
  );
}
