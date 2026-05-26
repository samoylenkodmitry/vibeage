import { SKILLS, type SkillId } from '../content/skills.js';

/**
 * Calculate the mana cost of a skill.
 * @param skillId The skill ID
 * @returns Mana cost for the skill
 */
export function getManaCost(skillId: SkillId): number {
  return SKILLS[skillId]?.manaCost ?? 0;
}

/**
 * Calculate the cooldown of a skill.
 * @param skillId The skill ID
 * @returns Cooldown time in milliseconds
 */
export function getCooldownMs(skillId: SkillId): number {
  return SKILLS[skillId]?.cooldownMs ?? 0;
}

/** xorshift32 - enough for crit and variability. */
export function rng(seed: number): () => number {
  let x = (seed >>> 0) || 1;
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
  /**
   * §52 #6 — chance (0..1) that this hit misses entirely. The roll
   * runs *before* damage/crit so a missed hit reports 0 / non-crit
   * and the caller can suppress status-effect application. Default
   * 0 keeps the legacy "every hit lands" behavior for callers that
   * haven't opted in yet.
   */
  targetMissChance?: number;
}

/**
 * §52 #6 — independent, seeded miss roll. XORs a fixed constant so
 * the stream doesn't share bits with the variance or crit rolls. A
 * `missChance` of 0 (or less) never misses; values are clamped to
 * [0, 1]. Shared by `getDamage` (player casts) and the enemy-attack
 * path so both resolve dodges through one implementation.
 */
export function rollMiss(seed: string, missChance: number): boolean {
  const chance = Math.max(0, Math.min(1, missChance));
  if (chance <= 0) return false;
  return rng(hash(seed) ^ 0xD0DEC0DE)() < chance;
}

export function getDamage(opts: DamageOpts): { dmg: number; crit: boolean; miss: boolean } {
  const { caster, skill, seed, targetMissChance } = opts;
  if (rollMiss(seed, targetMissChance ?? 0)) {
    return { dmg: 0, crit: false, miss: true };
  }
  const roll = rng(hash(seed))();              // 0-1 uniform
  const variance = 1 + (roll * 2 - 1) * (skill.variance ?? 0.1);
  const critRoll = rng(hash(seed) ^ 0x9e3779b9)();
  const crit = critRoll < (caster.critChance ?? 0);
  const critMult = crit ? (caster.critMult ?? 2) : 1;
  const dmg = skill.base * variance * (caster.dmgMult ?? 1) * critMult;
  return { dmg: Math.round(dmg), crit, miss: false };
}
