import type { RespawnRequest } from '../../packages/protocol/messages.js';
import { getSpecializationById, PROFICIENCY_LEVEL } from '../../packages/content/specializations.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import { recomputePlayerStats } from './playerStatsRefresh.js';
import type { GameState } from '../gameState.js';
import { error as logError, log, LOG_CATEGORIES, warn } from '../logger.js';
import { runtimeMetrics } from '../observability/runtimeMetrics.js';
import type { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import { emitPlayerUpdated, type OutboundEventSink } from '../transport/outboundEvents.js';

const MANA_REGEN_PER_TICK = 2;
const RESPAWN_POSITION = { x: 0, y: 0.5, z: 0 };

type PlayerUpdatePayload = {
  id: string;
  experience?: number;
  experienceToNextLevel?: number;
  level?: number;
  maxHealth?: number;
  health?: number;
  maxMana?: number;
  mana?: number;
  availableSkillPoints?: number;
  position?: PlayerState['position'];
  isAlive?: boolean;
  deathTimeTs?: number;
  statusEffects?: PlayerState['statusEffects'];
  castingSkill?: PlayerState['castingSkill'];
  castingProgressMs?: PlayerState['castingProgressMs'];
  targetId?: PlayerState['targetId'];
  movement?: PlayerState['movement'];
  velocity?: PlayerState['velocity'];
};

/**
 * Archwork item #2 sub-work 1 — unified player-death helper.
 *
 * Pre-rework the death state mutations were duplicated across
 * `enemyBehavior.applyEnemyAttack` (normal enemy hits player),
 * `enemyStateMachine` (boss signature damage), and `dotTicker`
 * (player DoT ticks). Each site flipped `isAlive=false` and
 * partially cleared cast / target state — slightly differently
 * depending on which path. A future cast-pipeline tweak that
 * forgot to update one site would leave a "dead player with a
 * pending cast" footgun.
 *
 * One helper, one state shape. Returns `true` if the call killed
 * the player (was alive before, is dead now), `false` if the
 * player was already dead. The caller decides whether to emit a
 * `playerUpdated` — the helper deliberately stays silent so it can
 * be called from contexts that batch outbound events differently.
 *
 * The helper does NOT remove the player from the spatial grid:
 * dead players keep their position so `respawnPlayer` can
 * teleport them away from the corpse and the spatial grid stays
 * consistent across the respawn.
 */
export function killPlayer(player: PlayerState, now: number): boolean {
  if (!player.isAlive) return false;
  player.health = 0;
  player.isAlive = false;
  player.deathTimeTs = now;
  // Clear pre-death intent / commitments so the new life doesn't
  // start mid-cast or pre-targeting an enemy that may not exist
  // anymore by respawn time.
  player.targetId = null;
  player.castingSkill = null;
  player.castingProgressMs = 0;
  return true;
}

export function awardPlayerXP(
  player: PlayerState,
  xpAmount: number,
  sourceInfo: string,
): PlayerUpdatePayload {
  const oldExp = player.experience;
  player.experience += xpAmount;
  log(LOG_CATEGORIES.PLAYER, `Player ${player.id} gained ${xpAmount} XP from ${sourceInfo}. XP: ${oldExp} -> ${player.experience}`);

  if (player.experience >= player.experienceToNextLevel) {
    const oldSkillPoints = player.availableSkillPoints;
    const oldMaxExp = player.experienceToNextLevel;

    player.level += 1;
    player.experience -= oldMaxExp;
    player.experienceToNextLevel = Math.floor(oldMaxExp * 1.5);
    // §45.3 — level-up bumps every level-scaling contribution; one
    // recompute updates pAtk / maxHealth / regen / etc. simultaneously.
    recomputePlayerStats(player);
    player.health = player.maxHealth;
    player.mana = player.maxMana;
    player.availableSkillPoints += 1;

    log(LOG_CATEGORIES.PLAYER, `Player ${player.id} leveled up to level ${player.level}! Next level at ${player.experienceToNextLevel} XP`);
    log(LOG_CATEGORIES.PLAYER, `Player ${player.id} gained a skill point. Total: ${player.availableSkillPoints} (before: ${oldSkillPoints})`);
  }

  return {
    id: player.id,
    experience: player.experience,
    experienceToNextLevel: player.experienceToNextLevel,
    level: player.level,
    maxHealth: player.maxHealth,
    health: player.health,
    maxMana: player.maxMana,
    mana: player.mana,
    availableSkillPoints: player.availableSkillPoints,
  };
}

/**
 * Apply HP + MP regeneration once per maintenance tick. Rates come
 * from the player's derived stats (player.stats.hpRegen / mpRegen),
 * applied in real seconds since the last regen so the in-game
 * "2.4 hp/s" the panel shows matches what actually happens — no
 * dependency on tick frequency. Dead players don't regen; out-of-
 * combat is implicit (we always regen when alive + below cap).
 */
export function handleResourceRegeneration(
  state: GameState,
  outbound: OutboundEventSink,
  now: number,
): void {
  const alivePlayers = Object.values(state.players).filter((p) => p.isAlive);
  for (const player of alivePlayers) {
    const last = player.lastRegenTimeMs ?? now;
    const dtSeconds = Math.max(0, (now - last) / 1000);
    player.lastRegenTimeMs = now;
    if (dtSeconds <= 0) continue;
    // §45.3 follow-up — Cardinal Sanctity / future regen-aura specs
    // add a flat HP/sec bonus while a carrier is in range.
    const auraBonus = partyHpRegenAuraBonusFor(player, alivePlayers);
    const hpRegen = (player.stats?.hpRegen ?? MANA_REGEN_PER_TICK) + auraBonus;
    const mpRegen = player.stats?.mpRegen ?? MANA_REGEN_PER_TICK;
    const oldHp = player.health;
    const oldMana = player.mana;
    if (player.health < player.maxHealth) {
      player.health = Math.min(player.maxHealth, player.health + hpRegen * dtSeconds);
    }
    if (player.mana < player.maxMana) {
      player.mana = Math.min(player.maxMana, player.mana + mpRegen * dtSeconds);
    }
    const hpChanged = Math.abs(player.health - oldHp) > 0.5;
    const manaChanged = Math.abs(player.mana - oldMana) > 0.5;
    if (hpChanged || manaChanged) {
      emitPlayerUpdated(outbound, {
        id: player.id,
        ...(hpChanged ? { health: player.health } : {}),
        ...(manaChanged ? { mana: player.mana } : {}),
      });
    }
  }
}

// §45.3 — sum of flat HP/sec from every other-player ally within
// their declared aura radius. Multiple Cardinals stack additively.
function partyHpRegenAuraBonusFor(player: PlayerState, alivePlayers: PlayerState[]): number {
  let bonus = 0;
  for (const ally of alivePlayers) {
    if (ally.id === player.id) continue;
    if (!ally.specializationId) continue;
    const spec = getSpecializationById(ally.specializationId);
    if (!spec) continue;
    const tiers = ally.level >= PROFICIENCY_LEVEL
      ? [spec.specializationPassive.modifiers, spec.proficiencyPassive.modifiers]
      : [spec.specializationPassive.modifiers];
    for (const mods of tiers) {
      const flat = mods.partyHpRegenAuraBonus;
      const radius = mods.partyHpRegenAuraRadiusM;
      if (!flat || !radius) continue;
      const dx = ally.position.x - player.position.x;
      const dz = ally.position.z - player.position.z;
      if (dx * dx + dz * dz > radius * radius) continue;
      bonus += flat;
    }
  }
  return bonus;
}

export function respawnPlayer(
  state: GameState,
  spatial: SpatialHashGrid,
  playerId: string,
): PlayerUpdatePayload | null {
  const player = state.players[playerId];

  if (!player) {
    logError(LOG_CATEGORIES.PLAYER, `RespawnRequest: player ${playerId} not found`);
    return null;
  }

  if (player.isAlive) {
    warn(LOG_CATEGORIES.PLAYER, `RespawnRequest: player ${playerId} is already alive`);
    return null;
  }

  const oldPosition = { x: player.position.x, z: player.position.z };
  player.isAlive = true;
  player.health = Math.floor(player.maxHealth * 0.5);
  player.mana = Math.floor(player.maxMana * 0.5);
  player.position = { ...RESPAWN_POSITION };
  player.deathTimeTs = undefined;
  player.velocity = { x: 0, z: 0 };
  // Clear pre-death state that would otherwise carry through:
  //  - statusEffects: a Burn that killed you would tick again at half
  //    HP on the very next DoT cycle and re-kill instantly.
  //  - casting state: if death interrupted a cast, the client would
  //    show a stuck cast bar.
  //  - movement target / dirty flag: the player would start walking
  //    toward their pre-death target the moment they respawn.
  //  - targetId: stale enemy reference from before death.
  player.statusEffects = [];
  player.castingSkill = null;
  player.castingProgressMs = 0;
  player.targetId = null;
  player.movement = undefined;
  // §45.3 follow-up — once-per-life Resurrection save resets on
  // respawn so Phoenix Knights can rely on it through their next
  // death-cycle without an explicit "fight ended" hook.
  player.usedResurrectionThisLife = false;
  player.dirtySnap = true;

  // Global-state cleanup: the player object is the source of truth for
  // local fields above, but the world state has parallel collections
  // (in-flight casts indexed by castId, effects indexed by targetId)
  // that also need to be cleared. Otherwise a cast started right before
  // death keeps ticking through resolution and a leftover effect row
  // could re-apply on the respawned player.
  for (const castId of Object.keys(state.activeCasts)) {
    if (state.activeCasts[castId]?.casterId === playerId) {
      delete state.activeCasts[castId];
    }
  }
  delete state.effectsByTarget[playerId];

  spatial.remove(player.id, oldPosition);
  spatial.insert(player.id, { x: player.position.x, z: player.position.z });

  log(LOG_CATEGORIES.PLAYER, `Player ${player.id} (${player.name}) respawned at ${JSON.stringify(RESPAWN_POSITION)}`);

  return {
    id: player.id,
    health: player.health,
    mana: player.mana,
    position: player.position,
    isAlive: true,
    deathTimeTs: undefined,
    statusEffects: player.statusEffects,
    castingSkill: player.castingSkill,
    castingProgressMs: player.castingProgressMs,
    targetId: player.targetId,
    movement: player.movement,
    velocity: player.velocity,
  };
}

export function onRespawnRequest(
  state: GameState,
  msg: RespawnRequest,
  outbound: OutboundEventSink,
  spatial: SpatialHashGrid,
  socketId: string,
): void {
  // Ownership check: a socket can only respawn the player it owns.
  // Without this any connected client could send {id: someoneElseId}
  // and force-respawn another player.
  const player = state.players[msg.id];
  if (!player) {
    return;
  }
  if (player.socketId !== socketId) {
    warn(LOG_CATEGORIES.PLAYER, `RespawnRequest rejected: socket ${socketId} does not own player ${msg.id}`);
    runtimeMetrics.increment('clientMessages.invalidOwnership.RespawnRequest');
    runtimeMetrics.increment('clientMessages.invalidOwnership.total');
    return;
  }
  const update = respawnPlayer(state, spatial, msg.id);
  if (update) {
    emitPlayerUpdated(outbound, update);
  }
}
