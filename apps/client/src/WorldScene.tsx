import { useCallback, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Preload, StatsGl } from '@react-three/drei';
import * as THREE from 'three';
import { WORLD_SETTINGS } from '../../../packages/content/world';
import { type VecXZ, type CastSnapshot } from '../../../packages/protocol/messages';
import type { GameClientState } from './gameTypes';
import { WorldEventVfx } from './SceneEventVfx';
import { WorldEnvironment } from './WorldEnvironment';
import { WorldFeatures } from './WorldFeatures';
import { ZoneLandmarks } from './ZoneLandmarks';
import { CameraRig, type CameraControls } from './CameraRig';
import { CozyWorldArt } from './world-art/CozyWorldArt';
import type { WorldArtQuality } from './world-art/quality';
import { resolveGraphics, getGraphicsSettings, useResolvedGraphics } from './graphicsSettings';
import { SimpleStylizedWater } from './world-art/SimpleStylizedWater';
import { HorizonTerrainShell } from './world-art/HorizonTerrainShell';
import { LakeWaters } from './world-art/LakeWaters';
import { GlacialValeDressing } from './world-art/GlacialValeDressing';
import { VALE_HD } from './world-art/GlacialValeTerrain';
import { GLACIAL_VALE } from '../../../packages/content/terrain';
import { WebGLGate, RendererContextLossGuard, RendererContextLostOverlay } from './world-art/webglSupport';
import { pickActiveScene, STARTER_COZY_COAST } from './world-art/worldArtScenes';
import {
  CastMarker,
  EnemyMarker,
  NpcMarkers,
  LootMarker,
  PlayerMarker,
} from './WorldEntities';

// Sand only hugs the coast waterline; the meadow inland stays grass. A
// chunk-local region (not a global flip) so the ground texture is fixed
// by location and never snaps when the player crosses the coast edge.
const STARTER_COAST_SAND = {
  x: STARTER_COZY_COAST.waterline.x + 70,
  z: STARTER_COZY_COAST.waterline.z,
  radius: 150,
} as const;

// Fog range when the HorizonTerrainShell carries the ground to ±4 km
// (medium/high tiers): far enough that mountain ridges read as a vista,
// near enough that the 960 m foliage frontier still mounts inside haze.
const VISTA_FOG = { near: 500, far: 2600 } as const;
// Phones get the vista too, just closer: shell to the horizon, fog tighter so
// the 640 m foliage frontier still mounts inside meaningful haze.
const VISTA_FOG_LOW = { near: 420, far: 1600 } as const;
// Fog off (user setting): push the band past the camera-far so scene.fog never
// tints a fragment — the foliage frontier will pop, the player's choice.
const FOG_DISABLED = { near: 50_000, far: 100_000 } as const;

// antialias:false — the default canvas 4xMSAA framebuffer is huge (~150 MB at
// phone DPR; a prime mobile OOM suspect) and on med/high it's pure waste: the
// EffectComposer does its own AA (4x MSAA target on high, SMAA on medium) and
// the canvas is just the blit target. Low accepts mild jaggies — physically
// tiny on dense phone screens.
const CANVAS_GL_OPTIONS = { antialias: false, powerPreference: 'high-performance' } as const;
import { WorldGround } from './WorldGround';
import { WorldFoliage } from './WorldFoliage';
import { AmbientLife } from './world-art/AmbientLife';
import { WorldShaderGrass } from './WorldShaderGrass';
import { BossTelegraphRing, TargetDestinationMarker, castAnchorsAtTarget } from './SceneVfx';
import { ScenePostFX } from './ScenePostFX';
import { hasActiveEffect } from './hud/effectMeta';
import { getTerrainY } from './worldSceneConfig';
import { DynamicLightPool, GlowEmitter } from './dynamicLights';
import { isCastInActiveTimeField, isPointInActiveTimeField } from './timeFreeze';

/** Anchor for a target-delivered cast (deluge): the targeted entity's LIVE
 *  position (so the effect tracks a moving target), else the server's resolved
 *  target point. Undefined for normal casts → they anchor at the snapshot pos. */
function resolveCastAnchor(state: GameClientState, snapshot: CastSnapshot): { x: number; z: number } | undefined {
  if (!castAnchorsAtTarget(snapshot.skillId)) return undefined;
  if (snapshot.targetId) {
    const entity = state.enemies[snapshot.targetId] ?? state.players[snapshot.targetId];
    if (entity) return { x: entity.position.x, z: entity.position.z };
  }
  return snapshot.target;
}

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

function setUpRenderer(gl: THREE.WebGLRenderer, resolutionScale: number): void {
  // Low = phones: DPR cap keeps fill-rate (and SoC temperature) sane on 3x-DPR
  // screens; the UI stays crisp because it's DOM, not canvas. The cap is the
  // resolved graphics setting (per-tier preset by default; user-overridable).
  gl.setPixelRatio(Math.min(window.devicePixelRatio, resolutionScale));
  // Without preventDefault the browser treats a GPU context loss as permanent
  // and never fires webglcontextrestored — three.js can recover automatically
  // once restoration is allowed (ScenePostFX unmounts its composer for the
  // lost interval).
  gl.domElement.addEventListener('webglcontextlost', (event) => event.preventDefault());
}

/**
 * True when the camera is inside the vale (where the HD vale mounts — not on
 * low/phones), so ScenePostFX resolves with ACES (deedy's renderer). Hysteresis
 * band (enter <1400, leave >1750) so a player lingering at the boundary can't
 * thrash the composer rebuild the ACES↔NEUTRAL swap triggers. WorldScene
 * re-renders every tick, so the ref's flips propagate on the next render.
 */
function useValeHD(focus: { x: number; z: number }, valeHDEnabled: boolean): boolean {
  const ref = useRef(false);
  if (!VALE_HD || !valeHDEnabled) {
    ref.current = false;
  } else {
    const d = Math.hypot(focus.x - GLACIAL_VALE.x, focus.z - GLACIAL_VALE.z);
    if (d < 1400) ref.current = true;
    else if (d > 1750) ref.current = false;
  }
  return ref.current;
}

export function WorldScene({ state, onMove, onSelectTarget, onAttackTarget, onPickUpLoot, cameraAngleRef, cameraControlsRef, touchClaimRef, navigationMarker }: WorldSceneProps) {
  const myPlayer = state.myPlayerId ? state.players[state.myPlayerId] ?? null : null;
  const focus = myPlayer?.position ?? { x: 0, y: 0.5, z: 0 };
  const lootRevealed = hasActiveEffect(myPlayer?.statusEffects, 'reveal_loot'); // Treasure Sense
  const activeTimeFields = state.activePhysicsFields;
  const now = Date.now();
  const cameraAnchorRef = useRef<THREE.Vector3 | null>(null) as MutableRefObject<THREE.Vector3 | null>;
  // User-configurable graphics (graphicsSettings). The renderer/canvas-level
  // knobs (tier, resolutionScale, shadows) are set once at Canvas creation and
  // can't change live, so freeze them at mount — a change to those needs a
  // reload (the settings panel says so). The cheap per-frame knobs (valeHD,
  // bloom, godRays, antialias, fog) read live so toggling them takes effect
  // immediately. Defaults (all 'auto') resolve to the old per-tier behaviour.
  const mountGraphics = useMemo(() => resolveGraphics(getGraphicsSettings()), []);
  const liveGraphics = useResolvedGraphics();
  const worldArtQuality: WorldArtQuality = mountGraphics.tier;
  const [contextLost, setContextLost] = useState(false); // GPU dropped the render context → overlay below
  const valeHD = useValeHD(focus, liveGraphics.valeHD);

  // Sun disc handed up by WorldEnvironment → anchors GodRays in ScenePostFX.
  const [sunMesh, setSunMesh] = useState<THREE.Mesh | null>(null);
  const handleSunMesh = useCallback((mesh: THREE.Mesh | null) => setSunMesh((prev) => (prev === mesh ? prev : mesh)), []);
  const activeCozyScene = pickActiveScene(focus.x, focus.z);
  // Keep the cozy scene mounted once entered (remount = multi-second hitch).
  const mountedSceneRef = useRef(activeCozyScene);
  if (activeCozyScene && activeCozyScene !== mountedSceneRef.current) {
    mountedSceneRef.current = activeCozyScene;
  }
  const mountedScene = mountedSceneRef.current;

  return (
    <WebGLGate>
    <Canvas
      camera={{ position: [0, 14, 20], fov: 52, near: 0.1, far: WORLD_SETTINGS.cameraFar }}
      /* 'percentage' = PCFShadowMap; both `true` and 'soft' pick the DEPRECATED
         PCFSoftShadowMap, which three re-warns about every frame (500+ lines). */
      shadows={mountGraphics.shadows ? 'percentage' : false}
      gl={CANVAS_GL_OPTIONS}
      onCreated={({ gl }) => setUpRenderer(gl, mountGraphics.resolutionScale)}
    >
      {/* Warm up shaders up front so the WebGL link stall (getProgramInfoLog) doesn't freeze a gameplay frame; foliage materials are shared across biomes so one pass covers later sectors. */}
      <Preload all />
      <RendererContextLossGuard onChange={setContextLost} />
      <DynamicLightPool focus={focus} />
      {/* Personal moonlamp — character readable at night. Pool-routed. */}
      <group position={[focus.x, getTerrainY(focus.x, focus.z) + 2.2, focus.z]}>
        <GlowEmitter color="#d9e6ff" intensity={1.3} distance={15} priority={2} />
      </group>
      {import.meta.env.DEV && <StatsGl />}
      {/* Med/high: vista fog + horizon shell; low keeps close fog. onSunMesh only when the composer mounts (low has no postFX). */}
      <WorldEnvironment
        focus={focus}
        fog={liveGraphics.fog ? (worldArtQuality === 'low' ? VISTA_FOG_LOW : VISTA_FOG) : FOG_DISABLED}
        onSunMesh={worldArtQuality === 'low' ? undefined : handleSunMesh}
      />
      {/* One draw call + a one-off 47 ms bake — phones can afford mountains. */}
      <HorizonTerrainShell focus={focus} />
      <WorldFoliage focus={focus} quality={worldArtQuality} />
      <WorldShaderGrass focus={focus} quality={worldArtQuality} />
      {worldArtQuality !== 'low' && <AmbientLife focus={focus} />}
      {/* Water anchored to the starter coast waterline (visible from inland); the rest of the cozy art is scene-bound. */}
      <SimpleStylizedWater scene={STARTER_COZY_COAST} />
      {/* Lakes: discs at the analytic lattice peaks; terrain buries the rim. */}
      {worldArtQuality !== 'low' && <LakeWaters focus={focus} />}
      {worldArtQuality !== 'low' && <GlacialValeDressing focus={focus} />}
      {mountedScene && <CozyWorldArt scene={mountedScene} />}
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
      <WorldEntityMarkers state={state} activeTimeFields={activeTimeFields} cameraAnchorRef={cameraAnchorRef} onSelectTarget={onSelectTarget} onAttackTarget={onAttackTarget} />
      <NpcMarkers />

      <WorldLootMarkers state={state} onPickUpLoot={onPickUpLoot} revealed={lootRevealed} activeTimeFields={activeTimeFields} now={now} />
      <WorldCastMarkers state={state} activeTimeFields={activeTimeFields} now={now} />
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
      <ScenePostFX quality={worldArtQuality} sunMesh={sunMesh} valeHD={valeHD} bloom={liveGraphics.bloom} godRays={liveGraphics.godRays} antialias={liveGraphics.antialias} />
    </Canvas>
    {contextLost && <RendererContextLostOverlay />}
    </WebGLGate>
  );
}

type ActiveTimeFieldMap = GameClientState['activePhysicsFields'];

function WorldEntityMarkers({
  state,
  activeTimeFields,
  cameraAnchorRef,
  onSelectTarget,
  onAttackTarget,
}: {
  state: GameClientState;
  activeTimeFields: ActiveTimeFieldMap;
  cameraAnchorRef: MutableRefObject<THREE.Vector3 | null>;
  onSelectTarget: (targetId: string | null) => void;
  onAttackTarget?: (targetId: string) => void;
}) {
  return (
    <>
      {Object.values(state.players).map((player) => (
        <PlayerMarker
          key={player.id}
          player={player}
          isSelf={player.id === state.myPlayerId}
          isSelected={player.id === state.selectedTargetId}
          presentationRef={player.id === state.myPlayerId ? cameraAnchorRef : undefined}
          equipment={player.id === state.myPlayerId ? state.equipment : undefined}
          activeTimeFields={activeTimeFields}
          onSelect={onSelectTarget}
          onAttack={onAttackTarget}
        />
      ))}
      {Object.values(state.enemies).map((enemy) => (
        <EnemyMarker
          key={enemy.id}
          enemy={enemy}
          isSelected={enemy.id === state.selectedTargetId}
          activeTimeFields={activeTimeFields}
          onSelect={onSelectTarget}
          onAttack={onAttackTarget}
        />
      ))}
    </>
  );
}

function WorldLootMarkers({
  state,
  onPickUpLoot,
  revealed,
  activeTimeFields,
  now,
}: {
  state: GameClientState;
  onPickUpLoot: (lootId: string) => void;
  revealed: boolean;
  activeTimeFields: ActiveTimeFieldMap;
  now: number;
}) {
  return (
    <>
      {Object.values(state.groundLoot).map((loot) => (
        <LootMarker
          key={loot.id}
          loot={loot}
          onPickUpLoot={onPickUpLoot}
          revealed={revealed}
          frozen={isPointInActiveTimeField(activeTimeFields, loot.position, now)}
        />
      ))}
    </>
  );
}

function WorldCastMarkers({
  state,
  activeTimeFields,
  now,
}: {
  state: GameClientState;
  activeTimeFields: ActiveTimeFieldMap;
  now: number;
}) {
  return (
    <>
      {Object.values(state.casts).map((cast) => {
        const anchorPos = resolveCastAnchor(state, cast.snapshot);
        const freezePoint = anchorPos ?? cast.snapshot.pos;
        return (
          <CastMarker
            key={cast.snapshot.castId}
            cast={cast}
            anchorPos={anchorPos}
            frozen={cast.snapshot.skillId !== 'time_sphere' && isCastInActiveTimeField(activeTimeFields, cast.snapshot, freezePoint, now)}
          />
        );
      })}
    </>
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
