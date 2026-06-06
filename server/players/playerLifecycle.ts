import type { RespawnRequest } from '../../packages/protocol/messages.js';
import { getSpecializationById, PROFICIENCY_LEVEL } from '../../packages/content/specializations.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import { applyResourceRegen } from '../../packages/sim/regen.js';
import { COMBAT_REGEN_FACTOR, COMBAT_REGEN_WINDOW_MS } from '../../packages/content/stats.js';
import { recomputePlayerStats } from './playerStatsRefresh.js';
import type { GameState } from '../gameState.js';
import { error as logError, log, LOG_CATEGORIES, warn } from '../logger.js';
import { runtimeMetrics } from '../observability/runtimeMetrics.js';
import { recordPlayerXpAward, type XpAwardAuditContext } from '../observability/xpSafetyAudit.js';
import { isEntityPhysicsFrozen } from '../physics/areaPhysics.js';
import type { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import { emitEnemyUpdated, emitPlayerUpdated, type OutboundEventSink } from '../transport/outboundEvents.js';
import { capSingleLevelAwardXP, getExperienceToNextLevel } from './playerProgression.js';

// Emit a resource update only once the accumulated regen is visible at
// the wire's integer resolution, so a 1 hp/s trickle doesn't spam a
// snapshot every tick.
const REGEN_EMIT_THRESHOLD = 0.5;
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
 * Pre-rework the death state mutations were duplicated across the
 * mob-attack path, boss signature damage, and `dotTicker` (player
 * DoT ticks). Each site flipped `isAlive=false` and
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
  auditContext: XpAwardAuditContext = {},
): PlayerUpdatePayload {
  const cappedXpAmount = capSingleLevelAwardXP(player, xpAmount);
  const levelBefore = player.level;
  const oldExp = player.experience;
  player.experience += cappedXpAmount;
  log(
    LOG_CATEGORIES.PLAYER,
    `Player ${player.id} gained ${cappedXpAmount} XP from ${sourceInfo}. XP: ${oldExp} -> ${player.experience}`,
  );
  if (player.experience >= player.experienceToNextLevel) {
    const oldSkillPoints = player.availableSkillPoints;
    while (player.experience >= player.experienceToNextLevel) {
      const oldMaxExp = player.experienceToNextLevel;
      player.level += 1;
      player.experience -= oldMaxExp;
      player.experienceToNextLevel = getExperienceToNextLevel(player.level);
      player.availableSkillPoints += 1;
    }
    // §45.3 — level-up bumps every level-scaling contribution; one
    // recompute updates pAtk / maxHealth / regen / etc. simultaneously.
    recomputePlayerStats(player);
    player.health = player.maxHealth;
    player.mana = player.maxMana;

    log(LOG_CATEGORIES.PLAYER, `Player ${player.id} leveled up to level ${player.level}! Next level at ${player.experienceToNextLevel} XP`);
    log(LOG_CATEGORIES.PLAYER, `Player ${player.id} gained a skill point. Total: ${player.availableSkillPoints} (before: ${oldSkillPoints})`);
  }

  recordPlayerXpAward({
    player,
    sourceInfo,
    rawXp: xpAmount,
    appliedXp: cappedXpAmount,
    levelBefore,
    levelAfter: player.level,
    expBefore: oldExp,
    expAfter: player.experience,
    context: auditContext,
  });

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
 * Apply HP + MP regeneration once per maintenance tick. This is a
 * GENERIC system: it runs the same `applyResourceRegen` core over every
 * live entity, and the per-entity rate is purely a characteristic
 * (`entity.stats.hpRegen` / `mpRegen`). Players and mobs differ only in
 * their spec-derived numbers — no class or mob type is special-cased.
 * Rates apply over real elapsed seconds since the entity last regened
 * so the panel's "2.4 hp/s" matches reality regardless of tick rate.
 * Dead entities don't regen. Passive regen is suppressed for a window
 * after taking a hit (see `combatRegenFactor`), so a combatant can't
 * out-heal sustained incoming damage — out of combat it runs full rate.
 * A mob's `hpRegen` defaults to 0, so a mob only regenerates if its
 * template gives it the characteristic.
 */
export function handleResourceRegeneration(
  state: GameState,
  outbound: OutboundEventSink,
  now: number,
): void {
  const alivePlayers = Object.values(state.players).filter((p) => p.isAlive);
  for (const player of alivePlayers) {
    if (isEntityPhysicsFrozen(player, state.activePhysicsFields, now)) {
      player.lastRegenTimeMs = now;
      continue;
    }
    const dtSeconds = elapsedRegenSeconds(player, now);
    if (dtSeconds <= 0) continue;
    // §45.3 follow-up — Cardinal Sanctity / future regen-aura specs add
    // a flat HP/sec bonus while a carrier is in range. This is a live,
    // proximity-dependent bonus on top of the static characteristic.
    const auraBonus = partyHpRegenAuraBonusFor(player, alivePlayers);
    const combat = combatRegenFactor(player, now);
    const deltas = applyResourceRegen(
      player,
      ((player.stats?.hpRegen ?? 0) + auraBonus) * combat,
      (player.stats?.mpRegen ?? 0) * combat,
      dtSeconds,
    );
    if (deltas.hp > REGEN_EMIT_THRESHOLD || deltas.mp > REGEN_EMIT_THRESHOLD) {
      emitPlayerUpdated(outbound, {
        id: player.id,
        ...(deltas.hp > REGEN_EMIT_THRESHOLD ? { health: player.health } : {}),
        ...(deltas.mp > REGEN_EMIT_THRESHOLD ? { mana: player.mana } : {}),
      });
    }
  }

  for (const enemy of Object.values(state.enemies)) {
    if (!enemy.isAlive) continue;
    if (isEntityPhysicsFrozen(enemy, state.activePhysicsFields, now)) {
      enemy.lastRegenTimeMs = now;
      continue;
    }
    const dtSeconds = elapsedRegenSeconds(enemy, now);
    if (dtSeconds <= 0) continue;
    // Mobs carry no mana pool — the core leaves mp untouched. Rate is
    // the mob's own spec characteristic (0 for everything today),
    // suppressed while the mob is itself under fire.
    const deltas = applyResourceRegen(enemy, (enemy.stats?.hpRegen ?? 0) * combatRegenFactor(enemy, now), 0, dtSeconds);
    if (deltas.hp > REGEN_EMIT_THRESHOLD) {
      emitEnemyUpdated(outbound, { id: enemy.id, health: enemy.health });
    }
  }
}

/**
 * Real seconds since `entity` last regened, stamping `now` as the new
 * mark. Shared by the player + mob regen passes so both advance over
 * wall-elapsed time, not tick count.
 */
function elapsedRegenSeconds(entity: PlayerState | Enemy, now: number): number {
  const last = entity.lastRegenTimeMs ?? now;
  entity.lastRegenTimeMs = now;
  return Math.max(0, (now - last) / 1000);
}

/**
 * Passive-regen multiplier for `entity`: full (1) out of combat, or
 * `COMBAT_REGEN_FACTOR` for `COMBAT_REGEN_WINDOW_MS` after the last hit
 * it took. Keeps a combatant from out-healing sustained incoming damage
 * while letting between-fight recovery run at full rate.
 */
function combatRegenFactor(entity: PlayerState | Enemy, now: number): number {
  const lastHit = entity.lastDamagedTs;
  if (lastHit !== undefined && now - lastHit < COMBAT_REGEN_WINDOW_MS) {
    return COMBAT_REGEN_FACTOR;
  }
  return 1;
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
