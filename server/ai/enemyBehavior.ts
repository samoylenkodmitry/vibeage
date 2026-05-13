import type { VecXZ } from '../../packages/protocol/messages.js';
import type { Enemy, PlayerState } from '../../shared/types.js';
import type { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';

export type EnemyAttackResult = {
  damage: number;
  killed: boolean;
};

export function distanceXZ(a: VecXZ, b: VecXZ): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function directionXZ(from: VecXZ, to: VecXZ): VecXZ {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist === 0) {
    return { x: 0, z: 0 };
  }

  return { x: dx / dist, z: dz / dist };
}

export function rotationYForDirection(direction: VecXZ): number {
  return Math.atan2(direction.x, direction.z);
}

export function findAggroTargetId(
  enemy: Enemy,
  players: Record<string, PlayerState>,
  candidateIds: string[],
): string | null {
  for (const playerId of candidateIds) {
    const player = players[playerId];
    if (!player?.isAlive) {
      continue;
    }

    if (distanceXZ(enemy.position, player.position) <= enemy.aggroRadius) {
      return playerId;
    }
  }

  return null;
}

export function moveEnemyToward(
  enemy: Enemy,
  targetPosition: VecXZ,
  spatialGrid: SpatialHashGrid,
  deltaTime: number,
): void {
  const oldPos = { x: enemy.position.x, z: enemy.position.z };
  const direction = directionXZ(enemy.position, targetPosition);

  enemy.velocity = {
    x: direction.x * enemy.movementSpeed,
    z: direction.z * enemy.movementSpeed,
  };
  enemy.position.x += enemy.velocity.x * deltaTime;
  enemy.position.z += enemy.velocity.z * deltaTime;
  enemy.rotation.y = rotationYForDirection(direction);

  spatialGrid.move(enemy.id, oldPos, enemy.position);
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

function markEnemyDirty(enemy: Enemy): void {
  (enemy as Enemy & { dirtySnap?: boolean }).dirtySnap = true;
}
