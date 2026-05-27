/**
 * Combat-balance harness — plays out real 1v1 fights on a virtual
 * clock (SimClock) so time-to-kill / time-to-die can be measured in
 * microseconds, deterministically, without a GPU client or wall-clock
 * waiting. It drives the *real* combat functions (getDamage,
 * applyResolvedDamageToTarget, applyEnemyAttack, the stat pipeline) so
 * the numbers reflect what actually ships.
 *
 * Simplifications (documented so the read is honest): the sim player
 * has no equipment (offense = class passives + attribute scaling +
 * the chosen skill's base), casts a single skill on cooldown gated by
 * mana, and the damage roll covers variance + crit + dmgMult +
 * defense mitigation but not element / execute / party-aura bonuses.
 * It's a baseline floor, not a geared-endgame model.
 */
import type { CharacterClass } from '../../packages/content/classes.js';
import { SKILLS, type SkillId } from '../../packages/content/skills.js';
import { starterSkillsFor } from '../players/playerProgression.js';
import { getDamage } from '../../packages/sim/combatMath.js';
import { applyResourceRegen } from '../../packages/sim/regen.js';
import { SimClock } from '../../packages/sim/simClock.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import { createEnemy } from '../enemies/enemyLifecycle.js';
import { createTransientPlayer } from '../playerFactory.js';
import { recomputePlayerStats } from '../players/playerStatsRefresh.js';
import { applyResolvedDamageToTarget } from '../combat/damageResolution.js';
import { incomingMissChance } from '../combat/statusQueries.js';
import { applyEnemyAttack } from '../ai/enemyBehavior.js';

const ORIGIN = { x: 0, y: 0, z: 0 };
/** A fight that runs past this (virtual) is reported as "no kill". */
const DEFAULT_TIMEOUT_MS = 120_000;

/** Build a gear-less player of `className` at `level` with full HP/MP. */
export function makeSimPlayer(className: CharacterClass, level: number): PlayerState {
  const player = createTransientPlayer(`sim-${className}-${level}`, `${className}-${level}`);
  // createTransientPlayer hashes Date.now() into the id; pin a stable
  // one so the seeded damage rolls (keyed on player.id) are reproducible.
  player.id = `sim-${className}-${level}`;
  player.className = className;
  player.level = level;
  player.unlockedSkills = starterSkillsFor(className);
  recomputePlayerStats(player);
  player.health = player.maxHealth;
  player.mana = player.maxMana;
  return player;
}

/** Build an enemy of `type` at `level` at the origin. */
export function makeSimEnemy(type: string, level: number): Enemy {
  const spawnTimestampMs = 0; // createEnemy's 4th arg is a spawn time, not an id; fixed for reproducibility.
  return createEnemy(type, level, { ...ORIGIN }, spawnTimestampMs);
}

/** The class's default single-target damage skill for the matrix. */
const MAIN_ATTACK: Record<CharacterClass, SkillId> = {
  mage: 'fireball', warrior: 'slash', healer: 'smite', ranger: 'arrowShot',
  knight: 'slash', paladin: 'smite', rogue: 'backstab',
};

export function mainAttackFor(className: CharacterClass): SkillId {
  return MAIN_ATTACK[className] ?? 'basicAttack';
}

export type KillResult = {
  /** ms of virtual time to bring the target to 0 HP, or null if it survived the timeout. */
  ttkMs: number | null;
  /** Number of skill casts that landed (non-miss, mana-affordable). */
  hits: number;
};

/**
 * Player repeatedly casts `skillId` at the enemy on its cooldown
 * (mana-gated, MP regen between casts) until the enemy dies or the
 * timeout elapses. Returns time-to-kill.
 */
export function timeToKill(
  player: PlayerState,
  enemy: Enemy,
  skillId: SkillId,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): KillResult {
  const skill = SKILLS[skillId];
  const clock = new SimClock();
  const cooldown = Math.max(1, skill.cooldownMs || 500);
  const baseDmg = skill.dmg ?? 0;
  let hits = 0;
  let ttk: number | null = null;
  let castSeq = 0;

  const doCast = () => {
    if (ttk !== null || !enemy.isAlive) return;
    if (player.mana < (skill.manaCost ?? 0)) return; // skip this swing; MP regen fills back
    player.mana -= skill.manaCost ?? 0;
    const seed = `ttk:${player.id}:${enemy.id}:${castSeq++}`;
    const roll = getDamage({
      caster: player.stats ?? {}, skill: { base: baseDmg, variance: 0.1 }, seed,
      targetMissChance: incomingMissChance(player.stats?.accuracy, enemy, clock.now()),
    });
    if (roll.miss) return;
    hits += 1;
    applyResolvedDamageToTarget(enemy, roll.dmg, clock.now(), { kind: skill.kind === 'magical' ? 'magical' : 'physical' });
    if (enemy.health <= 0) { enemy.isAlive = false; ttk = clock.now(); }
  };

  doCast(); // first swing lands immediately (t=0), not a cooldown late
  clock.every(cooldown, doCast);
  clock.every(1000, () => regenMana(player));

  stepUntil(clock, () => ttk !== null, timeoutMs);
  return { ttkMs: ttk, hits };
}

export type SurviveResult = {
  /** ms of virtual time until the player dies, or null if it out-regened (unkillable). */
  ttdMs: number | null;
  /** Dodges the player got from the incoming swings. */
  dodges: number;
};

/**
 * The enemy attacks the player (real `applyEnemyAttack` — shield,
 * mitigation, dodge, P.Def all apply) while the player only regens.
 * Returns time-to-die, or null if the player out-regens the mob.
 */
export function timeToDie(player: PlayerState, enemy: Enemy, timeoutMs = DEFAULT_TIMEOUT_MS): SurviveResult {
  const clock = new SimClock();
  // Let the first swing land at t=0 (applyEnemyAttack gates on
  // now − lastAttackTime ≥ cooldown).
  enemy.lastAttackTime = -enemy.attackCooldownMs;
  let ttd: number | null = null;
  let dodges = 0;

  const doAttack = () => {
    if (ttd !== null || !player.isAlive) return;
    const res = applyEnemyAttack(enemy, player, clock.now());
    if (res?.miss) dodges += 1;
    if (player.health <= 0) { player.isAlive = false; ttd = clock.now(); }
  };

  doAttack(); // first swing at t=0
  clock.every(Math.max(1, enemy.attackCooldownMs), doAttack);
  clock.every(1000, () => regenHealth(player));

  stepUntil(clock, () => ttd !== null, timeoutMs);
  return { ttdMs: ttd, dodges };
}

// Both regen ticks route through the engine's generic regen core (one
// simulated second per call), so the harness measures the SAME math the
// live maintenance phase runs — no parallel regen formula.
function regenMana(player: PlayerState): void {
  applyResourceRegen(player, 0, player.stats?.mpRegen ?? 0, 1);
}

function regenHealth(player: PlayerState): void {
  if (player.health <= 0) return; // a downed player doesn't heal back mid-fight
  applyResourceRegen(player, player.stats?.hpRegen ?? 0, 0, 1);
}

/** Advance the clock in 100ms slices until `done()` or the timeout. */
function stepUntil(clock: SimClock, done: () => boolean, timeoutMs: number): void {
  const step = 100;
  while (!done() && clock.now() < timeoutMs) {
    clock.advanceBy(step);
  }
}
