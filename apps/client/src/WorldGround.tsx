import { useMemo } from 'react';
import { type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { sampleTerrain } from '../../../packages/content/terrain';
import { WORLD_SETTINGS } from '../../../packages/content/world';
import { type Vec3D, type VecXZ } from '../../../packages/protocol/messages';

type WorldGroundProps = {
  focus: Vec3D;
  onMove: (target: VecXZ) => void;
};

const groundClickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const groundClickPoint = new THREE.Vector3();

export function WorldGround({ focus, onMove }: WorldGroundProps) {
  const chunks = useMemo(
    () => getVisibleTerrainChunks(focus.x, focus.z),
    [focus.x, focus.z],
  );

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    if (event.button !== 0) {
      return;
    }

    event.stopPropagation();
    const terrainHit = event.ray.intersectPlane(groundClickPlane, groundClickPoint);

    if (terrainHit) {
      onMove({ x: terrainHit.x, z: terrainHit.z });
    }
  }

  return (
    <group>
      {chunks.map((chunk) => (
        <TerrainChunk
          key={`${chunk.x}:${chunk.z}`}
          originX={chunk.x}
          originZ={chunk.z}
          onPointerDown={handlePointerDown}
        />
      ))}
    </group>
  );
}

function TerrainChunk({
  originX,
  originZ,
  onPointerDown,
}: {
  originX: number;
  originZ: number;
  onPointerDown: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const geometry = useMemo(
    () => createTerrainGeometry(originX, originZ),
    [originX, originZ],
  );

  return (
    <mesh geometry={geometry} onPointerDown={onPointerDown} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.98} metalness={0.02} />
    </mesh>
  );
}

function getVisibleTerrainChunks(focusX: number, focusZ: number): Array<{ x: number; z: number }> {
  const chunkSize = WORLD_SETTINGS.terrainChunkSize;
  const radius = WORLD_SETTINGS.visibleTerrainChunkRadius;
  const centerChunkX = Math.floor(focusX / chunkSize);
  const centerChunkZ = Math.floor(focusZ / chunkSize);
  const chunks: Array<{ x: number; z: number }> = [];

  for (let dz = -radius; dz <= radius; dz += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      chunks.push({
        x: (centerChunkX + dx) * chunkSize,
        z: (centerChunkZ + dz) * chunkSize,
      });
    }
  }

  return chunks;
}

function createTerrainGeometry(originX: number, originZ: number): THREE.BufferGeometry {
  const size = WORLD_SETTINGS.terrainChunkSize;
  const segments = WORLD_SETTINGS.terrainChunkSegments;
  const verticesPerSide = segments + 1;
  const vertexCount = verticesPerSide * verticesPerSide;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const indices: number[] = [];
  const color = new THREE.Color();

  for (let zIndex = 0; zIndex < verticesPerSide; zIndex += 1) {
    for (let xIndex = 0; xIndex < verticesPerSide; xIndex += 1) {
      const vertexIndex = zIndex * verticesPerSide + xIndex;
      const xOffset = (xIndex / segments) * size;
      const zOffset = (zIndex / segments) * size;
      const worldX = originX + xOffset;
      const worldZ = originZ + zOffset;
      const terrain = sampleTerrain(worldX, worldZ);
      const base = vertexIndex * 3;

      positions[base] = worldX;
      positions[base + 1] = terrain.height;
      positions[base + 2] = worldZ;
      color.set(terrain.groundColor).lerp(new THREE.Color(terrain.accentColor), heightTint(terrain.height));
      color.toArray(colors, base);
    }
  }

  for (let zIndex = 0; zIndex < segments; zIndex += 1) {
    for (let xIndex = 0; xIndex < segments; xIndex += 1) {
      const topLeft = zIndex * verticesPerSide + xIndex;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + verticesPerSide;
      const bottomRight = bottomLeft + 1;
      indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function heightTint(height: number): number {
  return Math.max(0, Math.min(0.34, (height + 14) / 120));
}
