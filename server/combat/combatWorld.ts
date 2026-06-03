import type { VecXZ } from '../../packages/protocol/messages.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import type { GameState } from '../gameState.js';
import type { CombatWorld } from './worldContract.js';

export type TargetDeathHandler = (caster: PlayerState | Enemy, target: Enemy | PlayerState, now: number) => void;

export function createCombatWorld(
  state: GameState,
  onTargetDied: TargetDeathHandler,
  getEntitiesInCircleImpl?: (pos: VecXZ, radius: number) => Array<Enemy | PlayerState>,
  spawnMinion?: CombatWorld['spawnMinion'],
  moveEntity?: CombatWorld['moveEntity'],
): CombatWorld {
  return {
    getEnemyById: (id: string) => state.enemies[id] || null,
    getPlayerById: (id: string) => state.players[id] || null,
    getEntitiesInCircle: getEntitiesInCircleImpl ?? ((pos: VecXZ, radius: number) => getEntitiesInCircle(state, pos, radius)),
    onTargetDied,
    moveEntity,
    spawnMinion,
    addPhysicsField: (field) => {
      state.activePhysicsFields[field.id] = field;
    },
    getActivePhysicsFields: () => Object.values(state.activePhysicsFields),
  };
}

function getEntitiesInCircle(state: GameState, pos: VecXZ, radius: number): Array<Enemy | PlayerState> {
  const result: Array<Enemy | PlayerState> = [];

  for (const enemy of Object.values(state.enemies)) {
    if (enemy.isAlive && isWithinRadius(enemy.position, pos, radius)) {
      result.push(enemy);
    }
  }

  for (const player of Object.values(state.players)) {
    if (player.isAlive && isWithinRadius(player.position, pos, radius)) {
      result.push(player);
    }
  }

  return result;
}

function isWithinRadius(
  position: { x: number; z: number },
  origin: VecXZ,
  radius: number,
): boolean {
  const dx = position.x - origin.x;
  const dz = position.z - origin.z;
  return dx * dx + dz * dz <= radius * radius;
}
