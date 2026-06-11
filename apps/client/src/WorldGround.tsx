import { Suspense, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { getTerrainBiome, sampleTerrain } from '../../../packages/content/terrain';
import { WORLD_SETTINGS } from '../../../packages/content/world';
import { type Vec3D, type VecXZ } from '../../../packages/protocol/messages';
import type { CameraControls } from './CameraRig';
import {
  shouldContinueDragMove,
  shouldEmitDragMove,
  shouldStartDragMove,
  TOUCH_MOVE_THROTTLE_MS,
} from './touchMovement';
import { useTerrainTextures } from './world-art/useTerrainTextures';

/**
 * Render modes for the clickable terrain chunks.
 *
 * - 'normal'    — vertex-colored standard material.
 * - 'textured'  — PBR sand/grass texture mixed with the existing
 *   vertex colors so biome tinting still reads through. Uses
 *   `palette` to pick which texture pair (grass for the open
 *   world, sand for the cozy beach).
 * - 'collider'  — invisible color writes but pointer-raycast
 *   stays on, so click-to-move keeps working when another art
 *   layer paints the ground.
 */
export type TerrainVisualMode = 'normal' | 'textured' | 'collider';

export type TerrainPalette = 'grass' | 'sand' | 'forest' | 'rock' | 'ash' | 'snow';

type WorldGroundProps = {
  focus: Vec3D;
  onMove: (target: VecXZ) => void;
  cameraControlsRef?: MutableRefObject<CameraControls | null>;
  touchClaimRef?: MutableRefObject<Set<number>>;
  visualMode?: TerrainVisualMode;
  /** Texture pair used when visualMode === 'textured'. Default 'grass'. */
  palette?: TerrainPalette;
  /** Sand region (the cozy coast). When set, each chunk picks sand vs
   *  grass by ITS OWN distance to this centre — so the ground texture is
   *  fixed by location, not by where the player is. Without this a single
   *  global palette flipped every chunk sand↔grass the instant the player
   *  crossed the coast radius (the whole world's ground snapped). */
  sandRegion?: { x: number; z: number; radius: number };
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
  cleanup?: () => void;
};

const TOUCH_DRAG_THRESHOLD_PX = 6;

export function WorldGround({ focus, onMove, cameraControlsRef, touchClaimRef, visualMode = 'textured', palette = 'grass', sandRegion }: WorldGroundProps) {
  const focusChunk = getTerrainChunk(focus.x, focus.z);
  // Ground texture is fixed by a chunk's OWN centre (never the player's
  // position) so the surface is stable per location. Sand wins at the coast
  // ring; otherwise each biome family gets its own painterly ground (the
  // procedural set from scripts/generate-world-textures.mjs) — mossy forest
  // floor, weathered highland rock, ember-cracked volcanic ash, wind-swept
  // tundra snow — instead of one grass texture planet-wide. Vertex-colour
  // biome tints still blend on top, so transitions between chunk textures
  // read as gradients rather than hard seams.
  const paletteForChunk = (cx: number, cz: number): TerrainPalette => {
    const halfChunk = WORLD_SETTINGS.terrainChunkSize / 2;
    const centerX = cx + halfChunk;
    const centerZ = cz + halfChunk;
    if (sandRegion && Math.hypot(centerX - sandRegion.x, centerZ - sandRegion.z) <= sandRegion.radius) {
      return 'sand';
    }
    // getTerrainBiome covers both named zones and the large-scale climate field.
    switch (getTerrainBiome(centerX, centerZ)) {
      case 'volcanic': case 'abyssal': return 'ash';
      case 'forest': case 'wetland': return 'forest';
      case 'highland': case 'ruins': return 'rock';
      case 'tundra': return 'snow';
      default: return palette;
    }
  };
  const chunks = useMemo(
    () => getVisibleTerrainChunks(focusChunk.x, focusChunk.z),
    [focusChunk.x, focusChunk.z],
  );

  const dragRef = useRef<DragMoveState | null>(null);
  const touchRef = useRef<TouchPendingState | null>(null);
  const activeTouchCountRef = useActiveTouchCount(() => {
    if (activeTouchCountRef.current >= 2) {
      releaseActiveTouch(touchRef, touchClaimRef);
    }
  });

  useEffect(() => {
    return () => {
      releaseActiveTouch(touchRef, touchClaimRef);
    };
  }, [touchClaimRef]);

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    if (event.pointerType === 'touch') {
      handleTouchDown(event, touchRef, activeTouchCountRef, touchClaimRef);
      return;
    }
    handleMouseDown(event, dragRef, activeTouchCountRef, onMove);
  }

  function handlePointerMove(event: ThreeEvent<PointerEvent>) {
    if (handleTouchMove(event, touchRef, cameraControlsRef, touchClaimRef)) {
      return;
    }
    handleMouseMove(event, dragRef, activeTouchCountRef, onMove);
  }

  function handlePointerUp(event: ThreeEvent<PointerEvent>) {
    if (handleTouchUp(event, touchRef, onMove, touchClaimRef)) {
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
          visualMode={visualMode}
          palette={paletteForChunk(chunk.x, chunk.z)}
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
  touchClaimRef?: MutableRefObject<Set<number>>,
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
  touchClaimRef?.current.add(event.pointerId);
}

function releaseActiveTouch(
  touchRef: MutableRefObject<TouchPendingState | null>,
  touchClaimRef?: MutableRefObject<Set<number>>,
): void {
  const touch = touchRef.current;
  if (!touch) {
    return;
  }
  touch.cleanup?.();
  touchClaimRef?.current.delete(touch.pointerId);
  touchRef.current = null;
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
  touchClaimRef?: MutableRefObject<Set<number>>,
): boolean {
  const touch = touchRef.current;
  if (!touch || touch.pointerId !== event.pointerId) {
    return false;
  }
  if (touch.cleanup) {
    // window-level handler is in charge once rotation is hot
    return true;
  }
  const dx = event.clientX - touch.lastX;
  const dy = event.clientY - touch.lastY;
  touch.lastX = event.clientX;
  touch.lastY = event.clientY;
  const totalDx = event.clientX - touch.startX;
  const totalDy = event.clientY - touch.startY;
  if (!touch.rotating && Math.hypot(totalDx, totalDy) >= TOUCH_DRAG_THRESHOLD_PX) {
    touch.rotating = true;
    touch.cleanup = installWindowRotation(touchRef, cameraControlsRef, touchClaimRef);
  }
  if (touch.rotating) {
    cameraControlsRef?.current?.applyDelta({ x: dx, y: dy });
  }
  return true;
}

function installWindowRotation(
  touchRef: MutableRefObject<TouchPendingState | null>,
  cameraControlsRef?: MutableRefObject<CameraControls | null>,
  touchClaimRef?: MutableRefObject<Set<number>>,
): () => void {
  const onMove = (event: PointerEvent) => {
    const touch = touchRef.current;
    if (!touch || touch.pointerId !== event.pointerId) return;
    const dx = event.clientX - touch.lastX;
    const dy = event.clientY - touch.lastY;
    touch.lastX = event.clientX;
    touch.lastY = event.clientY;
    cameraControlsRef?.current?.applyDelta({ x: dx, y: dy });
  };
  const onUp = (event: PointerEvent) => {
    const touch = touchRef.current;
    if (!touch || touch.pointerId !== event.pointerId) return;
    touch.cleanup?.();
    touch.cleanup = undefined;
    touchClaimRef?.current.delete(touch.pointerId);
    touchRef.current = null;
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  return () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };
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
  touchClaimRef?: MutableRefObject<Set<number>>,
): boolean {
  const touch = touchRef.current;
  if (!touch || touch.pointerId !== event.pointerId) {
    return false;
  }
  touch.cleanup?.();
  touchClaimRef?.current.delete(touch.pointerId);
  touchRef.current = null;
  if (!touch.rotating) {
    onMove(touch.hit);
  }
  return true;
}

function useActiveTouchCount(onChange?: () => void) {
  const countRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const activePointers = new Set<number>();
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        activePointers.add(event.pointerId);
        countRef.current = activePointers.size;
        onChangeRef.current?.();
      }
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        activePointers.delete(event.pointerId);
        countRef.current = activePointers.size;
        onChangeRef.current?.();
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

type TerrainChunkProps = {
  originX: number;
  originZ: number;
  visualMode: TerrainVisualMode;
  palette: TerrainPalette;
  onPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (event: ThreeEvent<PointerEvent>) => void;
  onPointerUp: (event: ThreeEvent<PointerEvent>) => void;
};

function TerrainChunk({ originX, originZ, visualMode, palette, onPointerDown, onPointerMove, onPointerUp }: TerrainChunkProps) {
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
      receiveShadow={visualMode !== 'collider'}
    >
      <TerrainMaterial visualMode={visualMode} palette={palette} />
    </mesh>
  );
}

function TerrainMaterial({ visualMode, palette }: { visualMode: TerrainVisualMode; palette: TerrainPalette }) {
  if (visualMode === 'collider') {
    return <meshBasicMaterial colorWrite={false} depthWrite={false} transparent opacity={0} />;
  }
  if (visualMode === 'textured') {
    return (
      <Suspense fallback={<meshStandardMaterial vertexColors roughness={0.98} metalness={0.02} />}>
        <TexturedTerrainMaterial palette={palette} />
      </Suspense>
    );
  }
  return <meshStandardMaterial vertexColors roughness={0.98} metalness={0.02} />;
}

function TexturedTerrainMaterial({ palette }: { palette: TerrainPalette }) {
  const tex = useTerrainTextures();
  // Vertex colors stay on so biome tinting and slope shading
  // still read through the base texture.
  const maps: Record<TerrainPalette, THREE.Texture> = {
    sand: tex.sandColor,
    grass: tex.grassColor,
    forest: tex.forestColor,
    rock: tex.rockColor,
    ash: tex.ashColor,
    snow: tex.snowColor,
  };
  const map = maps[palette];
  // Only the PBR pairs ship normal maps; the painterly set is colour-only.
  const normalMap = palette === 'sand' ? tex.sandNormal : palette === 'grass' ? tex.grassNormal : undefined;
  return (
    <meshStandardMaterial
      map={map}
      normalMap={normalMap}
      vertexColors
      roughness={0.95}
      metalness={0.02}
    />
  );
}

// Exported so WorldFoliage can stream foliage on the same chunk grid.
export function getTerrainChunk(focusX: number, focusZ: number): { x: number; z: number } {
  const chunkSize = WORLD_SETTINGS.terrainChunkSize;
  return {
    x: Math.floor(focusX / chunkSize),
    z: Math.floor(focusZ / chunkSize),
  };
}

export function getVisibleTerrainChunks(
  centerChunkX: number,
  centerChunkZ: number,
  radiusOverride?: number,
): Array<{ x: number; z: number }> {
  const chunkSize = WORLD_SETTINGS.terrainChunkSize;
  const radius = radiusOverride ?? WORLD_SETTINGS.visibleTerrainChunkRadius;
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

export function createTerrainGeometry(originX: number, originZ: number): THREE.BufferGeometry {
  const size = WORLD_SETTINGS.terrainChunkSize;
  const segments = WORLD_SETTINGS.terrainChunkSegments;
  const verticesPerSide = segments + 1;
  const vertexCount = verticesPerSide * verticesPerSide;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
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
      const uvBase = vertexIndex * 2;

      positions[base] = worldX;
      positions[base + 1] = terrain.height;
      positions[base + 2] = worldZ;
      color.set(terrain.groundColor).lerp(accentColor.set(terrain.accentColor), heightTint(terrain.height));
      // NORMALIZE the tint to ~unit luminance (hue preserved). The raw biome
      // hexes are dark (#2f6f45 ≈ 0.16 linear) and MULTIPLY with the ground
      // texture (~0.1 linear) — effective albedo ~1-2%, darker than coal.
      // Desktop only ever looked right because adaptive exposure cranked
      // 5-10x to rescue it; on the phone tier (broken adaptation, then a
      // fixed tone map) the world rendered its true near-black self. The
      // texture now carries the brightness; the vertex colour only tints.
      normalizeTintLuminance(color);
      color.toArray(colors, base);
      // 0..1 across the chunk; the material applies `repeat` on
      // top so a single 1K texture tiles enough times to read at
      // MMO camera height without obvious seams at chunk borders.
      uvs[uvBase] = xIndex / segments;
      uvs[uvBase + 1] = zIndex / segments;
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
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Scale a colour so its (linear) luminance ≈ TARGET_TINT_LUMINANCE while
 *  keeping its hue — vertex colours must TINT the ground texture, not
 *  darken it (see createTerrainGeometry). Clamped so saturated hues can't
 *  blow out a single channel. */
const TARGET_TINT_LUMINANCE = 0.62;
export function normalizeTintLuminance(color: THREE.Color): void {
  const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  const scale = TARGET_TINT_LUMINANCE / Math.max(luminance, 0.04);
  color.r = Math.min(1, color.r * scale);
  color.g = Math.min(1, color.g * scale);
  color.b = Math.min(1, color.b * scale);
}

// Exported so HorizonTerrainShell tints its far vertices the same way the
// near chunks do — the shell must read as the same ground, just hazier.
export function heightTint(height: number): number {
  return Math.max(0, Math.min(0.34, (height + 14) / 120));
}
