import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { sampleTerrain } from '../../../packages/content/terrain';
import { WORLD_SETTINGS } from '../../../packages/content/world';
import type { Vec3D } from '../../../packages/protocol/messages';
import { computeDayPhase, SUN_DISTANCE } from './timeOfDay';

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

export function WorldEnvironment({ focus }: WorldEnvironmentProps) {
  const hemisphereRef = useRef<THREE.HemisphereLight>(null);
  const directionalRef = useRef<THREE.DirectionalLight>(null);
  const sunGroupRef = useRef<THREE.Group>(null);
  const sunPointLightRef = useRef<THREE.PointLight>(null);
  const cloudGroupRef = useRef<THREE.Group>(null);
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
    };
  }, [sunMaterial, cloudMaterial]);

  useFrame(({ clock }, delta) => {
    const palette = computeDayPhase(clock.elapsedTime * 1_000);

    if (hemisphereRef.current) {
      hemisphereRef.current.color.set(palette.hemisphereSky);
      hemisphereRef.current.groundColor.set(palette.hemisphereGround);
      hemisphereRef.current.intensity = palette.hemisphereIntensity;
    }

    if (directionalRef.current) {
      directionalRef.current.position.set(
        focus.x + palette.sunDir.x * SUN_DISTANCE,
        palette.sunDir.y * SUN_DISTANCE,
        focus.z + palette.sunDir.z * SUN_DISTANCE,
      );
      directionalRef.current.color.set(palette.sunColor);
      directionalRef.current.intensity = palette.sunIntensity;
    }

    if (sunGroupRef.current) {
      sunGroupRef.current.position.set(
        focus.x + palette.sunDir.x * SUN_DISTANCE,
        palette.sunDir.y * SUN_DISTANCE,
        focus.z + palette.sunDir.z * SUN_DISTANCE,
      );
      sunGroupRef.current.visible = palette.sunDir.y > -0.05;
    }

    if (sunPointLightRef.current) {
      sunPointLightRef.current.color.set(palette.sunColor);
      sunPointLightRef.current.intensity = Math.max(0, palette.sunDir.y) * 2.2;
    }

    sunMaterial.color.set(palette.sunColor);
    cloudMaterial.color.set(palette.cloudColor);
    cloudMaterial.opacity = palette.cloudOpacity;

    if (cloudGroupRef.current) {
      cloudGroupRef.current.rotation.y += delta * 0.012;
      cloudGroupRef.current.position.set(focus.x, 180, focus.z);
    }

    if (scene.background instanceof THREE.Color) {
      scene.background.set(palette.backgroundColor);
    }
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.set(palette.fogColor);
    }
  });

  return (
    <>
      <hemisphereLight ref={hemisphereRef} args={['#ccecff', '#21402d', 0.82]} />
      <directionalLight
        ref={directionalRef}
        position={[focus.x + 240, 420, focus.z + 180]}
        intensity={1.55}
        castShadow
      />
      <group ref={sunGroupRef}>
        <mesh material={sunMaterial}>
          <sphereGeometry args={[34, 24, 16]} />
        </mesh>
        <pointLight ref={sunPointLightRef} color="#ffe7a3" intensity={2.2} distance={1_400} />
      </group>
      <group ref={cloudGroupRef}>
        {CLOUDS.map((cloud) => (
          <mesh key={cloud.id} position={cloud.position} scale={cloud.scale} material={cloudMaterial}>
            <sphereGeometry args={[1, 12, 8]} />
          </mesh>
        ))}
      </group>
      <FoliageField focus={focus} />
    </>
  );
}

function FoliageField({ focus }: WorldEnvironmentProps) {
  const focusCell = getFoliageCell(focus.x, focus.z);
  const instances = useMemo(
    () => getFoliageInstances(focusCell.x, focusCell.z),
    [focusCell.x, focusCell.z],
  );

  return (
    <>
      <InstancedFoliage instances={instances.trees} geometry="cone" radius={1.4} height={5.8} yOffset={2.9} />
      <InstancedFoliage
        instances={instances.trunks}
        geometry="cylinder"
        radius={0.32}
        height={2.4}
        yOffset={1.2}
      />
      <InstancedFoliage instances={instances.grass} geometry="cone" radius={0.22} height={0.9} yOffset={0.45} />
      <InstancedFoliage instances={instances.accents} geometry="dodecahedron" radius={0.72} height={1} yOffset={0.5} />
    </>
  );
}

function InstancedFoliage({
  instances,
  geometry,
  radius,
  height,
  yOffset,
}: {
  instances: FoliageInstance[];
  geometry: 'cone' | 'cylinder' | 'dodecahedron';
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

function getFoliageCell(focusX: number, focusZ: number): { x: number; z: number } {
  const cellSize = WORLD_SETTINGS.foliageCellSize;
  return {
    x: Math.floor(focusX / cellSize),
    z: Math.floor(focusZ / cellSize),
  };
}

function getFoliageInstances(centerX: number, centerZ: number): {
  trees: FoliageInstance[];
  trunks: FoliageInstance[];
  grass: FoliageInstance[];
  accents: FoliageInstance[];
} {
  const cellSize = WORLD_SETTINGS.foliageCellSize;
  const radius = WORLD_SETTINGS.visibleFoliageCellRadius;
  const trees: FoliageInstance[] = [];
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

      if (random() < sample.treeDensity * distanceFalloff) {
        trees.push({
          x,
          y: sample.height,
          z,
          scale: 0.72 + random() * 0.92,
          rotation: random() * Math.PI * 2,
          color: sample.foliageColor,
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
    grass,
    accents,
  };
}

function getFoliageGeometry(
  geometry: 'cone' | 'cylinder' | 'dodecahedron',
  radius: number,
  height: number,
) {
  if (geometry === 'cone') {
    return <coneGeometry args={[radius, height, 5]} />;
  }

  if (geometry === 'cylinder') {
    return <cylinderGeometry args={[radius, radius * 0.72, height, 6]} />;
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
