import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import type { StatusEffect } from '../../packages/protocol/messages.js';
import type { GameState } from '../gameState.js';
import { emitEnemyUpdated, emitPlayerUpdated, type OutboundEventSink } from '../transport/outboundEvents.js';

function hasRecordKey<T>(record: Record<string, T>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/**
 * Damage-over-time effects (burn / poison / generic dot) deal
 * `effect.value` flat damage every DOT_TICK_INTERVAL_MS while active.
 * The first tick fires DOT_TICK_INTERVAL_MS after the effect started
 * (i.e. burn applied at t=0 hits for the first time at t=1000).
 *
 * Per-effect "next tick due" timestamps live in a process-local
 * WeakMap keyed by the effect object itself — when an effect is
 * replaced (upsertStatusEffect) or pruned (pruneExpiredStatusEffects),
 * the old object is GC'd and its tracking entry goes with it. No
 * manual cleanup is needed.
 */

export const DOT_TICK_INTERVAL_MS = 1_000;
const DOT_EFFECT_TYPES: ReadonlySet<string> = new Set(['burn', 'poison', 'dot']);

const nextTickAt = new WeakMap<StatusEffect, number>();

export function resetDotTrackerForTests(): void {
  // WeakMap has no clear(); reassignment is the established pattern.
  // Tests that need isolation create fresh StatusEffect objects, so
  // this is mostly a no-op — kept as an explicit hook in case future
  // tests want to opt in to a fresh-tracker assertion.
}

type DotApplyResult = {
  damaged: boolean;
  died: boolean;
};

/**
 * Walks every player and enemy in the state, applies any due DoT
 * ticks, emits playerUpdated / enemyUpdated for damaged entities,
 * and returns nothing (mutates state in place).
 */
export function tickDamageOverTimeEffects(
  state: GameState,
  outbound: OutboundEventSink,
  now: number = Date.now(),
): void {
  for (const playerId in state.players) {
    if (!hasRecordKey(state.players, playerId)) continue;
    const player = state.players[playerId];
    if (!player.isAlive) continue;
    if (applyDueDotTicks(player, now).damaged) {
      emitPlayerUpdated(outbound, {
        id: player.id,
        health: player.health,
        isAlive: player.isAlive,
      });
    }
  }
  for (const enemyId in state.enemies) {
    if (!hasRecordKey(state.enemies, enemyId)) continue;
    const enemy = state.enemies[enemyId];
    if (!enemy.isAlive) continue;
    if (applyDueDotTicks(enemy, now).damaged) {
      emitEnemyUpdated(outbound, { id: enemy.id, health: enemy.health, isAlive: enemy.isAlive });
    }
  }
}

function applyDueDotTicks(entity: PlayerState | Enemy, now: number): DotApplyResult {
  let damaged = false;
  for (const effect of entity.statusEffects ?? []) {
    if (!DOT_EFFECT_TYPES.has(effect.type)) continue;
    const startedAt = effect.startTimeTs ?? 0;
    const expiresAt = startedAt + (effect.durationMs ?? 0);

    const due = nextTickAt.get(effect) ?? (startedAt + DOT_TICK_INTERVAL_MS);
    if (due > now) {
      nextTickAt.set(effect, due);
      continue;
    }

    // Apply one tick per due interval, catching up if we're behind.
    // Bounded by `expiresAt` so a fully-expired effect (e.g., world
    // stalled past the duration) still credits every tick it should
    // have landed before expiry, but never beyond.
    const tickCeiling = Math.min(now, expiresAt);
    let nextDue = due;
    while (nextDue <= tickCeiling) {
      const damage = Math.max(0, effect.value);
      entity.health = Math.max(0, entity.health - damage);
      damaged = damaged || damage > 0;
      nextDue += DOT_TICK_INTERVAL_MS;
      if (entity.health <= 0) {
        entity.isAlive = false;
        return { damaged: true, died: true };
      }
    }
    nextTickAt.set(effect, nextDue);
  }
  return { damaged, died: false };
}
