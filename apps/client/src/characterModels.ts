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
import type { CharacterClass } from '../../../packages/content/classes';
import type { EnemyTemplate } from '../../../packages/content/enemies';
import { getSpecializationById } from '../../../packages/content/specializations';

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
  /** Model-space Y that should sit at the entity's feet (ground). Seats walkers
   *  on the ground and gives flying-posed models a hover; 0 for feet-at-origin
   *  rigs (KayKit). Applied as a -groundOffset*fitScale shift. */
  groundOffset: number;
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
    groundOffset: 0,
    clips: KAYKIT_CLIPS,
    clampOnce: KAYKIT_CLAMP_ONCE,
  };
}

// Quaternius "Ultimate Monsters" (CC0, see ASSET_MANIFEST.md) — gives the
// non-humanoid enemy families a real animated body instead of a primitive box.
// Two rigs: ground walkers (Idle/Walk/Run/Punch) and hovering flyers
// (Flying_Idle/Fast_Flying/Punch). All clips are prefixed `CharacterArmature|`.
const Q_GROUND_CLIPS: Record<CharacterAnim, string> = {
  idle: 'CharacterArmature|Idle', walk: 'CharacterArmature|Walk', run: 'CharacterArmature|Run',
  attack: 'CharacterArmature|Punch', death: 'CharacterArmature|Death',
};
const Q_FLYER_CLIPS: Record<CharacterAnim, string> = {
  idle: 'CharacterArmature|Flying_Idle', walk: 'CharacterArmature|Fast_Flying', run: 'CharacterArmature|Fast_Flying',
  attack: 'CharacterArmature|Punch', death: 'CharacterArmature|Death',
};
// Quaternius's simpler rig (Idle/Walk + Bite_Front for the attack — no Run/Punch).
// Shared by blobs AND some bipeds (Wizard, Yeti); `Bite_Front` is the only attack
// clip these GLBs ship, so it's the right (and only) choice for them.
const Q_SIMPLE_CLIPS: Record<CharacterAnim, string> = {
  idle: 'CharacterArmature|Idle', walk: 'CharacterArmature|Walk', run: 'CharacterArmature|Walk',
  attack: 'CharacterArmature|Bite_Front', death: 'CharacterArmature|Death',
};
// joney_lol's golem (CC-BY) is a static mesh — no animation clips; it renders in
// its standing pose (golems read fine stiff). Placeholder names resolve to no action.
const STATIC_CLIPS: Record<CharacterAnim, string> = {
  idle: 'static', walk: 'static', run: 'static', attack: 'static', death: 'static',
};

function quaternius(file: string, nativeHeight: number, clips: Record<CharacterAnim, string>, groundOffset: number): CharacterModelDef {
  return { path: `/models/monsters/${file}.glb`, nativeHeight, forwardYaw: 0, groundOffset, clips, clampOnce: KAYKIT_CLAMP_ONCE };
}

export const CHARACTER_MODELS = {
  'kaykit-knight': kaykit('Knight', 3.436),
  'kaykit-mage': kaykit('Mage', 3.363),
  'kaykit-rogue': kaykit('Rogue', 3.309),
  'kaykit-rogue-hooded': kaykit('Rogue_Hooded', 3.373),
  'kaykit-barbarian': kaykit('Barbarian', 3.311),
  // nativeHeight = visible height (bbox maxY-minY); groundOffset = model-space Y
  // at the feet (≈minY for walkers; lifted for flying-posed models to hover).
  'q-dino': quaternius('Dino', 3.226, Q_GROUND_CLIPS, 0),
  'q-mushroomking': quaternius('MushroomKing', 3.609, Q_GROUND_CLIPS, 0),
  'q-greenblob': quaternius('GreenBlob', 1.853, Q_SIMPLE_CLIPS, 0),
  'q-dragon': quaternius('Dragon', 1.541, Q_FLYER_CLIPS, 1.215),
  'q-squidle': quaternius('Squidle', 1.987, Q_FLYER_CLIPS, 0.597),
  'q-armabee': quaternius('Armabee', 1.886, Q_FLYER_CLIPS, 0.341),
  'q-ghost': quaternius('Ghost', 3.101, Q_FLYER_CLIPS, -0.34),
  'q-stonegolem': quaternius('StoneGolem', 2.064, STATIC_CLIPS, -1.1715),
  // Extra creatures for per-mob-type variety (Quaternius CC0). nativeHeight =
  // visible bbox height; groundOffset seats walkers / hovers flyers.
  'q-pinkslime': quaternius('PinkSlime', 2.009, Q_SIMPLE_CLIPS, 0),
  'q-demon': quaternius('Demon', 3.120, Q_GROUND_CLIPS, 0),
  'q-bluedemon': quaternius('BlueDemon', 2.840, Q_GROUND_CLIPS, 0),
  'q-dragon-evolved': quaternius('DragonEvolved', 2.858, Q_FLYER_CLIPS, -0.27),
  'q-glub': quaternius('Glub', 2.351, Q_FLYER_CLIPS, 0.907),
  'q-hywirl': quaternius('Hywirl', 2.745, Q_FLYER_CLIPS, -0.522),
  'q-orc': quaternius('Orc', 3.209, Q_GROUND_CLIPS, 0),
  'q-wizard': quaternius('Wizard', 2.601, Q_SIMPLE_CLIPS, 0),
  'q-ghostskull': quaternius('GhostSkull', 3.101, Q_FLYER_CLIPS, -0.337),
  'q-yeti': quaternius('Yeti', 2.437, Q_SIMPLE_CLIPS, 0),
  'q-spikyblob': quaternius('SpikyBlob', 4.142, Q_SIMPLE_CLIPS, 0),
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

/** A class → the KayKit body that reads as it. Exhaustive over CharacterClass
 *  so a newly-added class must be mapped (no silent fallback). */
const BASECLASS_MODEL: Record<CharacterClass, CharacterModelId> = {
  mage: 'kaykit-mage',
  healer: 'kaykit-mage',
  knight: 'kaykit-knight',
  paladin: 'kaykit-knight',
  warrior: 'kaykit-barbarian',
  rogue: 'kaykit-rogue',
  ranger: 'kaykit-rogue-hooded',
};

/** Pick a player's model from their specialization's base class so a mage looks
 *  like a mage; unspecialized players fall back to a stable per-id variety. */
export function playerModel(playerId: string, specializationId?: string | null): CharacterModelId {
  if (specializationId) {
    const base = getSpecializationById(specializationId)?.baseClass;
    if (base) return BASECLASS_MODEL[base];
  }
  return pickPlayerModel(playerId);
}

/** Each enemy family → the body that reads as it. Humanoid/undead reuse the
 *  KayKit rig (tinted by the caller); the rest get a Quaternius monster. Unknown
 *  families fall back to the barbarian brute so nothing renders as a bare box. */
// Exhaustive over EnemyFamily — adding a new family to the content union forces
// a model mapping here (compile error) rather than silently boxing the new mob.
const ENEMY_FAMILY_MODEL: Record<EnemyTemplate['family'], CharacterModelId> = {
  humanoid: 'kaykit-barbarian',
  undead: 'kaykit-rogue-hooded',
  beast: 'q-dino',
  elemental: 'q-greenblob',
  dragon: 'q-dragon',
  aberration: 'q-squidle',
  fey: 'q-armabee',
  spirit: 'q-ghost',
  plant: 'q-mushroomking',
  construct: 'q-stonegolem',
};

export function enemyModel(family: string): CharacterModelId {
  return ENEMY_FAMILY_MODEL[family as EnemyTemplate['family']] ?? 'kaykit-barbarian';
}

/** Per-mob-type model overrides for variety within a family — e.g. a slime and a
 *  tentacle-horror shouldn't share one body. Only types that need a DIFFERENT model
 *  than their family default are listed; everything else uses the family model, and
 *  the per-type tint (getEnemyVisual.color) still differentiates same-model mobs
 *  (fire vs ice elemental, wolf vs frost_wolf). (beast wolf/spider have no override
 *  yet — the monster pack has no wolf/spider; that's an animals-pack follow-up.) */
const ENEMY_TYPE_MODEL: Record<string, CharacterModelId> = {
  // humanoid (family default barbarian)
  goblin: 'kaykit-rogue',
  orc: 'q-orc',
  troll: 'q-yeti',
  necromancer: 'q-wizard',
  // undead (family default rogue-hooded)
  skeleton: 'q-ghostskull',
  // dragon (family default q-dragon)
  drake: 'q-dragon-evolved',
  // elemental (family default q-greenblob)
  crystal_elemental: 'q-spikyblob',
  // aberration (family default q-squidle — so squid types need no entry)
  slime: 'q-pinkslime',
  shadowbeast: 'q-demon',
  chrono_stalker: 'q-demon',
  darkstalker: 'q-bluedemon',
  temporal_overlord: 'q-bluedemon',
  voidwalker: 'q-hywirl',
  void_spawner: 'q-glub',
};

export function enemyModelForType(type: string, family: string): CharacterModelId {
  return ENEMY_TYPE_MODEL[type] ?? enemyModel(family);
}

/** A default in-hand weapon so armed mobs don't fight bare-handed. Explicitly
 *  per family (undefined for any other), so a future animated family doesn't
 *  silently inherit an axe. Undead wraiths carry a sword; humanoid brutes an axe. */
export function enemyWeaponType(family: string): string | undefined {
  if (family === 'undead') return 'sword';
  if (family === 'humanoid') return 'mace';
  return undefined;
}
