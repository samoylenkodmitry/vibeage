import { CLASS_SKILL_TREES, type CharacterClass } from '../content/classes.js';
import type { ItemStatBlock } from '../content/equipmentTypes.js';

export type DerivedPlayerStats = {
  str: number;
  dex: number;
  con: number;
  int: number;
  wit: number;
  men: number;
  dmgMult: number;
  critChance: number;
  critMult: number;
  maxHealth: number;
  maxMana: number;
};

type StatWeights = {
  str: number;
  dex: number;
  con: number;
  int: number;
  wit: number;
  men: number;
};

const STAT_WEIGHTS: Record<CharacterClass, StatWeights> = {
  warrior: { str: 2.4, dex: 1.2, con: 2.0, int: 0.8, wit: 0.8, men: 0.8 },
  ranger: { str: 1.4, dex: 2.4, con: 1.4, int: 1.0, wit: 1.6, men: 1.0 },
  mage: { str: 0.8, dex: 1.0, con: 1.0, int: 2.6, wit: 2.2, men: 1.4 },
  healer: { str: 1.4, dex: 1.0, con: 1.6, int: 2.0, wit: 1.4, men: 2.4 },
  knight: { str: 2.2, dex: 1.0, con: 2.4, int: 1.0, wit: 0.8, men: 1.0 },
  paladin: { str: 1.8, dex: 1.0, con: 2.0, int: 1.6, wit: 1.0, men: 2.0 },
  rogue: { str: 1.4, dex: 2.6, con: 1.2, int: 0.8, wit: 1.6, men: 1.0 },
};

const DEFAULT_WEIGHTS: StatWeights = { str: 1.5, dex: 1.5, con: 1.5, int: 1.5, wit: 1.5, men: 1.5 };

const BASE_HEALTH = 100;
const BASE_MANA = 100;
const HEALTH_PER_CON = 6;
const MANA_PER_MEN = 4;
const DMG_PER_PRIMARY = 0.04;
const CRIT_PER_DEX = 0.005;
const CRIT_MULT_BASE = 1.6;
const CRIT_MULT_PER_WIT = 0.01;
const HP_LEVEL_BONUS = 14;
const MP_LEVEL_BONUS = 6;

const EQUIPMENT_PATK_TO_DMG = 0.01;
const EQUIPMENT_MATK_TO_DMG = 0.01;

export function derivePlayerStats(
  level: number,
  className: CharacterClass,
  equipment: ItemStatBlock = {},
): DerivedPlayerStats {
  const weights = STAT_WEIGHTS[className] ?? DEFAULT_WEIGHTS;
  const safeLevel = Math.max(1, Math.floor(level));
  const str = 8 + Math.floor(safeLevel * weights.str);
  const dex = 8 + Math.floor(safeLevel * weights.dex);
  const con = 8 + Math.floor(safeLevel * weights.con);
  const int = 8 + Math.floor(safeLevel * weights.int);
  const wit = 8 + Math.floor(safeLevel * weights.wit);
  const men = 8 + Math.floor(safeLevel * weights.men);

  const classTree = CLASS_SKILL_TREES[className];
  const baseStats = classTree?.baseStats;
  const healthMultiplier = baseStats?.healthMultiplier ?? 1;
  const manaMultiplier = baseStats?.manaMultiplier ?? 1;
  const damageMultiplier = baseStats?.damageMultiplier ?? 1;
  const primary = isMagicClass(className) ? int : str;
  const equipmentDmg = isMagicClass(className)
    ? (equipment.mAtk ?? 0) * EQUIPMENT_MATK_TO_DMG
    : (equipment.pAtk ?? 0) * EQUIPMENT_PATK_TO_DMG;
  const dmgMult = damageMultiplier * (1 + (primary - 8) * DMG_PER_PRIMARY + equipmentDmg);
  const critChance = (dex - 8) * CRIT_PER_DEX + (equipment.critRate ?? 0) * 0.01;
  const critMult = CRIT_MULT_BASE + (wit - 8) * CRIT_MULT_PER_WIT;

  const maxHealth = Math.round((BASE_HEALTH + safeLevel * HP_LEVEL_BONUS) * healthMultiplier * (1 + (con - 8) * 0.05))
    + (con - 8) * HEALTH_PER_CON
    + (equipment.hp ?? 0);
  const maxMana = Math.round((BASE_MANA + safeLevel * MP_LEVEL_BONUS) * manaMultiplier)
    + (men - 8) * MANA_PER_MEN
    + (equipment.mp ?? 0);

  return {
    str,
    dex,
    con,
    int,
    wit,
    men,
    dmgMult,
    critChance,
    critMult,
    maxHealth,
    maxMana,
  };
}

const MAGIC_CLASSES: ReadonlySet<CharacterClass> = new Set(['mage', 'healer', 'paladin']);

function isMagicClass(className: CharacterClass): boolean {
  return MAGIC_CLASSES.has(className);
}
