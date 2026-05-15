import { useEffect, useMemo, useRef } from 'react';
import { type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { sampleTerrain } from '../../../packages/content/terrain';
import { WORLD_SETTINGS } from '../../../packages/content/world';
import { type Vec3D, type VecXZ } from '../../../packages/protocol/messages';
import {
  shouldContinueDragMove,
  shouldEmitDragMove,
  shouldStartDragMove,
  TOUCH_MOVE_THROTTLE_MS,
} from './touchMovement';

type WorldGroundProps = {
  focus: Vec3D;
  onMove: (target: VecXZ) => void;
};

type DragMoveState = {
  pointerId: number;
  isTouch: boolean;
  lastSentMs: number;
};

export function WorldGround({ focus, onMove }: WorldGroundProps) {
  const focusChunk = getTerrainChunk(focus.x, focus.z);
  const chunks = useMemo(
    () => getVisibleTerrainChunks(focusChunk.x, focusChunk.z),
    [focusChunk.x, focusChunk.z],
  );

  const dragRef = useRef<DragMoveState | null>(null);
  const activeTouchCountRef = useActiveTouchCount();

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    if (!shouldStartDragMove(event, activeTouchCountRef.current)) {
      return;
    }

    event.stopPropagation();
    dragRef.current = {
      pointerId: event.pointerId,
      isTouch: event.pointerType === 'touch',
      lastSentMs: performance.now(),
    };
    onMove({ x: event.point.x, z: event.point.z });
  }

  function handlePointerMove(event: ThreeEvent<PointerEvent>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    if (!shouldContinueDragMove(activeTouchCountRef.current, drag.isTouch)) {
      dragRef.current = null;
      return;
    }

    const now = performance.now();
    if (!shouldEmitDragMove(now, drag.lastSentMs, TOUCH_MOVE_THROTTLE_MS)) {
      return;
    }

    drag.lastSentMs = now;
    onMove({ x: event.point.x, z: event.point.z });
  }

  function handlePointerUp(event: ThreeEvent<PointerEvent>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
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
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      ))}
    </group>
  );
}

function useActiveTouchCount() {
  const countRef = useRef(0);

  useEffect(() => {
    const activePointers = new Set<number>();
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        activePointers.add(event.pointerId);
        countRef.current = activePointers.size;
      }
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        activePointers.delete(event.pointerId);
        countRef.current = activePointers.size;
      }
    };

    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  return countRef;
}

function TerrainChunk({
  originX,
  originZ,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  originX: number;
  originZ: number;
  onPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (event: ThreeEvent<PointerEvent>) => void;
  onPointerUp: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const geometry = useMemo(
    () => createTerrainGeometry(originX, originZ),
    [originX, originZ],
  );

  return (
    <mesh
      geometry={geometry}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      receiveShadow
    >
      <meshStandardMaterial vertexColors roughness={0.98} metalness={0.02} />
    </mesh>
  );
}

function getTerrainChunk(focusX: number, focusZ: number): { x: number; z: number } {
  const chunkSize = WORLD_SETTINGS.terrainChunkSize;
  return {
    x: Math.floor(focusX / chunkSize),
    z: Math.floor(focusZ / chunkSize),
  };
}

function getVisibleTerrainChunks(centerChunkX: number, centerChunkZ: number): Array<{ x: number; z: number }> {
  const chunkSize = WORLD_SETTINGS.terrainChunkSize;
  const radius = WORLD_SETTINGS.visibleTerrainChunkRadius;
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
  const accentColor = new THREE.Color();

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
      color.set(terrain.groundColor).lerp(accentColor.set(terrain.accentColor), heightTint(terrain.height));
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
