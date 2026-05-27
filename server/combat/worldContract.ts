import type { VecXZ } from '../../packages/protocol/messages.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';

export interface CombatWorld {
  getEnemyById: (id: string) => Enemy | null;
  getPlayerById: (id: string) => PlayerState | null;
  getEntitiesInCircle: (pos: VecXZ, radius: number) => Array<Enemy | PlayerState>;
  onTargetDied: (caster: PlayerState | Enemy, target: Enemy | PlayerState, now: number) => void;
}
