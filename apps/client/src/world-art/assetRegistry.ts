/**
 * Single source of truth for cozy-coast art assets.
 *
 * Each entry pins the file path, polycount budget, license, and a
 * source URL the manifest can be cross-checked against. Renderers
 * read from this registry instead of hard-coding paths so that
 * a swap-in replacement (better pine, optimized rock) is a
 * one-line edit and the manifest stays honest about what shipped.
 *
 * Fallbacks: every entry declares a `fallback` recipe so that if
 * the GLB fails to load (slow network, blocked CDN, asset
 * stripped from the build) the renderer can still paint
 * intentional geometry. Per the plan this is a runtime-safety
 * fallback, not a feature flag — the scene stays complete either
 * way.
 */
export type AssetLicense = 'CC0';

export type AssetSource = {
  /** Human-readable attribution shown in the manifest. */
  attribution: string;
  /** Canonical landing URL (Poly Pizza model page). */
  url: string;
};

export type FallbackRecipe =
  | { kind: 'pine'; trunkColor: string; canopyColor: string }
  | { kind: 'rock'; color: string }
  | { kind: 'grass'; color: string };

export type WorldArtAsset = {
  /** Stable cross-file id used by the scatter tables. */
  id: string;
  kind: 'tree' | 'rock' | 'grass';
  /** Web-served path, relative to `public/`. */
  path: string;
  polyCount: number;
  license: AssetLicense;
  source: AssetSource;
  /** GLB-unit → world-meter multiplier applied at clone time. */
  baseScale: number;
  /** Vertical lift so the model sits on the ground. */
  yOffset: number;
  fallback: FallbackRecipe;
};

const POLY = (id: string) => ({ attribution: 'Quaternius (CC0)', url: `https://poly.pizza/m/${id}` });

const TREE_PINE_A: WorldArtAsset = {
  id: 'tree.pine.a',
  kind: 'tree',
  path: '/models/trees/pine_a.glb',
  polyCount: 225,
  license: 'CC0',
  source: POLY('gX8WmgkeEm'),
  baseScale: 1.6,
  yOffset: 0,
  fallback: { kind: 'pine', trunkColor: '#3b2415', canopyColor: '#1f3a25' },
};

const TREE_PINE_B: WorldArtAsset = {
  id: 'tree.pine.b',
  kind: 'tree',
  path: '/models/trees/pine_b.glb',
  polyCount: 1200,
  license: 'CC0',
  source: POLY('aVOxaHRPWe'),
  baseScale: 1.4,
  yOffset: 0,
  fallback: { kind: 'pine', trunkColor: '#3a2110', canopyColor: '#1a3422' },
};

const TREE_PINE_C: WorldArtAsset = {
  id: 'tree.pine.c',
  kind: 'tree',
  path: '/models/trees/pine_c.glb',
  polyCount: 900,
  license: 'CC0',
  source: POLY('Zt62gceKXZ'),
  baseScale: 1.5,
  yOffset: 0,
  fallback: { kind: 'pine', trunkColor: '#3a2510', canopyColor: '#21422a' },
};

const ROCK_ROUND_SMALL: WorldArtAsset = {
  id: 'rock.round.small',
  kind: 'rock',
  path: '/models/rocks/rock_round_small.glb',
  polyCount: 80,
  license: 'CC0',
  source: POLY('GMttpOEFKT'),
  baseScale: 1.2,
  yOffset: 0,
  fallback: { kind: 'rock', color: '#7a7872' },
};

const ROCK_MEDIUM_A: WorldArtAsset = {
  id: 'rock.medium.a',
  kind: 'rock',
  path: '/models/rocks/rock_medium_a.glb',
  polyCount: 220,
  license: 'CC0',
  source: POLY('s1OJ3bBzqc'),
  baseScale: 1.0,
  yOffset: 0,
  fallback: { kind: 'rock', color: '#6f6d68' },
};

const GRASS_TUFT: WorldArtAsset = {
  id: 'grass.tuft',
  kind: 'grass',
  path: '/models/foliage/grass_tuft.glb',
  polyCount: 60,
  license: 'CC0',
  source: POLY('UGTOzcO3P2'),
  baseScale: 0.9,
  yOffset: 0,
  fallback: { kind: 'grass', color: '#618a4a' },
};

export const ASSET_REGISTRY: readonly WorldArtAsset[] = [
  TREE_PINE_A,
  TREE_PINE_B,
  TREE_PINE_C,
  ROCK_ROUND_SMALL,
  ROCK_MEDIUM_A,
  GRASS_TUFT,
] as const;

export function getAssetsByKind(kind: WorldArtAsset['kind']): readonly WorldArtAsset[] {
  return ASSET_REGISTRY.filter((a) => a.kind === kind);
}

export function getAssetById(id: string): WorldArtAsset | null {
  return ASSET_REGISTRY.find((a) => a.id === id) ?? null;
}

/** Stable ordered list of tree paths Drei `useGLTF.preload` can prime. */
export function getTreeAssetPaths(): readonly string[] {
  return getAssetsByKind('tree').map((a) => a.path);
}
