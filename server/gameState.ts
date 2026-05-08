import type { ItemDrop, VecXZ } from '../packages/protocol/messages.js';
import type { Enemy, PlayerState } from '../shared/types.js';
import type { Projectile } from './types.js';

export interface GroundLootStack {
  position: VecXZ;
  items: ItemDrop[];
}

export interface GameState {
  players: Record<string, PlayerState>;
  enemies: Record<string, Enemy>;
  projectiles: Projectile[];
  lastProjectileId: number;
  groundLoot: Record<string, GroundLootStack>;
}

export type EntityState = Pick<GameState, 'players' | 'enemies'>;
