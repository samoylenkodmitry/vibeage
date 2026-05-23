import type { WorldArtQuality } from './quality';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Deterministic scatter tables for the cozy-coast scene. Same
 * seed → same layout every run, so a player rejoining the same
 * spot sees the same forest, rocks, and grass tufts.
 *
 * `PineTransform` was the original PR 1 export (still consumed
 * by `CozyStarterPines.tsx` as a fallback); PR 2 reuses it as the
 * canonical scatter row for trees, rocks, and grass — only the
 * variant pool differs.
 *
 * The tree scatter is anchored to the scene's positive-X edge —
 * water is on negative X, so forest silhouettes line the opposite
 * side of the player as they spawn. Rocks cluster along the
 * waterline, grass fills the inland band. Counts scale with
 * quality so a phone gets a sparser, draw-call-cheap scene.
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

function seedFor(scene: WorldArtScene, salt: number): () => number {
  const base = scene.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 1337);
  return mulberry32(base + salt);
}

export function makeCozyTreeScatter(scene: WorldArtScene, quality: WorldArtQuality): PineTransform[] {
  const rand = seedFor(scene, 0);
  const count = quality === 'low' ? 36 : quality === 'medium' ? 72 : 120;
  const trees: PineTransform[] = [];
  for (let i = 0; i < count; i += 1) {
    const band = rand();
    const x = scene.origin.x + 80 + band * 360 + rand() * 40;
    const z = scene.origin.z - 340 + rand() * 680;
    trees.push({
      id: `pine-${scene.id}-${i}`,
      x, y: 0, z,
      rotationY: rand() * Math.PI * 2,
      scaleVariance: rand(),
      variant: Math.floor(rand() * 3) as 0 | 1 | 2,
    });
  }
  return trees;
}

export function makeCozyRockScatter(scene: WorldArtScene, quality: WorldArtQuality): PineTransform[] {
  const rand = seedFor(scene, 91);
  const count = quality === 'low' ? 8 : quality === 'medium' ? 18 : 30;
  // Rocks hug the waterline so they read as "wet stones on the
  // beach" instead of just dropped pebbles in the forest.
  const waterEdgeX = scene.waterline.x + scene.waterline.width / 2;
  const rocks: PineTransform[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = waterEdgeX + 4 + rand() * 36;
    const z = scene.waterline.z - scene.waterline.length / 2 + rand() * scene.waterline.length;
    rocks.push({
      id: `rock-${scene.id}-${i}`,
      x, y: 0, z,
      rotationY: rand() * Math.PI * 2,
      scaleVariance: rand(),
      variant: Math.floor(rand() * 2) as 0 | 1 | 2,
    });
  }
  return rocks;
}

export function makeCozyGrassScatter(scene: WorldArtScene, quality: WorldArtQuality): PineTransform[] {
  const rand = seedFor(scene, 173);
  const count = quality === 'low' ? 40 : quality === 'medium' ? 110 : 220;
  // Grass fills the inland band between the sand and the tree
  // line. We cap count tightly on `low` so phones don't drown in
  // draw calls — even cloned the grass tufts are individual nodes.
  const rocks: PineTransform[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = scene.origin.x + 18 + rand() * 60;
    const z = scene.origin.z - 320 + rand() * 640;
    rocks.push({
      id: `grass-${scene.id}-${i}`,
      x, y: 0, z,
      rotationY: rand() * Math.PI * 2,
      scaleVariance: rand(),
      variant: 0,
    });
  }
  return rocks;
}
