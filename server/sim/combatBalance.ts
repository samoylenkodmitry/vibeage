/**
 * Combat-balance harness — plays out real 1v1 fights on a virtual
 * clock (SimClock) so time-to-kill / time-to-die can be measured
 * deterministically, without a GPU client or wall-clock waiting.
 *
 * It drives the engine's OWN systems, sim-timed: a player's offence runs
 * through the real cast pipeline (handleCastReq → tickCasts → projectile
 * travel → resolveCastImpact), and a mob's offence runs through the real
 * AI state machine (updateEnemyAI → applyEnemyAttack). Regen is the
 * shared maintenance system. There is no parallel combat model — the
 * numbers are exactly what the live tick produces over the same span,
 * so cast-time, cooldowns, projectile travel, and aggro/attack cadence
 * all count.
 *
 * Scope (so the read is honest): a gear-less sim player (offence = class
 * passives + attribute scaling + the chosen skill), casting its main
 * attack on cooldown against a stationary same-level goblin (timeToKill),
 * or standing in a same-level goblin's reach while it attacks (timeToDie).
 * A baseline floor, not a geared-endgame model.
 */
import type { CharacterClass } from '../../packages/content/classes.js';
import type { SkillId } from '../../packages/content/skills.js';
import type { CastReq } from '../../packages/protocol/messages.js';
import { SimClock } from '../../packages/sim/simClock.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import { createEnemy } from '../enemies/enemyLifecycle.js';
import { createTransientPlayer } from '../playerFactory.js';
import { recomputePlayerStats } from '../players/playerStatsRefresh.js';
import { starterSkillsFor } from '../players/playerProgression.js';
import { handleCastReq } from '../combat/castHandler.js';
import { tickCasts } from '../combat/skillSystem.js';
import { updateEnemyAI } from '../ai/enemyAI.js';
import { handleResourceRegeneration } from '../players/playerLifecycle.js';
import { createGameState, type GameState } from '../gameState.js';
import { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import { createWorldCombatBridge } from '../world/router/castHandlers.js';
import type { DirectMessageSink, OutboundEvent, OutboundEventSink } from '../transport/outboundEvents.js';

const ORIGIN = { x: 0, y: 0, z: 0 };
/** A fight that runs past this (virtual) is reported as "no kill". */
const DEFAULT_TIMEOUT_MS = 120_000;
/** Tick cadence — matches the live server loop (30 Hz). */
const TICK_MS = 1000 / 30;
/** Combatant separation: within every main-attack's range (min is backstab @3). */
const ENGAGE_DISTANCE = 1.5;

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

type Arena = {
  state: GameState;
  spatial: SpatialHashGrid;
  events: OutboundEvent[];
  outbound: OutboundEventSink;
  clock: SimClock;
};

/**
 * A bare world holding just the two combatants. The drivers below call
 * the real engine systems against it on the SimClock — no zone/region
 * machinery, since a 1v1 measure doesn't need it.
 */
function makeArena(player: PlayerState, enemy: Enemy): Arena {
  const state = createGameState();
  const spatial = new SpatialHashGrid();
  const events: OutboundEvent[] = [];
  const outbound: OutboundEventSink = { publish: (event) => events.push(event) };

  player.position = { x: 0, y: 0.5, z: 0 };
  enemy.position = { x: ENGAGE_DISTANCE, y: 0.5, z: 0 };
  state.players[player.id] = player;
  state.enemies[enemy.id] = enemy;
  spatial.insert(player.id, { x: player.position.x, z: player.position.z });
  spatial.insert(enemy.id, { x: enemy.position.x, z: enemy.position.z });

  return { state, spatial, events, outbound, clock: new SimClock() };
}

export type KillResult = {
  /** ms of virtual time to bring the target to 0 HP, or null if it survived the timeout. */
  ttkMs: number | null;
  /** Number of casts that landed damage on the enemy. */
  hits: number;
};

/**
 * Player repeatedly casts `skillId` at a stationary enemy via the REAL
 * cast pipeline (cooldown / mana / range all enforced by handleCastReq;
 * cast-time + projectile travel resolved by tickCasts). MP regenerates
 * between casts through the shared maintenance system.
 */
export function timeToKill(
  player: PlayerState,
  enemy: Enemy,
  skillId: SkillId,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): KillResult {
  if (!player.unlockedSkills.includes(skillId)) {
    player.unlockedSkills = [...player.unlockedSkills, skillId];
  }
  const { state, spatial, outbound, clock } = makeArena(player, enemy);
  const world = createWorldCombatBridge(state, outbound, spatial);
  const socket = { id: player.socketId };
  // Cast-rejected / -fail direct messages are irrelevant to the measure.
  const direct: DirectMessageSink = { send: () => undefined };
  const castReq = (now: number): CastReq =>
    ({ type: 'CastReq', id: player.id, skillId, targetId: enemy.id, clientTs: now } as CastReq);

  let hits = 0;
  while (enemy.isAlive && enemy.health > 0 && clock.now() < timeoutMs) {
    // Issue a fresh cast only while idle; the real rules (cooldown,
    // mana, range) decide whether it's accepted.
    if (!player.castingSkill) {
      handleCastReq(socket, player, castReq(clock.now()), { direct, outbound }, world, { activeCasts: state.activeCasts, now: clock.now() });
    }
    const before = enemy.health;
    clock.advanceBy(TICK_MS);
    tickCasts(state.activeCasts, TICK_MS, outbound, world, clock.now());
    handleResourceRegeneration(state, outbound, clock.now());
    if (enemy.health < before) hits += 1;
  }
  return { ttkMs: enemy.health <= 0 ? clock.now() : null, hits };
}

export type SurviveResult = {
  /** ms of virtual time until the player dies, or null if it out-regened (unkillable). */
  ttdMs: number | null;
  /** Number of incoming swings the player dodged. */
  dodges: number;
};

/**
 * The enemy attacks the player through the REAL AI state machine
 * (aggro → chase → attack → applyEnemyAttack: shield, mitigation, dodge,
 * P.Def all apply) while the player only regenerates. Returns
 * time-to-die, or null if the player out-regens the mob.
 */
export function timeToDie(player: PlayerState, enemy: Enemy, timeoutMs = DEFAULT_TIMEOUT_MS): SurviveResult {
  const { state, spatial, outbound, clock, events } = makeArena(player, enemy);

  while (player.isAlive && player.health > 0 && clock.now() < timeoutMs) {
    clock.advanceBy(TICK_MS);
    updateEnemyAI(enemy, state, outbound, spatial, TICK_MS / 1000, clock.now());
    handleResourceRegeneration(state, outbound, clock.now());
  }

  const dodges = events.filter(
    (e) => e.type === 'serverMessage' && e.message.type === 'EnemyAttack' && e.message.damage === 0,
  ).length;
  return { ttdMs: player.health <= 0 ? clock.now() : null, dodges };
}
