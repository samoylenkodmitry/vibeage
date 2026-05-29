import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Vec3D } from '../../../packages/protocol/messages';
import { computeDayPhase, SUN_DISTANCE } from './timeOfDay';
import { BirdFlock } from './BirdFlock';
import { NightStars } from './NightStars';
import { ShootingStars } from './ShootingStars';

type WorldEnvironmentProps = {
  focus: Vec3D;
};

// Day-phase palette recompute cadence. 0.2s ≈ 5Hz — far below
// perceptible for a sky that cycles over minutes, but kills ~55
// keyframe-interpolation passes per second.
const PALETTE_REFRESH_S = 0.2;

type DayCycleRefs = {
  hemisphere: React.MutableRefObject<THREE.HemisphereLight | null>;
  directional: React.MutableRefObject<THREE.DirectionalLight | null>;
  sunGroup: React.MutableRefObject<THREE.Group | null>;
  sunPointLight: React.MutableRefObject<THREE.PointLight | null>;
  cloudGroup: React.MutableRefObject<THREE.Group | null>;
  moonGroup: React.MutableRefObject<THREE.Group | null>;
  moonLight: React.MutableRefObject<THREE.PointLight | null>;
};

export function WorldEnvironment({ focus }: WorldEnvironmentProps) {
  const refs: DayCycleRefs = {
    hemisphere: useRef<THREE.HemisphereLight>(null),
    directional: useRef<THREE.DirectionalLight>(null),
    sunGroup: useRef<THREE.Group>(null),
    sunPointLight: useRef<THREE.PointLight>(null),
    cloudGroup: useRef<THREE.Group>(null),
    moonGroup: useRef<THREE.Group>(null),
    moonLight: useRef<THREE.PointLight>(null),
  };
  const moonMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#dde6ff' }), []);
  const sunMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fff1a6' }), []);
  const cloudMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({
      color: new THREE.Color('#dff8ff'),
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    }),
    [],
  );
  const { scene } = useThree();

  useEffect(() => {
    return () => {
      sunMaterial.dispose();
      cloudMaterial.dispose();
      moonMaterial.dispose();
    };
  }, [sunMaterial, cloudMaterial, moonMaterial]);

  // Day-phase palette changes over minutes, so recomputing the
  // keyframe interpolation every frame (60fps) is wasted work.
  // Cache it and refresh at ~5Hz; the per-frame applyDayPhaseToScene
  // still runs every frame for the cheap bits that DO need it
  // (sun/moon/cloud following the player's focus + cloud rotation).
  const paletteRef = useRef(computeDayPhase(Date.now()));
  const paletteAccumRef = useRef(0);
  useInitSceneBackground(scene, paletteRef.current.backgroundColor);

  useFrame((_, delta) => {
    paletteAccumRef.current += delta;
    if (paletteAccumRef.current >= PALETTE_REFRESH_S) {
      paletteAccumRef.current = 0;
      paletteRef.current = computeDayPhase(Date.now());
    }
    applyDayPhaseToScene({ refs, sunMaterial, cloudMaterial, scene, focus, palette: paletteRef.current, delta });
  });

  return (
    <>
      <hemisphereLight ref={refs.hemisphere} args={['#ccecff', '#21402d', 0.82]} />
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
          {/* Bigger again per playtester feedback — the moon should
             feel like a major sky landmark, not a hint. */}
          <sphereGeometry args={[72, 28, 18]} />
        </mesh>
        {/* Soft bluish halo: a slightly larger transparent sphere
           sitting behind the moon disc gives a "moonlit haze" ring
           without needing postprocessing bloom. */}
        <mesh>
          <sphereGeometry args={[96, 18, 12]} />
          <meshBasicMaterial color="#cfd9ff" transparent opacity={0.16} depthWrite={false} fog={false} />
        </mesh>
        <pointLight ref={refs.moonLight} color="#bcd0ff" intensity={0.0} distance={2_200} />
      </group>
      <group ref={refs.cloudGroup}>
        {CLOUDS.map((cloud) => (
          <mesh key={cloud.id} position={cloud.position} scale={cloud.scale} material={cloudMaterial}>
            <sphereGeometry args={[1, 12, 8]} />
          </mesh>
        ))}
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

function applyDayPhaseToScene({ refs, sunMaterial, cloudMaterial, scene, focus, palette, delta }: {
  refs: DayCycleRefs;
  sunMaterial: THREE.MeshBasicMaterial;
  cloudMaterial: THREE.MeshStandardMaterial;
  scene: THREE.Scene;
  focus: Vec3D;
  palette: ReturnType<typeof computeDayPhase>;
  delta: number;
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
  cloudMaterial.color.set(palette.cloudColor);
  cloudMaterial.opacity = palette.cloudOpacity;
  if (refs.cloudGroup.current) {
    refs.cloudGroup.current.rotation.y += delta * 0.012;
    refs.cloudGroup.current.position.set(focus.x, 180, focus.z);
  }
  if (scene.background instanceof THREE.Color) {
    scene.background.set(palette.backgroundColor);
  }
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.color.set(palette.fogColor);
  }
}


const CLOUDS = [
  { id: 'north-1', position: [-260, 0, -180] as [number, number, number], scale: [34, 8, 12] as [number, number, number] },
  { id: 'north-2', position: [-220, 12, -160] as [number, number, number], scale: [22, 7, 10] as [number, number, number] },
  { id: 'east-1', position: [180, 10, -250] as [number, number, number], scale: [42, 8, 14] as [number, number, number] },
  { id: 'east-2', position: [230, 2, -220] as [number, number, number], scale: [26, 7, 12] as [number, number, number] },
  { id: 'west-1', position: [-340, -6, 210] as [number, number, number], scale: [38, 7, 13] as [number, number, number] },
] as const;
