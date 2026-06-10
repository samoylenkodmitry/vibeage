import { useEffect, useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Vec3D } from '../../../packages/protocol/messages';
import { computeDayPhase, SUN_DISTANCE } from './timeOfDay';
import { BirdFlock } from './BirdFlock';
import { NightStars } from './NightStars';
import { ShootingStars } from './ShootingStars';
import { SkyAtmosphere } from './world-art/SkyAtmosphere';

type WorldEnvironmentProps = {
  focus: Vec3D;
  /** Scene fog range. Defaults to SCENE_FOG (the close, frontier-hiding fog);
   *  WorldScene passes the far vista range when the HorizonTerrainShell is
   *  mounted to carry the distance. Read once on mount (quality is static). */
  fog?: { near: number; far: number };
};

// Day-phase palette recompute cadence. 0.2s ≈ 5Hz — far below
// perceptible for a sky that cycles over minutes, but kills ~55
// keyframe-interpolation passes per second.
const PALETTE_REFRESH_S = 0.2;

// Atmospheric scene fog. Without it scene.fog is null — the streaming foliage
// frontier (~960 m, see WorldFoliage) and the terrain view edge (1024 m) pop
// against a perfectly clear 9 km camera as the player crosses chunk lines.
// This close range is the LOW-tier default: `far` sits just past the foliage
// frontier so chunks mount/unmount fully inside the mist. Medium/high tiers
// mount the HorizonTerrainShell (±4 km relief) and pass VISTA_FOG via the
// `fog` prop instead — the shell carries the ground past the frontier, so the
// fog can sit far out and the mountains read as a hazy vista. Mega landmarks
// render fog={false} (WorldFeatures) and still pierce it as horizon beacons.
// Distinct from WORLD_SETTINGS.fogFar (5400), which is only a
// landmark-visibility cull distance, not real fog.
const SCENE_FOG = { near: 450, far: 1120 } as const;

type DayCycleRefs = {
  hemisphere: React.MutableRefObject<THREE.HemisphereLight | null>;
  ambient: React.MutableRefObject<THREE.AmbientLight | null>;
  directional: React.MutableRefObject<THREE.DirectionalLight | null>;
  sunGroup: React.MutableRefObject<THREE.Group | null>;
  sunPointLight: React.MutableRefObject<THREE.PointLight | null>;
  moonGroup: React.MutableRefObject<THREE.Group | null>;
  moonLight: React.MutableRefObject<THREE.PointLight | null>;
};

export function WorldEnvironment({ focus, fog = SCENE_FOG }: WorldEnvironmentProps) {
  const refs: DayCycleRefs = {
    hemisphere: useRef<THREE.HemisphereLight>(null),
    ambient: useRef<THREE.AmbientLight>(null),
    directional: useRef<THREE.DirectionalLight>(null),
    sunGroup: useRef<THREE.Group>(null),
    sunPointLight: useRef<THREE.PointLight>(null),
    moonGroup: useRef<THREE.Group>(null),
    moonLight: useRef<THREE.PointLight>(null),
  };
  // Lazy useRef (not useMemo) for the disposable materials: useMemo can be evicted
  // under memory pressure, which would orphan the GPU resource without dispose().
  const moonMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  if (!moonMaterialRef.current) moonMaterialRef.current = new THREE.MeshBasicMaterial({ color: '#dde6ff' });
  const moonMaterial = moonMaterialRef.current;
  const sunMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  if (!sunMaterialRef.current) sunMaterialRef.current = new THREE.MeshBasicMaterial({ color: '#fff1a6' });
  const sunMaterial = sunMaterialRef.current;
  const { scene } = useThree();

  useEffect(() => {
    return () => {
      sunMaterialRef.current?.dispose();
      moonMaterialRef.current?.dispose();
    };
  }, []);

  // Day-phase palette changes over minutes, so recomputing the
  // keyframe interpolation every frame (60fps) is wasted work.
  // Cache it and refresh at ~5Hz; the per-frame applyDayPhaseToScene
  // still runs every frame for the cheap bits that DO need it
  // (sun/moon following the player's focus).
  const paletteRef = useRef(computeDayPhase(Date.now()));
  const paletteAccumRef = useRef(0);
  useInitSceneBackground(scene, paletteRef.current.backgroundColor);
  useInitSceneFog(scene, paletteRef.current.fogColor, fog);

  useFrame((_, delta) => {
    paletteAccumRef.current += delta;
    if (paletteAccumRef.current >= PALETTE_REFRESH_S) {
      paletteAccumRef.current = 0;
      paletteRef.current = computeDayPhase(Date.now());
    }
    applyDayPhaseToScene({ refs, sunMaterial, scene, focus, palette: paletteRef.current });
  });

  return (
    <>
      <SkyAtmosphere focus={focus} palette={paletteRef} />
      <hemisphereLight ref={refs.hemisphere} args={['#ccecff', '#21402d', 0.82]} />
      {/* Phase-driven fill (set in applyDayPhaseToScene) keeps the foreground readable when the sun is low/absent. */}
      <ambientLight ref={refs.ambient} intensity={0.35} />
      <directionalLight
        ref={refs.directional}
        position={[focus.x + 240, 420, focus.z + 180]}
        intensity={1.55}
        castShadow
      />
      <group ref={refs.sunGroup}>
        <mesh material={sunMaterial}>
          <sphereGeometry args={[34, 24, 16]} />
        </mesh>
        {/* Warm halo behind the sun disc — gives golden bloom feel
           at sunrise/sunset without needing postprocessing. */}
        <mesh>
          <sphereGeometry args={[50, 18, 12]} />
          <meshBasicMaterial color="#ffd76b" transparent opacity={0.22} depthWrite={false} fog={false} />
        </mesh>
        <pointLight ref={refs.sunPointLight} color="#ffe7a3" intensity={2.2} distance={1_400} />
      </group>
      <group ref={refs.moonGroup}>
        <mesh material={moonMaterial}>
          {/* Big disc so the moon reads as a major sky landmark, not a hint. */}
          <sphereGeometry args={[72, 28, 18]} />
        </mesh>
        {/* Soft bluish "moonlit haze" halo behind the disc (no postprocessing). */}
        <mesh>
          <sphereGeometry args={[96, 18, 12]} />
          <meshBasicMaterial color="#cfd9ff" transparent opacity={0.16} depthWrite={false} fog={false} />
        </mesh>
        <pointLight ref={refs.moonLight} color="#bcd0ff" intensity={0.0} distance={2_200} />
      </group>
      <NightStars />
      <ShootingStars />
      <BirdFlock focus={focus} />
      {/* Foliage now streams per terrain-chunk in WorldFoliage (position-stable). */}
    </>
  );
}

/**
 * Seed scene.background with a THREE.Color on mount. It defaults to null (the
 * canvas then shows its black clear colour), and applyDayPhaseToScene only
 * *updates* the background when it's already a Color — so without this the
 * day-phase sky colour is never applied and the sky stays black at every phase
 * (most obvious in daylight). WorldEnvironment owns the sky; it restores the
 * previous value on unmount.
 */
function useInitSceneBackground(scene: THREE.Scene, initialColor: string): void {
  useLayoutEffect(() => {
    const previous = scene.background;
    scene.background = new THREE.Color(initialColor);
    return () => {
      scene.background = previous;
    };
  }, [scene, initialColor]);
}

/**
 * Seed scene.fog with a THREE.Fog on mount. Like the background it defaults to
 * null, and applyDayPhaseToScene only *recolours* fog when it already exists —
 * so without this there is no fog at all and the streaming frontier pops. Owns
 * the fog; restores the previous value on unmount.
 */
function useInitSceneFog(scene: THREE.Scene, initialColor: string, range: { near: number; far: number }): void {
  // Capture the colour/range once on mount. applyDayPhaseToScene recolours the
  // fog every frame, so re-running this effect on each palette tick would
  // needlessly recreate the THREE.Fog (object churn / uniform updates) for no
  // visual gain; the range comes from the static quality tier anyway.
  const initialRef = useRef({ color: initialColor, range });
  useLayoutEffect(() => {
    const previous = scene.fog;
    scene.fog = new THREE.Fog(initialRef.current.color, initialRef.current.range.near, initialRef.current.range.far);
    return () => {
      scene.fog = previous;
    };
  }, [scene]);
}

function applyDayPhaseToScene({ refs, sunMaterial, scene, focus, palette }: {
  refs: DayCycleRefs;
  sunMaterial: THREE.MeshBasicMaterial;
  scene: THREE.Scene;
  focus: Vec3D;
  palette: ReturnType<typeof computeDayPhase>;
}): void {
  const sunX = focus.x + palette.sunDir.x * SUN_DISTANCE;
  const sunY = palette.sunDir.y * SUN_DISTANCE;
  const sunZ = focus.z + palette.sunDir.z * SUN_DISTANCE;
  const moonX = focus.x + palette.moonDir.x * SUN_DISTANCE;
  const moonY = palette.moonDir.y * SUN_DISTANCE;
  const moonZ = focus.z + palette.moonDir.z * SUN_DISTANCE;

  if (refs.hemisphere.current) {
    refs.hemisphere.current.color.set(palette.hemisphereSky);
    refs.hemisphere.current.groundColor.set(palette.hemisphereGround);
    refs.hemisphere.current.intensity = palette.hemisphereIntensity;
  }
  if (refs.ambient.current) {
    // Tint the fill with the sky colour so it matches the phase mood instead
    // of washing it to flat grey.
    refs.ambient.current.color.set(palette.hemisphereSky);
    refs.ambient.current.intensity = palette.ambientIntensity;
  }
  if (refs.directional.current) {
    refs.directional.current.position.set(sunX, sunY, sunZ);
    refs.directional.current.color.set(palette.sunColor);
    refs.directional.current.intensity = palette.sunIntensity;
  }
  if (refs.sunGroup.current) {
    refs.sunGroup.current.position.set(sunX, sunY, sunZ);
    refs.sunGroup.current.visible = palette.sunDir.y > -0.05;
  }
  if (refs.sunPointLight.current) {
    refs.sunPointLight.current.color.set(palette.sunColor);
    refs.sunPointLight.current.intensity = Math.max(0, palette.sunDir.y) * 2.2;
  }
  if (refs.moonGroup.current) {
    refs.moonGroup.current.position.set(moonX, moonY, moonZ);
    refs.moonGroup.current.visible = palette.moonDir.y > -0.05;
  }
  if (refs.moonLight.current) {
    // Moonlight v4 — still too dark after 3.2. Pushing to 4.5
    // (gated by moon altitude so it fades naturally when the moon
    // dips below the horizon).
    refs.moonLight.current.intensity = Math.max(0, palette.moonDir.y) * 4.5;
  }
  sunMaterial.color.set(palette.sunColor);
  if (scene.background instanceof THREE.Color) {
    scene.background.set(palette.backgroundColor);
  }
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.color.set(palette.fogColor);
  }
}


