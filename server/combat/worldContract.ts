import type { VecXZ } from '../../packages/protocol/messages.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import type { AreaPhysicsField } from '../physics/areaPhysics.js';

export type SummonSpawnOptions = {
  namePrefix?: string;
  healthMultiplier?: number;
  damageMultiplier?: number;
  experienceMultiplier?: number;
  lootTableIdOverride?: string;
};

export interface CombatWorld {
  getEnemyById: (id: string) => Enemy | null;
  getPlayerById: (id: string) => PlayerState | null;
  getEntitiesInCircle: (pos: VecXZ, radius: number) => Array<Enemy | PlayerState>;
  onTargetDied: (caster: PlayerState | Enemy, target: Enemy | PlayerState, now: number) => void;
  /** Keep the spatial index in sync when an ability relocates an entity outside movement. */
  moveEntity?: (id: string, oldPos: VecXZ, newPos: VecXZ) => void;
  /** Spawn a mob (summon ability). Optional — bare worlds (unit tests) omit it. */
  spawnMinion?: (type: string, level: number, pos: { x: number; y: number; z: number }, now: number, options?: SummonSpawnOptions) => void;
  /** Area physics fields (time stop / future stasis volumes). Optional for bare test worlds. */
  addPhysicsField?: (field: AreaPhysicsField) => void;
  getActivePhysicsFields?: () => AreaPhysicsField[];
}
