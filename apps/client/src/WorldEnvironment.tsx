import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sampleTerrain } from '../../../packages/content/terrain';
import { WORLD_SETTINGS } from '../../../packages/content/world';
import type { Vec3D } from '../../../packages/protocol/messages';

type WorldEnvironmentProps = {
  focus: Vec3D;
};

type FoliageInstance = {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
};

const matrix = new THREE.Matrix4();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3();
const position = new THREE.Vector3();
const rotation = new THREE.Euler();

export function WorldEnvironment({ focus }: WorldEnvironmentProps) {
  return (
    <>
      <hemisphereLight args={['#ccecff', '#21402d', 0.82]} />
      <directionalLight position={[focus.x + 240, 420, focus.z + 180]} intensity={1.55} castShadow />
      <SunAndClouds focus={focus} />
      <FoliageField focus={focus} />
    </>
  );
}

function SunAndClouds({ focus }: WorldEnvironmentProps) {
  const cloudRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (cloudRef.current) {
      cloudRef.current.rotation.y += delta * 0.012;
    }
  });

  return (
    <group position={[focus.x, 0, focus.z]}>
      <mesh position={[340, 520, -420]}>
        <sphereGeometry args={[34, 24, 16]} />
        <meshBasicMaterial color="#fff1a6" />
      </mesh>
      <pointLight position={[340, 520, -420]} color="#ffe7a3" intensity={2.2} distance={1_400} />
      <group ref={cloudRef} position={[0, 180, 0]}>
        {CLOUDS.map((cloud) => (
          <mesh key={cloud.id} position={cloud.position} scale={cloud.scale}>
            <sphereGeometry args={[1, 12, 8]} />
            <meshStandardMaterial color="#dff8ff" transparent opacity={0.32} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function FoliageField({ focus }: WorldEnvironmentProps) {
  const instances = useMemo(() => getFoliageInstances(focus.x, focus.z), [focus.x, focus.z]);

  return (
    <>
      <InstancedFoliage
        instances={instances.trees}
        color="#3f9f63"
        geometry="cone"
        radius={1.4}
        height={5.8}
        yOffset={2.9}
      />
      <InstancedFoliage
        instances={instances.trunks}
        color="#79553c"
        geometry="cylinder"
        radius={0.32}
        height={2.4}
        yOffset={1.2}
      />
      <InstancedFoliage
        instances={instances.grass}
        color="#75d483"
        geometry="cone"
        radius={0.22}
        height={0.9}
        yOffset={0.45}
      />
    </>
  );
}

function InstancedFoliage({
  instances,
  color,
  geometry,
  radius,
  height,
  yOffset,
}: {
  instances: FoliageInstance[];
  color: string;
  geometry: 'cone' | 'cylinder';
  radius: number;
  height: number;
  yOffset: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

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
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [instances, yOffset]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, instances.length)]} castShadow receiveShadow>
      {geometry === 'cone'
        ? <coneGeometry args={[radius, height, 5]} />
        : <cylinderGeometry args={[radius, radius * 0.72, height, 6]} />}
      <meshStandardMaterial color={color} roughness={0.88} />
    </instancedMesh>
  );
}

function getFoliageInstances(focusX: number, focusZ: number): {
  trees: FoliageInstance[];
  trunks: FoliageInstance[];
  grass: FoliageInstance[];
} {
  const cellSize = WORLD_SETTINGS.foliageCellSize;
  const radius = WORLD_SETTINGS.visibleFoliageCellRadius;
  const centerX = Math.floor(focusX / cellSize);
  const centerZ = Math.floor(focusZ / cellSize);
  const trees: FoliageInstance[] = [];
  const grass: FoliageInstance[] = [];

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
        });
      }

      if (random() < sample.grassDensity * Math.max(0.18, distanceFalloff)) {
        grass.push({
          x: x + (random() - 0.5) * cellSize * 0.5,
          y: sample.height,
          z: z + (random() - 0.5) * cellSize * 0.5,
          scale: 0.7 + random() * 0.8,
          rotation: random() * Math.PI * 2,
        });
      }
    }
  }

  return { trees, trunks: trees, grass };
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
