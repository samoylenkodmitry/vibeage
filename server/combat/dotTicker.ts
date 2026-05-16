import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import type { GameState } from '../gameState.js';
import { emitEnemyUpdated, emitPlayerUpdated, type OutboundEventSink } from '../transport/outboundEvents.js';

/**
 * Damage-over-time effects (burn / poison / generic dot) deal
 * `effect.value` flat damage every DOT_TICK_INTERVAL_MS while active.
 * The first tick fires DOT_TICK_INTERVAL_MS after the effect started
 * (i.e. burn applied at t=0 hits for the first time at t=1000).
 *
 * Per-effect "next tick due" timestamps live in a process-local map
 * keyed by effect.id. The map is intentionally not serialised — a
 * server restart resets the DoT schedule (the effects themselves
 * survive via persistence, just realign at restart).
 */

export const DOT_TICK_INTERVAL_MS = 1_000;
export const DOT_EFFECT_TYPES: ReadonlySet<string> = new Set(['burn', 'poison', 'dot']);

const nextTickAt = new Map<string, number>();

export function resetDotTrackerForTests(): void {
  nextTickAt.clear();
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
  for (const player of Object.values(state.players)) {
    if (!player.isAlive) continue;
    if (applyDueDotTicks(player, now).damaged) {
      emitPlayerUpdated(outbound, {
        id: player.id,
        health: player.health,
        isAlive: player.isAlive,
      });
    }
  }
  for (const enemy of Object.values(state.enemies)) {
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

    const due = nextTickAt.get(effect.id) ?? (startedAt + DOT_TICK_INTERVAL_MS);
    if (due > now) {
      nextTickAt.set(effect.id, due);
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
    nextTickAt.set(effect.id, nextDue);
  }
  return { damaged, died: false };
}
