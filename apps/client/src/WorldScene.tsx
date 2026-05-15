import { useRef, type MutableRefObject } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { WORLD_SETTINGS } from '../../../packages/content/world';
import { type VecXZ } from '../../../packages/protocol/messages';
import type { GameClientState } from './gameTypes';
import { WorldEventVfx } from './SceneEventVfx';
import { WorldEnvironment } from './WorldEnvironment';
import { WorldFeatures } from './WorldFeatures';
import { ZoneLandmarks } from './ZoneLandmarks';
import { CameraRig } from './CameraRig';
import {
  CastMarker,
  EnemyMarker,
  LootMarker,
  PlayerMarker,
} from './WorldEntities';
import { WorldGround } from './WorldGround';
import { TargetDestinationMarker } from './SceneVfx';

type WorldSceneProps = {
  state: GameClientState;
  onMove: (target: VecXZ) => void;
  onSelectTarget: (targetId: string | null) => void;
  onPickUpLoot: (lootId: string) => void;
  cameraAngleRef?: MutableRefObject<number>;
};

export function WorldScene({ state, onMove, onSelectTarget, onPickUpLoot, cameraAngleRef }: WorldSceneProps) {
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
      <WorldGround focus={focus} onMove={onMove} />
      <WorldFeatures focus={focus} />
      <ZoneLandmarks focus={focus} />
      <TargetDestinationMarker target={state.targetWorldPos} />
      {Object.values(state.players).map((player) => (
        <PlayerMarker
          key={player.id}
          player={player}
          isSelf={player.id === state.myPlayerId}
          presentationRef={player.id === state.myPlayerId ? cameraAnchorRef : undefined}
        />
      ))}
      {Object.values(state.enemies).map((enemy) => (
        <EnemyMarker
          key={enemy.id}
          enemy={enemy}
          isSelected={enemy.id === state.selectedTargetId}
          onSelect={onSelectTarget}
        />
      ))}
      {Object.values(state.groundLoot).map((loot) => (
        <LootMarker key={loot.id} loot={loot} onPickUpLoot={onPickUpLoot} />
      ))}
      {Object.values(state.casts).map((cast) => (
        <CastMarker key={cast.snapshot.castId} cast={cast} />
      ))}
      {Object.values(state.visualEvents).map((event) => (
        <WorldEventVfx key={event.id} event={event} />
      ))}
      <CameraRig focus={focus} presentationFocusRef={cameraAnchorRef} cameraAngleRef={cameraAngleRef} />
    </Canvas>
  );
}
