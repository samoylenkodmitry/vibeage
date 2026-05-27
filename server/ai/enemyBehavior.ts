import type { VecXZ } from '../../packages/protocol/messages.js';
import {
  directionXZ,
  distanceXZ,
  rotationYForDirection,
} from '../../packages/sim/geometry.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import { killPlayer } from '../players/playerLifecycle.js';
import type { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import { applyResolvedDamageToTarget } from '../combat/damageResolution.js';
import { incomingMissChance } from '../combat/statusQueries.js';
import { rollMiss } from '../../packages/sim/combatMath.js';

export type EnemyAttackResult = {
  /** Damage actually applied to the player's HP (post shield / mitigation). 0 on a dodge. */
  damage: number;
  killed: boolean;
  /** True when the player dodged the swing (active evasion buff). */
  miss: boolean;
};

export function findAggroTargetId(
  enemy: Enemy,
  players: Record<string, PlayerState>,
  candidateIds: string[],
  now: number,
): string | null {
  for (const playerId of candidateIds) {
    const player = players[playerId];
    if (!player?.isAlive) {
      continue;
    }
    // Invisible players cannot be aggro'd (Vanish/Stealth effects).
    if (isPlayerInvisible(player, now)) {
      continue;
    }

    if (distanceXZ(enemy.position, player.position) <= enemy.aggroRadius) {
      return playerId;
    }
  }

  return null;
}

/**
 * True when the player carries an active invisibility effect (Vanish).
 * Used by enemy AI to skip aggro and to drop existing target locks.
 */
export function isPlayerInvisible(player: PlayerState, now: number): boolean {
  return (player.statusEffects ?? []).some((effect) => {
    if (effect.type !== 'invisible') return false;
    const expiresAt = (effect.startTimeTs ?? 0) + (effect.durationMs ?? 0);
    return expiresAt > now;
  });
}

/**
 * Returns the enemy's current effective movement speed, accounting for
 * active slow / speed_boost status effects. Matches the player-side
 * convention in `worldMovement.getPlayerSpeed` (multiplicative, fixed
 * factors per effect type — `effect.value` is ignored).
 */
export function getEnemyMovementSpeed(enemy: Enemy, now: number): number {
  let speed = enemy.movementSpeed;
  for (const effect of enemy.statusEffects) {
    const expiresAt = (effect.startTimeTs ?? 0) + (effect.durationMs ?? 0);
    if (expiresAt <= now) continue;
    if (effect.type === 'slow') {
      speed *= 0.7;
    } else if (effect.type === 'speed_boost') {
      speed *= 1.3;
    }
  }
  return speed;
}

/**
 * Sets the enemy's velocity vector + facing toward `targetPosition`.
 * Position integration is deferred to `worldMovement.advanceEnemyPosition`
 * which runs in the input/movement phase of the same tick — keeping the
 * AI phase free to compose multiple intents without each one stamping
 * its own position step.
 *
 * Previously this function ALSO added `velocity * deltaTime` to the
 * position, double-stepping enemies past their advertised
 * `movementSpeed`. Removed in PR #324; the createEnemy multiplier was
 * doubled (6 → 12) so the perceived gameplay speed stays the same.
 */
export function moveEnemyToward(
  enemy: Enemy,
  targetPosition: VecXZ,
  _spatialGrid: SpatialHashGrid,
  _deltaTime: number,
  now: number,
): void {
  const direction = directionXZ(enemy.position, targetPosition);
  const speed = getEnemyMovementSpeed(enemy, now);

  enemy.velocity = {
    x: direction.x * speed,
    z: direction.z * speed,
  };
  enemy.rotation.y = rotationYForDirection(direction);
  markEnemyDirty(enemy);
}

export function stopEnemy(enemy: Enemy): void {
  enemy.velocity = { x: 0, z: 0 };
}

export function faceEnemyToward(enemy: Enemy, targetPosition: VecXZ): void {
  enemy.rotation.y = rotationYForDirection(directionXZ(enemy.position, targetPosition));
}

export function snapEnemyToSpawn(enemy: Enemy, spatialGrid: SpatialHashGrid): void {
  const oldPos = { x: enemy.position.x, z: enemy.position.z };

  enemy.position.x = enemy.spawnPosition.x;
  enemy.position.z = enemy.spawnPosition.z;
  stopEnemy(enemy);

  if (enemy.spawnRotation === undefined) {
    enemy.spawnRotation = enemy.rotation.y;
  } else {
    enemy.rotation.y = enemy.spawnRotation;
  }

  spatialGrid.move(enemy.id, oldPos, enemy.position);
  markEnemyDirty(enemy);
}

export function applyEnemyAttack(enemy: Enemy, targetPlayer: PlayerState, now: number): EnemyAttackResult | null {
  if (now - enemy.lastAttackTime < enemy.attackCooldownMs) {
    return null;
  }
  enemy.lastAttackTime = now;

  // Evasion now dodges mob swings too (it used to only roll in the
  // player-cast path): the accuracy-vs-evasion stat differential plus
  // any flat evasion-buff dodge. Seeded per (enemy, player, tick) so
  // it's deterministic. Enemy accuracy comes from its spec stats.
  const missChance = incomingMissChance(enemy.stats?.accuracy, targetPlayer, now);
  if (rollMiss(`${enemy.id}:${targetPlayer.id}:${now}`, missChance)) {
    return { damage: 0, killed: false, miss: true };
  }

  // Route through the shared defensive pipeline so shield absorb,
  // below-half-HP mitigation, and P.Def apply to mob damage, not just
  // PvP casts. Mob swings are physical.
  const damage = applyResolvedDamageToTarget(targetPlayer, enemy.attackDamage, now, { kind: 'physical' });

  let killed = false;
  if (targetPlayer.health <= 0) {
    // Archwork item #2 sub-work 1 — unified killPlayer keeps the
    // death-state shape identical across normal-enemy hits, boss
    // signatures, and DoT ticks.
    killed = killPlayer(targetPlayer, now);
  }

  return { damage, killed, miss: false };
}

export function makeEnemyUpdate(enemy: Enemy): Pick<Enemy, 'id' | 'targetId' | 'aiState'> {
  return {
    id: enemy.id,
    targetId: enemy.targetId,
    aiState: enemy.aiState,
  };
}

export function markEnemyDirty(enemy: Enemy): void {
  enemy.dirtySnap = true;
}
