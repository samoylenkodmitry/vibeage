/**
 * Anchored hero-scene registry. Cozy-coast art renders ONLY when
 * the player is inside (or near) a registered scene's radius —
 * water does not follow the player forever (that would turn every
 * patch of the world into coastline). The registry pins the
 * visual style to a real geographic place.
 *
 * For PR 1 the only entry is `starter_cozy_coast`, anchored on the
 * starter spawn ("Peaceful Meadows" at the origin in zones.ts).
 * The waterline sits on negative X so the player faces sand → water
 * looking left, and forest silhouettes occupy positive X.
 */
/**
 * Authored prop placement inside a scene. Unlike the scatter
 * tables (`cozyScatter.ts`) these are individually positioned —
 * the dock, the rowboat, the bonfire — so the coast reads as
 * composed rather than randomly populated.
 */
export type AnchoredProp = {
  id: 'dock' | 'rowboat' | 'bonfire' | 'lantern';
  position: { x: number; y: number; z: number };
  rotationY: number;
  scale: number;
};

export type WorldArtScene = {
  id: string;
  origin: { x: number; z: number };
  radius: number;
  rotationY: number;
  /** Strip where the visible water plane lives (centered on its midpoint). */
  waterline: { x: number; z: number; width: number; length: number };
  /** Named, hand-placed props (dock/boat/fire). Optional — scenes can be foliage-only. */
  props?: AnchoredProp[];
  enabledByDefault: boolean;
};

export const STARTER_COZY_COAST: WorldArtScene = {
  id: 'starter_cozy_coast',
  origin: { x: 0, z: 0 },
  radius: 220,
  rotationY: 0,
  waterline: { x: -180, z: 0, width: 280, length: 520 },
  // Composition (looking at the coast from spawn at +Z facing -X):
  //   bonfire is on the dry sand off to the right
  //   dock juts straight out into the water
  //   rowboat sits beside the dock, lightly angled
  props: [
    { id: 'bonfire', position: { x: -55, y: 0, z: 40 }, rotationY: 0, scale: 1.3 },
    { id: 'dock', position: { x: -150, y: 0, z: -10 }, rotationY: -Math.PI / 2, scale: 1.0 },
    { id: 'rowboat', position: { x: -195, y: -0.3, z: -28 }, rotationY: Math.PI / 6, scale: 1.1 },
    // Lanterns sit near landmarks where they read as intentional
    // even without visiting the scene in-engine to measure dock
    // dimensions. One next to the bonfire (warm coupling), one
    // near the rowboat (the "boat lantern" trope).
    { id: 'lantern', position: { x: -48, y: 2.4, z: 38 }, rotationY: 0, scale: 1 },
    { id: 'lantern', position: { x: -192, y: 2.0, z: -25 }, rotationY: 0, scale: 0.85 },
  ],
  enabledByDefault: true,
};

export const WORLD_ART_SCENES: readonly WorldArtScene[] = [STARTER_COZY_COAST];

/** Returns the closest enabled scene the player is inside, or null. */
export function pickActiveScene(playerX: number, playerZ: number): WorldArtScene | null {
  let best: { scene: WorldArtScene; dist: number } | null = null;
  for (const scene of WORLD_ART_SCENES) {
    if (!scene.enabledByDefault) continue;
    const dx = playerX - scene.origin.x;
    const dz = playerZ - scene.origin.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= scene.radius && (!best || dist < best.dist)) best = { scene, dist };
  }
  return best?.scene ?? null;
}
