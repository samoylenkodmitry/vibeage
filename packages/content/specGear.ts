import type { EquipmentSet } from './equipmentSets.js';
import type { Item } from './items.js';
import type { LootDrop } from './lootTables.js';

/**
 * Roadmap §5 bullet 2 — specialization-targeted equipment sets.
 *
 * Every entry here is a *complete* set: four pieces that occupy
 * four distinct slots (so `getSetMaxWearable` returns 4 and both
 * bonus tiers are reachable), all at one `grade`, all dropped by a
 * single named boss whose zone band sits at or above
 * `GRADE_SPECS[grade].minLevel`. One boss = one set keeps the
 * player-facing story simple ("Vereth wears the Graveglow") and
 * keeps the wiki "Dropped by" cross-link to a single row.
 *
 * The gaps these fill: before this file the mage and healer
 * specializations had no set of their own at any grade — every
 * shipped set was medium/heavy armor or a physical weapon. A robe
 * caster picking Cardinal saw an empty gear path on the Specs tab.
 *
 * Stat priorities per spec live in the pieces + the bonus tiers,
 * not in engine code: healers stack mp/mDef with an mAtk kicker
 * (healing scales off mAtk), mages stack mAtk/critRate, knight-
 * likes stack pDef/mDef/hp.
 */

type SpecGearPieceSpec = {
  id: string;
  name: string;
  description: string;
  equip: Item['equip'];
  stats: Item['stats'];
};

type SpecGearSetSpec = {
  setId: string;
  name: string;
  grade: NonNullable<Item['grade']>;
  /** Level floor stamped on every piece — matches the boss's band. */
  minLevel: number;
  /** Loot table the four pieces are appended to (a boss table). */
  lootTableId: string;
  /** Per-piece drop chance on that table. */
  dropChance: number;
  pieces: readonly SpecGearPieceSpec[];
  bonuses: EquipmentSet['bonuses'];
  intendedSpecs: EquipmentSet['intendedSpecs'];
};

const ROBE = { armorType: 'robe' } as const;
const HEAVY = { armorType: 'heavy' } as const;

const SPEC_GEAR_SPECS: readonly SpecGearSetSpec[] = [
  {
    setId: 'graveglow_vestments',
    name: 'Graveglow Vestments',
    grade: 'd',
    minLevel: 8,
    lootTableId: 'boss_loot_vereth_bone_lord',
    dropChance: 0.14,
    intendedSpecs: ['cardinal', 'theurge'],
    pieces: [
      {
        id: 'graveglow_hood',
        name: 'Graveglow Hood',
        description: 'A burial hood that keeps a little of the grave-light it was buried in.',
        equip: { bodyPart: 'head', allowedSlots: ['HEAD'], ...ROBE },
        stats: { mDef: 18, mp: 30, mAtk: 8 },
      },
      {
        id: 'graveglow_gloves',
        name: 'Graveglow Gloves',
        description: 'Wrapped in ghostlight thread. Warm to the touch, which is the unsettling part.',
        equip: { bodyPart: 'gloves', allowedSlots: ['GLOVES'], ...ROBE },
        stats: { mDef: 12, mp: 22, mAtk: 10 },
      },
      {
        id: 'graveglow_slippers',
        name: 'Graveglow Slippers',
        description: 'Soft burial slippers. They make no sound on stone, and very little on bone.',
        equip: { bodyPart: 'boots', allowedSlots: ['BOOTS'], ...ROBE },
        stats: { mDef: 12, mp: 18, moveSpeed: 0.1 },
      },
      {
        id: 'graveglow_stole',
        name: 'Graveglow Stole',
        description: 'A funerary stole embroidered with the names Vereth could no longer pronounce.',
        equip: { bodyPart: 'cloak', allowedSlots: ['CLOAK'], ...ROBE },
        stats: { mDef: 16, mp: 26, mAtk: 6 },
      },
    ],
    bonuses: [
      { requiredCount: 2, statModifiers: { mp: 30, mDef: 10 } },
      { requiredCount: 4, statModifiers: { mp: 80, mDef: 26, mAtk: 18 } },
    ],
  },
  {
    setId: 'emberweave_silks',
    name: 'Emberweave Silks',
    grade: 'd',
    minLevel: 11,
    lootTableId: 'boss_loot_vorthax_ember_wyrm',
    dropChance: 0.14,
    intendedSpecs: ['arcanist', 'pyromancer'],
    pieces: [
      {
        id: 'emberweave_circlet',
        name: 'Emberweave Circlet',
        description: 'Bronze wire around a coal that has refused to go out since Vorthax hatched.',
        equip: { bodyPart: 'head', allowedSlots: ['HEAD'], ...ROBE },
        stats: { mAtk: 16, mDef: 10, mp: 24, critRate: 2 },
      },
      {
        id: 'emberweave_wraps',
        name: 'Emberweave Wraps',
        description: 'Scorched silk hand-wraps. The seams glow when the wearer starts a cast.',
        equip: { bodyPart: 'gloves', allowedSlots: ['GLOVES'], ...ROBE },
        stats: { mAtk: 14, mDef: 8, critRate: 3 },
      },
      {
        id: 'emberweave_striders',
        name: 'Emberweave Striders',
        description: 'Ash-cloth shoes with molten soles that never quite touch the ground.',
        equip: { bodyPart: 'boots', allowedSlots: ['BOOTS'], ...ROBE },
        stats: { mAtk: 8, mDef: 8, mp: 18, moveSpeed: 0.1 },
      },
      {
        id: 'emberweave_mantle',
        name: 'Emberweave Mantle',
        description: 'Red-gold silk that smolders without burning. Drake-tailors are a small guild.',
        equip: { bodyPart: 'cloak', allowedSlots: ['CLOAK'], ...ROBE },
        stats: { mAtk: 12, mDef: 14, mp: 20 },
      },
    ],
    bonuses: [
      { requiredCount: 2, statModifiers: { mAtk: 14, mp: 25 } },
      { requiredCount: 4, statModifiers: { mAtk: 36, critRate: 5, mp: 60 } },
    ],
  },
  {
    setId: 'prismward_bulwark',
    name: 'Prismward Bulwark',
    grade: 'd',
    minLevel: 14,
    lootTableId: 'boss_loot_prism_warden',
    dropChance: 0.14,
    intendedSpecs: ['templar_knight', 'dark_avenger', 'phoenix_knight', 'evas_templar'],
    pieces: [
      {
        id: 'prismward_helm',
        name: 'Prismward Helm',
        description: 'A faceted visor that splits an incoming spell into colours before it lands.',
        equip: { bodyPart: 'head', allowedSlots: ['HEAD'], ...HEAVY },
        stats: { pDef: 26, mDef: 18, hp: 30 },
      },
      {
        id: 'prismward_gauntlets',
        name: 'Prismward Gauntlets',
        description: 'Steel knuckles set with crystal shards cut from the Warden itself.',
        equip: { bodyPart: 'gloves', allowedSlots: ['GLOVES'], ...HEAVY },
        stats: { pDef: 20, mDef: 12, hp: 22 },
      },
      {
        id: 'prismward_greaves',
        name: 'Prismward Greaves',
        description: 'Crystal-inlaid plate boots. Heavy, cold, and very hard to move off a line.',
        equip: { bodyPart: 'boots', allowedSlots: ['BOOTS'], ...HEAVY },
        stats: { pDef: 22, mDef: 14, hp: 26 },
      },
      {
        id: 'prismward_aegis',
        name: 'Prismward Aegis',
        description: 'Layered prism over steel. Blocks the blow and shows you the rainbow it made.',
        equip: { bodyPart: 'shield', allowedSlots: ['OFF_HAND'], handUsage: 'shield' },
        stats: { pDef: 30, mDef: 22, hp: 40 },
      },
    ],
    bonuses: [
      { requiredCount: 2, statModifiers: { pDef: 18, hp: 40 } },
      { requiredCount: 4, statModifiers: { pDef: 44, mDef: 30, hp: 120 } },
    ],
  },
  {
    setId: 'dawnhymn_raiment',
    name: 'Dawnhymn Raiment',
    grade: 'c',
    minLevel: 22,
    lootTableId: 'boss_loot_auriel',
    dropChance: 0.12,
    intendedSpecs: ['cardinal', 'theurge'],
    pieces: [
      {
        id: 'dawnhymn_veil',
        name: 'Dawnhymn Veil',
        description: 'A veil that holds a ring of sunrise where the wearer\'s halo would be.',
        equip: { bodyPart: 'head', allowedSlots: ['HEAD'], ...ROBE },
        stats: { mDef: 44, mp: 55, mAtk: 20 },
      },
      {
        id: 'dawnhymn_gloves',
        name: 'Dawnhymn Gloves',
        description: 'Gold-thread embroidery that catches the first light of any morning.',
        equip: { bodyPart: 'gloves', allowedSlots: ['GLOVES'], ...ROBE },
        stats: { mDef: 32, mp: 40, mAtk: 24 },
      },
      {
        id: 'dawnhymn_sandals',
        name: 'Dawnhymn Sandals',
        description: 'Ceremonial sandals worn by the choir that sang Auriel back to sleep.',
        equip: { bodyPart: 'boots', allowedSlots: ['BOOTS'], ...ROBE },
        stats: { mDef: 30, mp: 34, moveSpeed: 0.2 },
      },
      {
        id: 'dawnhymn_pallium',
        name: 'Dawnhymn Pallium',
        description: 'A white-and-gold pallium clasped with a sunburst. It weighs almost nothing.',
        equip: { bodyPart: 'cloak', allowedSlots: ['CLOAK'], ...ROBE },
        stats: { mDef: 40, mp: 46, mAtk: 16 },
      },
    ],
    bonuses: [
      { requiredCount: 2, statModifiers: { mp: 60, mDef: 24 } },
      { requiredCount: 4, statModifiers: { mp: 150, mDef: 60, mAtk: 40 } },
    ],
  },
];

/** Armor pieces weigh more than robes; keep it coarse but non-uniform. */
function pieceWeight(piece: SpecGearPieceSpec): number {
  if (piece.equip?.bodyPart === 'shield') return 3200;
  if (piece.equip?.armorType === 'heavy') return 1800;
  return 700;
}

function buildItems(): Record<string, Item> {
  const out: Record<string, Item> = {};
  for (const set of SPEC_GEAR_SPECS) {
    for (const piece of set.pieces) {
      const equip = piece.equip;
      out[piece.id] = {
        id: piece.id,
        name: piece.name,
        description: piece.description,
        icon: `${piece.id}.svg`,
        stackable: false,
        type: 'armor',
        kind: equip?.bodyPart === 'shield' ? 'shield' : 'armor',
        grade: set.grade,
        weight: pieceWeight(piece),
        setId: set.setId,
        equip: equip ? { ...equip, requirements: { minLevel: set.minLevel } } : undefined,
        stats: piece.stats,
      };
    }
  }
  return out;
}

function buildSets(): Record<string, EquipmentSet> {
  const out: Record<string, EquipmentSet> = {};
  for (const set of SPEC_GEAR_SPECS) {
    out[set.setId] = {
      setId: set.setId,
      name: set.name,
      requiredPieces: set.pieces.map((p) => p.id),
      bonuses: set.bonuses,
      intendedSpecs: set.intendedSpecs,
    };
  }
  return out;
}

function buildDrops(): Record<string, readonly LootDrop[]> {
  const out: Record<string, LootDrop[]> = {};
  for (const set of SPEC_GEAR_SPECS) {
    const drops = (out[set.lootTableId] ??= []);
    for (const piece of set.pieces) {
      drops.push({ itemId: piece.id, quantity: { min: 1, max: 1 }, chance: set.dropChance });
    }
  }
  return out;
}

export const SPEC_GEAR_ITEMS: Record<string, Item> = buildItems();
export const SPEC_GEAR_SETS: Record<string, EquipmentSet> = buildSets();
/** Merged into `LOOT_TABLES` through `SUPPLEMENTAL_DROPS`. */
export const SPEC_GEAR_DROPS: Record<string, readonly LootDrop[]> = buildDrops();
