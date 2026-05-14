import type { EnemyEntity, PlayerEntity, Vec3 } from './gameTypes';
import { distanceSqXZ } from './vec3';

export function getPlayerPosition(player: PlayerEntity | null): Vec3 {
  return player?.position ?? { x: 0, y: 0.5, z: 0 };
}

export function getNearestAliveEnemyId(
  enemies: Record<string, EnemyEntity>,
  origin: Vec3,
): string | null {
  let bestId: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const enemy of Object.values(enemies)) {
    if (!enemy.isAlive) {
      continue;
    }

    const distance = distanceSqXZ(origin, enemy.position);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = enemy.id;
    }
  }

  return bestId;
}
