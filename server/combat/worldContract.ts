import type { VecXZ } from '../../packages/protocol/messages.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';

export interface CombatWorld {
  getEnemyById: (id: string) => Enemy | null;
  getPlayerById: (id: string) => PlayerState | null;
  getEntitiesInCircle: (pos: VecXZ, radius: number) => Array<Enemy | PlayerState>;
  onTargetDied: (caster: PlayerState | Enemy, target: Enemy | PlayerState, now: number) => void;
  /** Spawn a mob (summon ability). Optional — bare worlds (unit tests) omit it. */
  spawnMinion?: (type: string, level: number, pos: { x: number; y: number; z: number }, now: number) => void;
}
