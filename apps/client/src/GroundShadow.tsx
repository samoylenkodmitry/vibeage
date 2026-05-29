import { useMemo } from 'react';
import * as THREE from 'three';

/**
 * Soft blob shadow under a world entity. Real shadow-mapping across an
 * open world + the dynamic-light pool is a perf minefield, so — like
 * most MMOs/MOBAs — units get a cheap radial-gradient decal that
 * grounds them to the terrain instead of looking like they float.
 *
 * One shared CanvasTexture (dark centre → transparent edge) is reused
 * across every instance; the mesh just scales + positions it.
 */
let sharedTexture: THREE.CanvasTexture | null = null;

function getBlobTexture(): THREE.CanvasTexture {
  if (sharedTexture) return sharedTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.32)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  sharedTexture = tex;
  return tex;
}

/**
 * @param y      local ground Y (the group is at terrainY + groundedOffset,
 *               so pass `-groundedOffset` to land the blob on the terrain)
 * @param radius blob half-width in world units (≈ the entity footprint)
 */
export function GroundBlobShadow({ y, radius = 0.7, opacity = 1 }: { y: number; radius?: number; opacity?: number }) {
  const texture = useMemo(getBlobTexture, []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y + 0.03, 0]} raycast={() => null}>
      <planeGeometry args={[radius * 2, radius * 2]} />
      <meshBasicMaterial map={texture} transparent opacity={opacity} depthWrite={false} fog={false} />
    </mesh>
  );
}
