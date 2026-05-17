import { distanceSqXZ } from '../../../packages/sim/geometry';
import type { EnemyEntity, GroundLootStack, PlayerEntity, Vec3 } from './gameTypes';

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

/**
 * Pick the next alive enemy by ascending distance, skipping the
 * currently-selected one. When `currentTargetId` is null this returns
 * the nearest enemy (same as getNearestAliveEnemyId). When nothing
 * better exists, returns the nearest enemy (so repeated Tab on a lone
 * mob re-selects it instead of clearing the target).
 */
export function getNextTabTargetId(
  enemies: Record<string, EnemyEntity>,
  origin: Vec3,
  currentTargetId: string | null,
): string | null {
  const ranked: Array<{ id: string; distance: number }> = [];
  for (const enemy of Object.values(enemies)) {
    if (!enemy.isAlive) continue;
    ranked.push({ id: enemy.id, distance: distanceSqXZ(origin, enemy.position) });
  }
  if (ranked.length === 0) return null;
  ranked.sort((a, b) => a.distance - b.distance);

  if (!currentTargetId) {
    return ranked[0].id;
  }

  const currentIndex = ranked.findIndex((entry) => entry.id === currentTargetId);
  if (currentIndex === -1) {
    return ranked[0].id;
  }
  // Cycle to the next entry; wrap around at the end so Tab on the
  // farthest mob comes back to the nearest one.
  const nextIndex = (currentIndex + 1) % ranked.length;
  return ranked[nextIndex].id;
}

export function getNearestGroundLootId(
  loot: Record<string, GroundLootStack>,
  origin: Vec3,
): string | null {
  let bestId: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const stack of Object.values(loot)) {
    const distance = distanceSqXZ(origin, stack.position);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = stack.id;
    }
  }
  return bestId;
}
