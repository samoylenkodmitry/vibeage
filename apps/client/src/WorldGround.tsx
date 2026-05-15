import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { sampleTerrain } from '../../../packages/content/terrain';
import { WORLD_SETTINGS } from '../../../packages/content/world';
import { type Vec3D, type VecXZ } from '../../../packages/protocol/messages';
import type { CameraControls } from './CameraRig';
import {
  shouldContinueDragMove,
  shouldEmitDragMove,
  shouldStartDragMove,
  TOUCH_MOVE_THROTTLE_MS,
} from './touchMovement';

type WorldGroundProps = {
  focus: Vec3D;
  onMove: (target: VecXZ) => void;
  cameraControlsRef?: MutableRefObject<CameraControls | null>;
};

type DragMoveState = {
  pointerId: number;
  isTouch: boolean;
  lastSentMs: number;
};

type TouchPendingState = {
  pointerId: number;
  hit: VecXZ;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  rotating: boolean;
};

const TOUCH_DRAG_THRESHOLD_PX = 6;

export function WorldGround({ focus, onMove, cameraControlsRef }: WorldGroundProps) {
  const focusChunk = getTerrainChunk(focus.x, focus.z);
  const chunks = useMemo(
    () => getVisibleTerrainChunks(focusChunk.x, focusChunk.z),
    [focusChunk.x, focusChunk.z],
  );

  const dragRef = useRef<DragMoveState | null>(null);
  const touchRef = useRef<TouchPendingState | null>(null);
  const activeTouchCountRef = useActiveTouchCount();

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    if (event.pointerType === 'touch') {
      handleTouchDown(event, touchRef, activeTouchCountRef);
      return;
    }
    handleMouseDown(event, dragRef, activeTouchCountRef, onMove);
  }

  function handlePointerMove(event: ThreeEvent<PointerEvent>) {
    if (handleTouchMove(event, touchRef, cameraControlsRef)) {
      return;
    }
    handleMouseMove(event, dragRef, activeTouchCountRef, onMove);
  }

  function handlePointerUp(event: ThreeEvent<PointerEvent>) {
    if (handleTouchUp(event, touchRef, onMove)) {
      return;
    }
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

function handleTouchDown(
  event: ThreeEvent<PointerEvent>,
  touchRef: MutableRefObject<TouchPendingState | null>,
  activeTouchCountRef: MutableRefObject<number>,
): void {
  const hit = event.intersections[0]?.point;
  if (!hit || activeTouchCountRef.current >= 2) {
    return;
  }
  event.stopPropagation();
  touchRef.current = {
    pointerId: event.pointerId,
    hit: { x: hit.x, z: hit.z },
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    rotating: false,
  };
}

function handleMouseDown(
  event: ThreeEvent<PointerEvent>,
  dragRef: MutableRefObject<DragMoveState | null>,
  activeTouchCountRef: MutableRefObject<number>,
  onMove: (target: VecXZ) => void,
): void {
  if (!shouldStartDragMove(event, activeTouchCountRef.current)) {
    return;
  }
  const hit = event.intersections[0]?.point;
  if (!hit) {
    return;
  }
  event.stopPropagation();
  dragRef.current = {
    pointerId: event.pointerId,
    isTouch: false,
    lastSentMs: performance.now(),
  };
  onMove({ x: hit.x, z: hit.z });
}

function handleTouchMove(
  event: ThreeEvent<PointerEvent>,
  touchRef: MutableRefObject<TouchPendingState | null>,
  cameraControlsRef?: MutableRefObject<CameraControls | null>,
): boolean {
  const touch = touchRef.current;
  if (!touch || touch.pointerId !== event.pointerId) {
    return false;
  }
  const dx = event.clientX - touch.lastX;
  const dy = event.clientY - touch.lastY;
  touch.lastX = event.clientX;
  touch.lastY = event.clientY;
  const totalDx = event.clientX - touch.startX;
  const totalDy = event.clientY - touch.startY;
  if (!touch.rotating && Math.hypot(totalDx, totalDy) >= TOUCH_DRAG_THRESHOLD_PX) {
    touch.rotating = true;
  }
  if (touch.rotating) {
    cameraControlsRef?.current?.applyDelta({ x: dx, y: dy });
  }
  return true;
}

function handleMouseMove(
  event: ThreeEvent<PointerEvent>,
  dragRef: MutableRefObject<DragMoveState | null>,
  activeTouchCountRef: MutableRefObject<number>,
  onMove: (target: VecXZ) => void,
): void {
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
  const hit = event.intersections[0]?.point;
  if (!hit) {
    return;
  }
  drag.lastSentMs = now;
  onMove({ x: hit.x, z: hit.z });
}

function handleTouchUp(
  event: ThreeEvent<PointerEvent>,
  touchRef: MutableRefObject<TouchPendingState | null>,
  onMove: (target: VecXZ) => void,
): boolean {
  const touch = touchRef.current;
  if (!touch || touch.pointerId !== event.pointerId) {
    return false;
  }
  touchRef.current = null;
  if (!touch.rotating) {
    onMove(touch.hit);
  }
  return true;
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
