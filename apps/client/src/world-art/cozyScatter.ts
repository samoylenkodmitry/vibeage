import type { WorldArtQuality } from './quality';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Deterministic pine scatter for the cozy-coast scene. Same seed →
 * same trees every run, so a player rejoining the same spot sees
 * the same forest. PR 1 uses primitive cone+trunk silhouettes
 * (rendered in `CozyStarterPines.tsx`); PR 2 swaps in real GLB
 * pines reading the same scatter table.
 *
 * The scatter is anchored to the scene's positive-X edge — water
 * is on negative X, so forest silhouettes line the opposite side
 * of the player as they spawn. Tree density scales with quality.
 */
export type PineTransform = {
  id: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  /** 0..1 — caller multiplies into a base scale to keep variance bounded. */
  scaleVariance: number;
  /** 0|1|2 — variant index for when real GLB packs land. */
  variant: 0 | 1 | 2;
};

function mulberry32(seed: number): () => number {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCozyTreeScatter(scene: WorldArtScene, quality: WorldArtQuality): PineTransform[] {
  const rand = mulberry32(scene.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 1337));
  const count = quality === 'low' ? 36 : quality === 'medium' ? 72 : 120;
  const trees: PineTransform[] = [];
  // Forest band: 80 → 360 units of positive-X from the scene
  // origin, ±340 units of z. Same shape Codex's plan recommended.
  for (let i = 0; i < count; i += 1) {
    const band = rand();
    const x = scene.origin.x + 80 + band * 360 + rand() * 40;
    const z = scene.origin.z - 340 + rand() * 680;
    trees.push({
      id: `pine-${scene.id}-${i}`,
      x,
      y: 0,
      z,
      rotationY: rand() * Math.PI * 2,
      scaleVariance: rand(),
      variant: Math.floor(rand() * 3) as 0 | 1 | 2,
    });
  }
  return trees;
}
