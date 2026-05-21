import type { VecXZ } from '../../packages/protocol/messages.js';
import {
  directionXZ,
  distanceXZ,
  rotationYForDirection,
} from '../../packages/sim/geometry.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import type { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';

export type EnemyAttackResult = {
  damage: number;
  killed: boolean;
};

export function findAggroTargetId(
  enemy: Enemy,
  players: Record<string, PlayerState>,
  candidateIds: string[],
  now: number = Date.now(),
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
export function isPlayerInvisible(player: PlayerState, now: number = Date.now()): boolean {
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
export function getEnemyMovementSpeed(enemy: Enemy, now: number = Date.now()): number {
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
  now: number = Date.now(),
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

  const damage = enemy.attackDamage;
  targetPlayer.health -= damage;
  enemy.lastAttackTime = now;

  let killed = false;
  if (targetPlayer.health <= 0) {
    targetPlayer.health = 0;
    targetPlayer.isAlive = false;
    targetPlayer.deathTimeTs = now;
    targetPlayer.targetId = null;
    targetPlayer.castingSkill = null;
    targetPlayer.castingProgressMs = 0;
    killed = true;
  }

  return { damage, killed };
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
