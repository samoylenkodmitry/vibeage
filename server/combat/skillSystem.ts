import { SKILLS, SkillId } from '../../packages/content/skills.js';
import { CastState as CastStateEnum, VecXZ } from '../../packages/protocol/messages.js';
import { effectiveCastMs } from '../../packages/sim/combatMath.js';
import { nanoid } from 'nanoid';
import { PlayerState as Player } from '../../packages/sim/entities.js';
import { emitCastSnapshot, makeCastSnapshot, sendCastSnapshotToClient } from './castSnapshots.js';
import { resolveCastImpact } from './impactResolver.js';
import { updateTravelingCast } from './projectileRuntime.js';
import {
  emitPlayerUpdated,
  type DirectMessageSink,
  type OutboundEventSink,
} from '../transport/outboundEvents.js';
import { debug, error, LOG_CATEGORIES, warn } from '../logger.js';
import type { CombatWorld } from './worldContract.js';

// Set of constants for skill system
export const CAST_BROADCAST_RATE = 50; // ms, how often to send cast snapshots

/**
 * Server-side Cast object with complete state machine
 */
export interface Cast {
  castId: string;
  casterId: string;
  skillId: SkillId;
  state: CastStateEnum;
  origin: VecXZ;
  target?: VecXZ;
  pos?: VecXZ; // Current position for projectiles
  dir?: VecXZ; // Direction for projectiles
  startedAt: number; // When the cast started
  progressMs?: number; // Progress in milliseconds since cast started
  lastBroadcast?: number; // Last time position was broadcast
  castTimeMs: number;
  targetId?: string;
  targetPos?: VecXZ;
  speed?: number; // Projectile speed
  /**
   * §45.5 — entity IDs already damaged by this projectile when the
   * skill's projectile.pierce flag is set. Each new pierce hit
   * applies damage immediately and appends to this list; the
   * runtime stops once `maxPierceHits` is reached. Non-piercing
   * projectiles never populate this field.
   */
  pierceHits?: string[];
}

export type ActiveCastStore = Record<string, Cast>;

export type CastRequestInput = {
  activeCasts: ActiveCastStore;
  player: Player;
  casterId: string;
  skillId: SkillId;
  targetPos: VecXZ | undefined;
  targetId: string | undefined;
  outbound: OutboundEventSink;
  world: CombatWorld;
};

export function createActiveCastStore(): ActiveCastStore {
  return {};
}

/**
 * Handle a new cast request from a player
 */
export function handleCastRequest(input: CastRequestInput): string | Cast['castId'] {
  const {
    activeCasts,
    player,
    casterId,
    skillId,
    targetPos,
    targetId,
    outbound,
    world,
  } = input;
  const now = Date.now();
  const skill = SKILLS[skillId];
  
  if (!skill) {
    error(LOG_CATEGORIES.COMBAT, `Invalid skill ID: ${skillId}`);
    return 'invalid';
  }
  
  debug(LOG_CATEGORIES.COMBAT, 'Creating cast', { casterId, skillId, targetId, targetPos });
  
  // Create a new Cast
  const newCast: Cast = {
    castId: nanoid(),
    casterId: casterId,
    skillId: skillId,
    state: CastStateEnum.Casting,
    origin: { x: player.position.x, z: player.position.z },
    startedAt: now,
    // castSpeed shortens the cast bar (see stats.ts TIMING model).
    castTimeMs: effectiveCastMs(skill.castMs || 0, player.stats?.castSpeed),
    targetId: targetId,
    targetPos: targetPos,
    pos: { x: player.position.x, z: player.position.z }
  };
  
  // Self-buff / no-target beneficial skills (Holy Light, Divine Shield, Evade,
  // Vanish, Dispel, Shield Wall, Bless, Rapid Fire) reach the impact resolver
  // with no targetId / targetPos and have it resolve to the caster. Only
  // explicitly target-requiring skills need to bail here.
  if (!targetPos && !targetId && skill.requiresTarget) {
    warn(LOG_CATEGORIES.COMBAT, `No target position or ID provided for cast: ${newCast.castId}`);
    return 'missingTarget';
  }
  
  if (skill.projectile) {
    const projectileFailure = configureProjectileCast(newCast, targetPos, targetId, skill.projectile.speed, world);
    if (projectileFailure) {
      return projectileFailure;
    }
  }
  
  // Add to active casts
  activeCasts[newCast.castId] = newCast;
  debug(LOG_CATEGORIES.COMBAT, `Added cast ${newCast.castId}`, {
    activeCastCount: Object.keys(activeCasts).length,
  });
  
  // Broadcast initial cast snapshot
  const snapshot = makeCastSnapshot(newCast);
  emitCastSnapshot(outbound, newCast);
  debug(LOG_CATEGORIES.COMBAT, `Broadcast initial cast snapshot ${newCast.castId}`, { snapshot });

  // Set player UI info
  if (player) {
    player.castingSkill = skillId;
    player.castingProgressMs = 0;

    emitPlayerUpdated(outbound, {
      id: player.id,
      mana: player.mana,
      skillCooldownEndTs: player.skillCooldownEndTs,
      castingSkill: player.castingSkill,
      castingProgressMs: player.castingProgressMs
    });
  }

  return newCast.castId;
}

function configureProjectileCast(
  cast: Cast,
  targetPos: VecXZ | undefined,
  targetId: string | undefined,
  speed: number,
  world: CombatWorld,
): 'targetNotFound' | null {
  const targetPosVec = resolveCastTargetPosition(targetPos, targetId, world);
  if (!targetPosVec) {
    warn(LOG_CATEGORIES.COMBAT, `Target ID ${targetId} not found for cast: ${cast.castId}`);
    return 'targetNotFound';
  }

  const dx = targetPosVec.x - cast.origin.x;
  const dz = targetPosVec.z - cast.origin.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist > 0) {
    cast.dir = { x: dx / dist, z: dz / dist };
    cast.speed = speed;
    debug(LOG_CATEGORIES.COMBAT, `Set projectile direction for cast ${cast.castId}`, {
      direction: {
        x: Number(cast.dir.x.toFixed(2)),
        z: Number(cast.dir.z.toFixed(2)),
      },
      speed: cast.speed,
    });
  }

  return null;
}

function resolveCastTargetPosition(
  targetPos: VecXZ | undefined,
  targetId: string | undefined,
  world: CombatWorld,
): VecXZ | undefined {
  if (targetPos) {
    return targetPos;
  }

  if (!targetId) {
    return undefined;
  }

  const target = world.getEnemyById(targetId);
  return target ? { x: target.position.x, z: target.position.z } : undefined;
}

/**
 * Get an existing cast by ID
 */
export function getCastById(activeCasts: ActiveCastStore, castId: string): Cast | undefined {
  return activeCasts[castId];
}

/**
 * Updates and progresses active casts, transitions them between states
 * Fully implemented server-authoritative state machine
 */
export function tickCasts(activeCasts: ActiveCastStore, dt: number, outbound: OutboundEventSink, world: CombatWorld): void {
  const now = Date.now();

  for (const castId of Object.keys(activeCasts)) {
    const cast = activeCasts[castId];

    // Skip casts that are already in their final state and remove after delay
    if (cast.state === CastStateEnum.Impact) {
      // Remove completed casts
      debug(LOG_CATEGORIES.COMBAT, `Removing completed cast ${cast.castId}`, { skillId: cast.skillId });
      delete activeCasts[castId];
      continue;
    }

    // Check if cast time is complete for casts in Casting state
    if (cast.state === CastStateEnum.Casting && now - cast.startedAt >= cast.castTimeMs) {
      const skill = SKILLS[cast.skillId];
      const newState = skill.projectile ? CastStateEnum.Traveling : CastStateEnum.Impact;
      debug(LOG_CATEGORIES.COMBAT, `Cast ${cast.castId} transitioned to ${newState}`, {
        skillId: cast.skillId,
        casterId: cast.casterId,
      });

      cast.state = newState;

      // Update startedAt to when projectile *begins* traveling
      if (newState === CastStateEnum.Traveling) {
        cast.startedAt = now;
      }

      // Clear the player's casting state when casting is complete
      const player = world.getPlayerById(cast.casterId);
      if (player) {
        player.castingSkill = null;
        player.castingProgressMs = 0;

        emitPlayerUpdated(outbound, {
          id: player.id,
          castingSkill: player.castingSkill,
          castingProgressMs: player.castingProgressMs
        });
      }

      // Broadcast state change
      const snapshot = makeCastSnapshot(cast);
      debug(LOG_CATEGORIES.COMBAT, `Broadcast cast state change ${cast.castId}`, { snapshot });
      emitCastSnapshot(outbound, cast);

      // If instant skill, resolve impact immediately
      if (cast.state === CastStateEnum.Impact) {
        debug(LOG_CATEGORIES.COMBAT, `Resolving instant impact for cast ${cast.castId}`, {
          skillId: cast.skillId,
        });
        resolveCastImpact(cast, outbound, world);
      }
      continue;
    } else if (cast.state === CastStateEnum.Casting) {
      // Update casting progress
      const progressMs = now - cast.startedAt;
      const player = world.getPlayerById(cast.casterId);
      if (player) {
        player.castingProgressMs = progressMs;
        emitPlayerUpdated(outbound, {
          id: player.id,
          castingSkill: cast.skillId,
          castingProgressMs: cast.castTimeMs
        });
      }
      cast.progressMs = progressMs;
      // Broadcast cast progress
      const snapshot = makeCastSnapshot(cast);
      debug(LOG_CATEGORIES.COMBAT, `Broadcast cast progress ${cast.castId}`, { snapshot });
      emitCastSnapshot(outbound, cast);
      continue;
    }

    if (cast.state === CastStateEnum.Traveling) {
      updateTravelingCast(cast, dt / 1000, now, CAST_BROADCAST_RATE, outbound, world);
    }
  }
}

/**
 * Send snapshots of all active casts to a new client
 */
export function sendCastSnapshots(activeCasts: ActiveCastStore, client: DirectMessageSink): void {
  // Send all active casts to the client
  for (const cast of Object.values(activeCasts)) {
    sendCastSnapshotToClient(client, cast);
  }
}

/**
 * Cancel an active cast
 */
export function cancelCast(activeCasts: ActiveCastStore, casterId: string, skillId?: SkillId): boolean {
  const cast = Object.values(activeCasts).find(cast =>
    cast.casterId === casterId &&
    (skillId ? cast.skillId === skillId : true) &&
    cast.state === CastStateEnum.Casting // Can only cancel during casting
  );

  if (cast) {
    delete activeCasts[cast.castId];
    return true;
  }

  return false;
}

/**
 * Get all active casts
 */
export function getActiveCasts(activeCasts: ActiveCastStore): Cast[] {
  return Object.values(activeCasts);
}
