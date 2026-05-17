import { CLASS_SKILL_TREES, type CharacterClass } from '../content/classes.js';
import type { ItemStatBlock } from '../content/equipmentTypes.js';
import { DEFAULT_RACE, RACE_PROFILES, type CharacterRace } from '../content/races.js';

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
  /** L2-style combat numbers derived on the server so the HUD can render them. */
  pAtk: number;
  mAtk: number;
  pDef: number;
  mDef: number;
  /** Points restored per server regen tick. */
  hpRegen: number;
  mpRegen: number;
  accuracy: number;
  evasion: number;
  /** Attacks per minute (legacy L2 unit). */
  attackSpeed: number;
  /** Cast time multiplier — 1.0 is baseline; lower = faster. */
  castSpeed: number;
  /** Movement speed in units per second. */
  runSpeed: number;
};

// Note: per-class STAT_WEIGHTS were removed in the race=base-attrs
// refactor. Base STR/DEX/CON/INT/WIT/MEN come from RACE_PROFILES now;
// class differentiation moves to passive skills (ROADMAP Section 8 L520).
// Class-owned HP/MP/damage *multipliers* (healthMultiplier etc. on
// CLASS_SKILL_TREES[c].baseStats) still apply below as an interim
// "passive bonus" until the passive-skill system lands.

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

const BASE_PATK = 6;
const BASE_MATK = 6;
const BASE_PDEF = 6;
const BASE_MDEF = 6;
const BASE_RUN_SPEED = 7;
const BASE_ATTACK_SPEED = 300;
const BASE_ACCURACY = 90;
const BASE_EVASION = 5;

export function derivePlayerStats(
  level: number,
  className: CharacterClass,
  equipment: ItemStatBlock = {},
  race: CharacterRace = DEFAULT_RACE,
): DerivedPlayerStats {
  // Base attributes are race-owned. Class no longer multiplies STR/DEX/
  // CON/INT/WIT/MEN — class differentiation now happens via passive
  // skills that modify the *derived* combat stats (pAtk/mAtk/etc.).
  // See ROADMAP Section 8 L520 + the "race=attrs, class=skills,
  // equipment=skills" architecture note.
  const profile = RACE_PROFILES[race] ?? RACE_PROFILES[DEFAULT_RACE];
  const baseAttrs = profile.baseAttrs;
  const growth = profile.growthPerLevel;
  const safeLevel = Math.max(1, Math.floor(level));
  const levelDelta = safeLevel - 1;
  const str = Math.floor(baseAttrs.str + growth.str * levelDelta);
  const dex = Math.floor(baseAttrs.dex + growth.dex * levelDelta);
  const con = Math.floor(baseAttrs.con + growth.con * levelDelta);
  const int = Math.floor(baseAttrs.int + growth.int * levelDelta);
  const wit = Math.floor(baseAttrs.wit + growth.wit * levelDelta);
  const men = Math.floor(baseAttrs.men + growth.men * levelDelta);

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

  const speedMultiplier = baseStats?.speedMultiplier ?? 1;
  const equipPAtk = equipment.pAtk ?? 0;
  const equipMAtk = equipment.mAtk ?? 0;
  const equipPDef = equipment.pDef ?? 0;
  const equipMDef = equipment.mDef ?? 0;
  const pAtk = Math.round((BASE_PATK + str * 1.4 + safeLevel * 2) * damageMultiplier + equipPAtk);
  const mAtk = Math.round((BASE_MATK + int * 1.6 + safeLevel * 2) * damageMultiplier + equipMAtk);
  const pDef = Math.round(BASE_PDEF + con * 1.1 + safeLevel * 1.5 + equipPDef);
  const mDef = Math.round(BASE_MDEF + men * 1.1 + safeLevel * 1.4 + equipMDef);
  const hpRegen = Math.max(1, Math.round((con * 0.18 + safeLevel * 0.4) * 10) / 10);
  const mpRegen = Math.max(1, Math.round((men * 0.22 + safeLevel * 0.5) * 10) / 10);
  const accuracy = Math.round(BASE_ACCURACY + dex * 0.5 + safeLevel * 0.6);
  const evasion = Math.round(BASE_EVASION + dex * 0.4 + safeLevel * 0.3);
  const attackSpeed = Math.round((BASE_ATTACK_SPEED + dex * 4 + (equipment.attackSpeed ?? 0)) * 10) / 10;
  // Cast speed: WIT lowers the multiplier (faster). Clamp so it never goes
  // below 0.4 (i.e. 2.5x normal speed) to avoid runaway scaling.
  const castSpeed = Math.max(0.4, Math.round((1 - wit * 0.005) * 100) / 100);
  const runSpeed = Math.max(2, Math.round((BASE_RUN_SPEED + dex * 0.05) * speedMultiplier * 10) / 10
    + (equipment.moveSpeed ?? 0));

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
    pAtk,
    mAtk,
    pDef,
    mDef,
    hpRegen,
    mpRegen,
    accuracy,
    evasion,
    attackSpeed,
    castSpeed,
    runSpeed,
  };
}

const MAGIC_CLASSES: ReadonlySet<CharacterClass> = new Set(['mage', 'healer', 'paladin']);

function isMagicClass(className: CharacterClass): boolean {
  return MAGIC_CLASSES.has(className);
}
