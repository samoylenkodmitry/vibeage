/**
 * Character model registry. The renderer (AnimatedCharacter) is model-agnostic;
 * everything model-specific — GLB path, native height, forward axis, and the
 * abstract-state → clip-name map — lives here. Swapping in a paid/custom model
 * later is a registry edit, not a renderer change: add an entry with that
 * model's clip names + height and point the picker at it.
 *
 * Current set: KayKit Adventurers (CC0, see ASSET_MANIFEST.md). All five share
 * one 76-clip rig, so they reuse a single clip map; only the height differs.
 */
export type CharacterAnim = 'idle' | 'walk' | 'run' | 'attack' | 'death';

export type CharacterModelDef = {
  path: string;
  /** Model-space height at scale 1 (measured from the GLB's POSITION bounds).
   *  AnimatedCharacter scales by targetHeight / nativeHeight. Box3 auto-fit is
   *  unreliable on skinned meshes (bind-pose bounds), hence a fixed value. */
  nativeHeight: number;
  /** Yaw applied so the model's authored forward aligns with the entity group's
   *  +Z movement facing (atan2(vx, vz)). KayKit is authored facing +Z, so 0. */
  forwardYaw: number;
  clips: Record<CharacterAnim, string>;
  /** States that play once and hold the final frame (death lies down + stays). */
  clampOnce: ReadonlySet<CharacterAnim>;
};

const KAYKIT_CLIPS: Record<CharacterAnim, string> = {
  idle: 'Idle',
  walk: 'Walking_A',
  run: 'Running_A',
  attack: '1H_Melee_Attack_Slice_Horizontal',
  death: 'Death_A',
};
const KAYKIT_CLAMP_ONCE: ReadonlySet<CharacterAnim> = new Set(['death']);

function kaykit(file: string, nativeHeight: number): CharacterModelDef {
  return {
    path: `/models/characters/kaykit/${file}.glb`,
    nativeHeight,
    forwardYaw: 0,
    clips: KAYKIT_CLIPS,
    clampOnce: KAYKIT_CLAMP_ONCE,
  };
}

export const CHARACTER_MODELS = {
  'kaykit-knight': kaykit('Knight', 3.436),
  'kaykit-mage': kaykit('Mage', 3.363),
  'kaykit-rogue': kaykit('Rogue', 3.309),
  'kaykit-rogue-hooded': kaykit('Rogue_Hooded', 3.373),
  'kaykit-barbarian': kaykit('Barbarian', 3.311),
} as const;

export type CharacterModelId = keyof typeof CHARACTER_MODELS;

export const DEFAULT_CHARACTER_MODEL: CharacterModelId = 'kaykit-knight';

/** Players get a stable per-id class look so the world isn't all clones. */
const PLAYER_MODEL_POOL: readonly CharacterModelId[] = [
  'kaykit-knight', 'kaykit-mage', 'kaykit-rogue', 'kaykit-rogue-hooded', 'kaykit-barbarian',
];

export function pickPlayerModel(playerId: string): CharacterModelId {
  let h = 0;
  for (let i = 0; i < playerId.length; i += 1) h = (Math.imul(h, 31) + playerId.charCodeAt(i)) >>> 0;
  return PLAYER_MODEL_POOL[h % PLAYER_MODEL_POOL.length];
}

/** Humanoid/undead enemies reuse the rig (tinted by the caller): hooded rogue
 *  reads as a wraith for undead, barbarian as a brute for humanoid raiders. */
export function enemyModel(family: string): CharacterModelId {
  return family === 'undead' ? 'kaykit-rogue-hooded' : 'kaykit-barbarian';
}

/** A default in-hand weapon so armed mobs don't fight bare-handed. Undead
 *  wraiths carry a sword; humanoid brutes an axe. */
export function enemyWeaponType(family: string): string {
  return family === 'undead' ? 'sword' : 'mace';
}
