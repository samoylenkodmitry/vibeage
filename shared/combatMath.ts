import { SkillId, SKILLS } from './skillsDefinition';

/**
 * Calculate the mana cost of a skill, accounting for potential changes from player stats
 * @param skillId The skill ID
 * @param playerLevel Current player level
 * @returns Mana cost for the skill
 */
export function getManaCost(skillId: SkillId, playerLevel: number): number {
  const skill = SKILLS[skillId];
  if (!skill) return 0;
  
  const baseCost = skill.manaCost;
  
  return baseCost;
}

/**
 * Calculate the cooldown of a skill, accounting for potential changes from player stats
 * @param skillId The skill ID
 * @param playerLevel Current player level
 * @returns Cooldown time in milliseconds
 */
export function getCooldownMs(skillId: SkillId, playerLevel: number): number {
  const skill = SKILLS[skillId];
  if (!skill) return 0;
  
  const baseCooldown = skill.cooldownMs;

  return baseCooldown;
}

/** xorshift32 – enough for crit & variability, seed != 0 */
export function rng(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 0xffffffff;
  };
}

/**
 * Simple FNV-1a hash implementation to convert strings to numbers
 * @param str String to hash
 * @returns 32-bit number hash
 */
export function hash(str: string): number {
  let h = 2166136261 >>> 0; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619); // FNV prime
  }
  return h >>> 0;
}

/**
 * Specialized RNG for status effects with a unique hash seed
 * @param seed The base seed to use
 * @returns Random number generator function
 */
export function effectRng(seed: number) {
  return rng(seed ^ 0xEFFECC);
}

export interface DamageOpts {
  caster: { dmgMult?: number; critChance?: number; critMult?: number };
  skill:  { base: number; variance?: number }; // variance , default 0.1
  seed:   string;                              // castId + targetId
}

export function getDamage(opts: DamageOpts): { dmg: number; crit: boolean } {
  const { caster, skill, seed } = opts;
  const roll = rng(hash(seed))();              // 0‑1 uniform
  const variance = 1 + (roll * 2 - 1) * (skill.variance ?? 0.1);
  const critRoll = rng(hash(seed) ^ 0x9e3779b9)();
  const crit = critRoll < (caster.critChance ?? 0);
  const critMult = crit ? (caster.critMult ?? 2) : 1;
  const dmg = skill.base * variance * (caster.dmgMult ?? 1) * critMult;
  return { dmg: Math.round(dmg), crit };
}
