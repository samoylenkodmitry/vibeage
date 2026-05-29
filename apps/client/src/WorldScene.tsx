import { useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Preload, StatsGl } from '@react-three/drei';
import * as THREE from 'three';
import { WORLD_SETTINGS } from '../../../packages/content/world';
import { type VecXZ } from '../../../packages/protocol/messages';
import type { GameClientState } from './gameTypes';
import { WorldEventVfx } from './SceneEventVfx';
import { WorldEnvironment } from './WorldEnvironment';
import { WorldFeatures } from './WorldFeatures';
import { ZoneLandmarks } from './ZoneLandmarks';
import { CameraRig, type CameraControls } from './CameraRig';
import { CozyWorldArt } from './world-art/CozyWorldArt';
import { chooseWorldArtQuality } from './world-art/quality';
import { SimpleStylizedWater } from './world-art/SimpleStylizedWater';
import { pickActiveScene, STARTER_COZY_COAST } from './world-art/worldArtScenes';

// Sand only hugs the coast waterline; the meadow inland stays grass. A
// chunk-local region (not a global flip) so the ground texture is fixed
// by location and never snaps when the player crosses the coast edge.
const STARTER_COAST_SAND = {
  x: STARTER_COZY_COAST.waterline.x + 70,
  z: STARTER_COZY_COAST.waterline.z,
  radius: 150,
} as const;
import {
  CastMarker,
  EnemyMarker,
  NpcMarkers,
  LootMarker,
  PlayerMarker,
} from './WorldEntities';
import { WorldGround } from './WorldGround';
import { WorldFoliage } from './WorldFoliage';
import { BossTelegraphRing, TargetDestinationMarker } from './SceneVfx';
import { ScenePostFX } from './ScenePostFX';
import { hasActiveEffect } from './hud/effectMeta';
import { getTerrainY } from './worldSceneConfig';
import { DynamicLightPool } from './dynamicLights';

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
  const lootRevealed = hasActiveEffect(myPlayer?.statusEffects, 'reveal_loot'); // Treasure Sense
  const cameraAnchorRef = useRef<THREE.Vector3 | null>(null) as MutableRefObject<THREE.Vector3 | null>;
  // WorldEnvironment owns the sky/sun/moon/clouds/day-night palette
  // everywhere. The cozy hero scene only contributes anchored geometry
  // (water, shore, dock, foliage) on top of that — never atmosphere.
  const worldArtQuality = useMemo(() => chooseWorldArtQuality(), []);
  const activeCozyScene = pickActiveScene(focus.x, focus.z);
  // Keep the cozy scene mounted once entered — re-crossing the radius would
  // otherwise re-clone ~310 GLB instances (multi-second hitch). Swap only on a new scene.
  const mountedSceneRef = useRef(activeCozyScene);
  if (activeCozyScene && activeCozyScene !== mountedSceneRef.current) {
    mountedSceneRef.current = activeCozyScene;
  }
  const mountedScene = mountedSceneRef.current;

  return (
    <Canvas
      camera={{ position: [0, 14, 20], fov: 52, near: 0.1, far: WORLD_SETTINGS.cameraFar }}
      onCreated={({ gl }) => {
        gl.setPixelRatio(Math.min(window.devicePixelRatio, worldArtQuality === 'high' ? 2 : 1.5));
      }}
    >
      {/* Warm up shaders up front so the WebGL link stall (getProgramInfoLog) doesn't freeze a gameplay frame; foliage materials are shared across biomes so one pass covers later sectors. */}
      <Preload all />
      <DynamicLightPool focus={focus} />
      {import.meta.env.DEV && <StatsGl />}
      <WorldEnvironment focus={focus} />
      <WorldFoliage focus={focus} quality={worldArtQuality} />
      {/* Stylized water always renders (anchored to the starter coast's
          waterline) so the sea stays visible from inland sectors; the
          rest of the cozy art (foam, shells, driftwood) is scene-bound. */}
      <SimpleStylizedWater scene={STARTER_COZY_COAST} />
      {mountedScene && <CozyWorldArt scene={mountedScene} quality={worldArtQuality} />}
      <WorldGround focus={focus} onMove={onMove} cameraControlsRef={cameraControlsRef} touchClaimRef={touchClaimRef} visualMode="textured" sandRegion={STARTER_COAST_SAND} />
      <WorldFeatures focus={focus} />
      <ZoneLandmarks focus={focus} />
      <TargetDestinationMarker target={state.targetWorldPos} />
      {state.bossTelegraphs.map((t) => (
        <BossTelegraphRing
          key={`${t.enemyId}-${t.startedAt}`}
          x={t.x}
          z={t.z}
          radius={t.radius}
          innerRadius={t.innerRadius}
          directionRad={t.directionRad}
          halfAngleDeg={t.halfAngleDeg}
          startedAt={t.startedAt}
          impactAt={t.impactAt}
        />
      ))}
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
        <LootMarker key={loot.id} loot={loot} onPickUpLoot={onPickUpLoot} revealed={lootRevealed} />
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
      <ScenePostFX quality={worldArtQuality} />
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
