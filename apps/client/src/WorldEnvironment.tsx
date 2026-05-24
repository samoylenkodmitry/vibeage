import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { sampleTerrain, type TerrainBiome } from '../../../packages/content/terrain';
import { WORLD_SETTINGS } from '../../../packages/content/world';
import type { Vec3D } from '../../../packages/protocol/messages';
import { computeDayPhase, SUN_DISTANCE } from './timeOfDay';
import { BirdFlock } from './BirdFlock';
import { NightStars } from './NightStars';
import { InstancedGltf } from './world-art/InstancedGltf';

type WorldEnvironmentProps = {
  focus: Vec3D;
};

type FoliageInstance = {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
  color: string;
};

const matrix = new THREE.Matrix4();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3();
const position = new THREE.Vector3();
const rotation = new THREE.Euler();

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

  useFrame((_, delta) => {
    const palette = computeDayPhase(Date.now());
    applyDayPhaseToScene({ refs, sunMaterial, cloudMaterial, scene, focus, palette, delta });
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
      <BirdFlock focus={focus} />
      <FoliageField focus={focus} />
    </>
  );
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

const BROADLEAF_GLB = '/models/trees/pine_b.glb';
const CONIFER_GLB = '/models/trees/pine_a.glb';
const ACCENT_GLB_SMALL = '/models/rocks/rock_round_small.glb';
const ACCENT_GLB_MEDIUM = '/models/rocks/rock_medium_a.glb';
const TREE_GLB_ALT = '/models/trees/pine_c.glb';
const TREE_WIND = { amplitude: 0.14, speed: 0.85 } as const;

function FoliageField({ focus }: WorldEnvironmentProps) {
  const regenCell = getFoliageRegenCell(focus.x, focus.z);
  const instances = useMemo(
    () => getFoliageInstances(regenCell.x, regenCell.z),
    [regenCell.x, regenCell.z],
  );
  // Trees and accents are GLB-instanced (Quaternius CC0 pines +
  // rock); grass stays procedural since a 1300-tuft GLB layer
  // would dominate the draw budget for tiny ground detail.
  //
  // Per-instance tint via `colors` brings back the biome variety
  // the procedural foliage had: forest stays dark green, autumn
  // shifts amber, ethereal trends cool, etc. The Quaternius
  // texture still shows through; we're modulating, not replacing.
  // Split each kind into two pools by index parity so the forest
  // reads as varied (two pine GLBs) and the rock fields mix
  // small/medium boulders instead of cloned pebbles.
  const trees = useMemo(() => splitByParity(instances.trees), [instances.trees]);
  const conifers = useMemo(() => splitByParity(instances.conifers), [instances.conifers]);
  const accents = useMemo(() => splitByParity(instances.accents), [instances.accents]);

  return (
    <>
      <Suspense fallback={null}>
        <InstancedGltf src={BROADLEAF_GLB} matrices={trees.evenMatrices} colors={trees.evenColors} baseScale={1.4} wind={TREE_WIND} />
        <InstancedGltf src={TREE_GLB_ALT} matrices={trees.oddMatrices} colors={trees.oddColors} baseScale={1.4} wind={TREE_WIND} />
        <InstancedGltf src={CONIFER_GLB} matrices={conifers.evenMatrices} colors={conifers.evenColors} baseScale={1.6} wind={TREE_WIND} />
        <InstancedGltf src={TREE_GLB_ALT} matrices={conifers.oddMatrices} colors={conifers.oddColors} baseScale={1.6} wind={TREE_WIND} />
        <InstancedGltf src={ACCENT_GLB_SMALL} matrices={accents.evenMatrices} colors={accents.evenColors} baseScale={0.8} />
        <InstancedGltf src={ACCENT_GLB_MEDIUM} matrices={accents.oddMatrices} colors={accents.oddColors} baseScale={0.6} />
      </Suspense>
      <InstancedFoliage instances={instances.grass} geometry="cone" radius={0.22} height={0.9} yOffset={0.45} />
    </>
  );
}

function splitByParity(insts: FoliageInstance[]): {
  evenMatrices: THREE.Matrix4[];
  oddMatrices: THREE.Matrix4[];
  evenColors: THREE.Color[];
  oddColors: THREE.Color[];
} {
  const evenMatrices: THREE.Matrix4[] = [];
  const oddMatrices: THREE.Matrix4[] = [];
  const evenColors: THREE.Color[] = [];
  const oddColors: THREE.Color[] = [];
  for (let i = 0; i < insts.length; i += 1) {
    const m = instanceMatrix(insts[i]);
    const c = instanceColor(insts[i]);
    if (i % 2 === 0) { evenMatrices.push(m); evenColors.push(c); }
    else { oddMatrices.push(m); oddColors.push(c); }
  }
  return { evenMatrices, oddMatrices, evenColors, oddColors };
}

function instanceMatrix(instance: FoliageInstance): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  m.compose(
    new THREE.Vector3(instance.x, instance.y, instance.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, instance.rotation, 0)),
    new THREE.Vector3(instance.scale, instance.scale, instance.scale),
  );
  return m;
}

// Reused Color objects keyed by hex; biome palettes have a small
// fixed set of colors (one per biome × foliage type), so this
// caps total allocations at ~20-30 Color objects regardless of
// how many trees are scattered.
const FOLIAGE_COLOR_CACHE = new Map<string, THREE.Color>();

function instanceColor(instance: FoliageInstance): THREE.Color {
  let cached = FOLIAGE_COLOR_CACHE.get(instance.color);
  if (!cached) {
    cached = new THREE.Color(instance.color);
    FOLIAGE_COLOR_CACHE.set(instance.color, cached);
  }
  return cached;
}

function InstancedFoliage({
  instances,
  geometry,
  radius,
  height,
  yOffset,
}: {
  instances: FoliageInstance[];
  geometry: 'cone' | 'cylinder' | 'dodecahedron' | 'sphere';
  radius: number;
  height: number;
  yOffset: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const instanceColor = useMemo(() => new THREE.Color(), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) {
      return;
    }

    instances.forEach((instance, index) => {
      position.set(instance.x, instance.y + yOffset * instance.scale, instance.z);
      rotation.set(0, instance.rotation, 0);
      quaternion.setFromEuler(rotation);
      scale.set(instance.scale, instance.scale, instance.scale);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, instanceColor.set(instance.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [instanceColor, instances, yOffset]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, instances.length)]} castShadow receiveShadow>
      {getFoliageGeometry(geometry, radius, height)}
      <meshStandardMaterial roughness={0.88} vertexColors />
    </instancedMesh>
  );
}

function getFoliageRegenCell(focusX: number, focusZ: number): { x: number; z: number } {
  const stride = WORLD_SETTINGS.foliageCellSize * WORLD_SETTINGS.foliageRegenStride;
  return {
    x: Math.floor(focusX / stride) * WORLD_SETTINGS.foliageRegenStride,
    z: Math.floor(focusZ / stride) * WORLD_SETTINGS.foliageRegenStride,
  };
}

function getFoliageInstances(centerX: number, centerZ: number): {
  trees: FoliageInstance[];
  trunks: FoliageInstance[];
  conifers: FoliageInstance[];
  coniferTrunks: FoliageInstance[];
  grass: FoliageInstance[];
  accents: FoliageInstance[];
} {
  const cellSize = WORLD_SETTINGS.foliageCellSize;
  const radius = WORLD_SETTINGS.visibleFoliageCellRadius;
  const trees: FoliageInstance[] = [];
  const conifers: FoliageInstance[] = [];
  const grass: FoliageInstance[] = [];
  const accents: FoliageInstance[] = [];

  for (let dz = -radius; dz <= radius; dz += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const cellX = centerX + dx;
      const cellZ = centerZ + dz;
      const random = seededRandom(cellX, cellZ);
      const x = (cellX + random()) * cellSize;
      const z = (cellZ + random()) * cellSize;
      const sample = sampleTerrain(x, z);
      const distanceFalloff = Math.max(0, 1 - Math.hypot(dx, dz) / (radius + 1));
      const coniferShare = getConiferShare(sample.biome);

      if (random() < sample.treeDensity * distanceFalloff) {
        const isConifer = random() < coniferShare;
        const target = isConifer ? conifers : trees;
        target.push({
          x,
          y: sample.height,
          z,
          scale: isConifer ? 0.78 + random() * 0.78 : 0.72 + random() * 0.92,
          rotation: random() * Math.PI * 2,
          color: isConifer ? darkenForConifer(sample.foliageColor) : sample.foliageColor,
        });
      }

      if (random() < sample.grassDensity * Math.max(0.18, distanceFalloff)) {
        grass.push({
          x: x + (random() - 0.5) * cellSize * 0.5,
          y: sample.height,
          z: z + (random() - 0.5) * cellSize * 0.5,
          scale: 0.7 + random() * 0.8,
          rotation: random() * Math.PI * 2,
          color: sample.foliageColor,
        });
      }

      if (random() < sample.roughness * 0.08 * Math.max(0.24, distanceFalloff)) {
        accents.push({
          x: x + (random() - 0.5) * cellSize * 0.34,
          y: sample.height,
          z: z + (random() - 0.5) * cellSize * 0.34,
          scale: 0.45 + random() * 0.9,
          rotation: random() * Math.PI * 2,
          color: sample.accentColor,
        });
      }
    }
  }

  return {
    trees,
    trunks: trees.map((tree) => ({ ...tree, color: '#76543a' })),
    conifers,
    coniferTrunks: conifers.map((tree) => ({ ...tree, color: '#3a2615' })),
    grass,
    accents,
  };
}

function getConiferShare(biome: TerrainBiome): number {
  switch (biome) {
    case 'forest':
    case 'highland':
    case 'tundra':
      return 0.78;
    case 'wetland':
    case 'ethereal':
      return 0.34;
    case 'celestial':
    case 'temporal':
      return 0.4;
    case 'meadow':
    case 'ruins':
      return 0.18;
    case 'volcanic':
    case 'abyssal':
      return 0;
  }
}

const coniferColorCache = new Map<string, string>();

function darkenForConifer(hex: string): string {
  const cached = coniferColorCache.get(hex);
  if (cached !== undefined) {
    return cached;
  }
  const value = parseInt(hex.startsWith('#') ? hex.slice(1) : hex, 16);
  const r = Math.max(0, ((value >> 16) & 0xff) - 56);
  const g = Math.max(0, ((value >> 8) & 0xff) - 28);
  const b = Math.max(0, (value & 0xff) - 56);
  const result = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  coniferColorCache.set(hex, result);
  return result;
}

function getFoliageGeometry(
  geometry: 'cone' | 'cylinder' | 'dodecahedron' | 'sphere',
  radius: number,
  height: number,
) {
  if (geometry === 'cone') {
    return <coneGeometry args={[radius, height, 6]} />;
  }

  if (geometry === 'cylinder') {
    return <cylinderGeometry args={[radius, radius * 0.72, height, 6]} />;
  }

  if (geometry === 'sphere') {
    return <sphereGeometry args={[radius, 10, 8]} />;
  }

  return <dodecahedronGeometry args={[radius, 0]} />;
}

function seededRandom(cellX: number, cellZ: number): () => number {
  let seed = Math.imul(cellX, 374_761_393) ^ Math.imul(cellZ, 668_265_263);
  seed = (seed ^ (seed >>> 13)) >>> 0;
  return () => {
    seed = Math.imul(seed ^ (seed >>> 15), 2_246_822_519) >>> 0;
    seed = Math.imul(seed ^ (seed >>> 13), 3_266_489_917) >>> 0;
    return ((seed ^= seed >>> 16) >>> 0) / 4_294_967_295;
  };
}

const CLOUDS = [
  { id: 'north-1', position: [-260, 0, -180] as [number, number, number], scale: [34, 8, 12] as [number, number, number] },
  { id: 'north-2', position: [-220, 12, -160] as [number, number, number], scale: [22, 7, 10] as [number, number, number] },
  { id: 'east-1', position: [180, 10, -250] as [number, number, number], scale: [42, 8, 14] as [number, number, number] },
  { id: 'east-2', position: [230, 2, -220] as [number, number, number], scale: [26, 7, 12] as [number, number, number] },
  { id: 'west-1', position: [-340, -6, 210] as [number, number, number], scale: [38, 7, 13] as [number, number, number] },
] as const;
