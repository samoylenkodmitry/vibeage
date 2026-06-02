import type { StatusEffect } from '../../packages/protocol/messages.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import { pauseDamageOverTimeEffectTracking } from '../combat/dotTicker.js';
import { isEntityPhysicsFrozen, type AreaPhysicsField, type AreaPhysicsFieldStore } from './areaPhysics.js';

type FrozenTimeEntity = PlayerState | Enemy;

/**
 * Removes a frozen tick from an entity's local combat clock.
 *
 * Time-stop physics already prevents motion, casts, projectiles, and AI from
 * advancing. This helper keeps timed entity-local systems on the same model:
 * effect durations, DoT tick due times, regen markers, cooldown deadlines, and
 * enemy AI deadlines all retain their remaining time while the entity is frozen.
 */
export function pauseFrozenEntityTimeSystems(
  entity: FrozenTimeEntity,
  fields: AreaPhysicsFieldStore | readonly AreaPhysicsField[] | undefined,
  now: number,
  dtMs: number,
): boolean {
  if (!entity.isAlive || !isEntityPhysicsFrozen(entity, fields, now)) {
    return false;
  }

  const pauseMs = Math.max(0, dtMs);
  if (pauseMs > 0) {
    const tickStart = now - pauseMs;
    pauseStatusEffectClocks(entity.statusEffects, tickStart, pauseMs);
    pauseDamageOverTimeEffectTracking(entity.statusEffects, pauseMs);
    pauseCooldownDeadlines(entity.skillCooldownEndTs, tickStart, pauseMs);
    pauseRecentDamageClock(entity, pauseMs);
    pauseEnemyLocalClocks(entity, tickStart, pauseMs);
  }

  entity.lastRegenTimeMs = now;
  return true;
}

function pauseStatusEffectClocks(effects: readonly StatusEffect[] | undefined, tickStart: number, pauseMs: number): void {
  for (const effect of effects ?? []) {
    const expiresAt = effect.startTimeTs + effect.durationMs;
    if (effect.durationMs <= 0 || expiresAt <= tickStart) {
      continue;
    }
    effect.startTimeTs += pauseMs;
  }
}

function pauseCooldownDeadlines(deadlines: Record<string, number> | undefined, tickStart: number, pauseMs: number): void {
  if (!deadlines) {
    return;
  }
  for (const [skillId, deadline] of Object.entries(deadlines)) {
    if (deadline > tickStart) {
      deadlines[skillId] = deadline + pauseMs;
    }
  }
}

function pauseRecentDamageClock(entity: FrozenTimeEntity, pauseMs: number): void {
  if (entity.lastDamagedTs !== undefined) {
    entity.lastDamagedTs += pauseMs;
  }
}

function pauseEnemyLocalClocks(entity: FrozenTimeEntity, tickStart: number, pauseMs: number): void {
  if (!('lastAttackTime' in entity)) {
    return;
  }

  entity.lastAttackTime += pauseMs;
  pauseOptionalDeadline(entity, 'patrolWaitUntilTs', tickStart, pauseMs);
  pauseOptionalDeadline(entity, 'aggroSuppressedUntilTs', tickStart, pauseMs);
  pauseOptionalElapsedStart(entity, 'chaseStartedAt', pauseMs);
  pauseOptionalElapsedStart(entity, 'combatStartedTs', pauseMs);
}

function pauseOptionalDeadline<T extends 'patrolWaitUntilTs' | 'aggroSuppressedUntilTs'>(
  enemy: Enemy,
  field: T,
  tickStart: number,
  pauseMs: number,
): void {
  const value = enemy[field];
  if (value !== undefined && value > tickStart) {
    enemy[field] = value + pauseMs;
  }
}

function pauseOptionalElapsedStart<T extends 'chaseStartedAt' | 'combatStartedTs'>(
  enemy: Enemy,
  field: T,
  pauseMs: number,
): void {
  const value = enemy[field];
  if (value !== undefined) {
    enemy[field] = value + pauseMs;
  }
}
