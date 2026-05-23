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
export type WorldArtScene = {
  id: string;
  origin: { x: number; z: number };
  radius: number;
  rotationY: number;
  /** Strip where the visible water plane lives (centered on its midpoint). */
  waterline: { x: number; z: number; width: number; length: number };
  enabledByDefault: boolean;
};

export const STARTER_COZY_COAST: WorldArtScene = {
  id: 'starter_cozy_coast',
  origin: { x: 0, z: 0 },
  radius: 220,
  rotationY: 0,
  waterline: { x: -180, z: 0, width: 280, length: 520 },
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
