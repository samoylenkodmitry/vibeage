import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import type { StatusEffect } from '../../packages/protocol/messages.js';
import type { GameState } from '../gameState.js';
import { killPlayer } from '../players/playerLifecycle.js';
import type { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import { emitEnemyUpdated, emitPlayerUpdated, type OutboundEventSink } from '../transport/outboundEvents.js';
import { handleTargetDeath } from './targetDeath.js';

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
  /**
   * Archwork item #2 sub-work 3 — when a DoT tick landed the
   * killing blow, this is the `sourceCasterId` of the effect that
   * killed (the player who originally cast the DoT). The caller
   * uses it to route the kill through `handleTargetDeath` so XP /
   * quest / loot credit flows to the right player.
   */
  killerCasterId?: string;
};

/**
 * Walks every player and enemy in the state, applies any due DoT
 * ticks, emits playerUpdated / enemyUpdated for damaged entities,
 * and routes enemy DoT-kills through `handleTargetDeath` so the
 * caster gets XP / quest / loot credit (archwork item #2 sub-work 3).
 */
export function tickDamageOverTimeEffects(
  state: GameState,
  spatial: SpatialHashGrid,
  outbound: OutboundEventSink,
  now: number,
): void {
  for (const playerId in state.players) {
    if (!hasRecordKey(state.players, playerId)) continue;
    const player = state.players[playerId];
    if (!player.isAlive) continue;
    const result = applyDueDotTicks(player, now);
    if (result.died) {
      // Archwork item #2 sub-work 1 — route player DoT deaths
      // through killPlayer so cast / target / pre-death state
      // clears the same way it does for enemy-hit kills.
      // applyDueDotTicks may have already flipped isAlive=false
      // for the legacy (no-source-caster) fallback path; killPlayer
      // is idempotent on an already-dead player so this is safe.
      killPlayer(player, now);
    }
    if (result.damaged) {
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
    const result = applyDueDotTicks(enemy, now);
    if (result.died) {
      // Roll the kill credit + side effects through the canonical
      // death seam when we have a known caster. handleTargetDeath
      // sets isAlive=false, removes from spatial, awards XP/quest/
      // loot, etc.
      const caster = result.killerCasterId
        ? state.players[result.killerCasterId]
        : null;
      if (caster) {
        handleTargetDeath(caster, enemy, { state, spatial, outbound, now });
        // handleTargetDeath flips the enemy dead + fans out rewards, but does
        // NOT broadcast the enemy's death — and the `continue` skips the loop's
        // trailing emit. Without this, a DoT-killed enemy stays shown alive on
        // every client (direct-damage kills emit via the hit path instead).
        emitEnemyUpdated(outbound, { id: enemy.id, health: enemy.health, isAlive: enemy.isAlive, deathTimeTs: enemy.deathTimeTs });
        continue;
      }
      // No caster (legacy untracked DoT or caster disconnected
      // mid-tick): flip the death state manually. No XP, no loot,
      // no quest credit, but the enemy must not stay alive at 0 hp.
      enemy.isAlive = false;
      spatial.remove(enemy.id, { x: enemy.position.x, z: enemy.position.z });
    }
    if (result.damaged) {
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
      const damage = Math.max(0, effect.value) * Math.max(1, effect.stacks ?? 1);
      entity.health = Math.max(0, entity.health - damage);
      damaged = damaged || damage > 0;
      nextDue += DOT_TICK_INTERVAL_MS;
      if (entity.health <= 0) {
        // applyDueDotTicks deliberately does NOT flip isAlive — the
        // caller decides. For enemies with a known caster the caller
        // routes through handleTargetDeath (full reward fan-out).
        // For players the caller routes through killPlayer (cast +
        // target cleanup). For legacy untracked enemies the caller
        // does a plain isAlive=false fallback.
        return {
          damaged: true,
          died: true,
          ...(effect.sourceCasterId ? { killerCasterId: effect.sourceCasterId } : {}),
        };
      }
    }
    nextTickAt.set(effect, nextDue);
  }
  return { damaged, died: false };
}
