import type { ItemDrop, VecXZ } from '../packages/protocol/messages.js';
import type {
  AuthoritativeEntityState,
  AuthoritativeGroundLootStack,
  AuthoritativeProjectileState,
  AuthoritativeWorldState,
} from '../packages/sim/authoritativeState.js';
import type { Enemy, PlayerState } from '../shared/types.js';
import type { Cast } from './combat/skillSystem.js';

export type GroundLootStack = AuthoritativeGroundLootStack<ItemDrop> & {
  position: VecXZ;
};

export type GameState = AuthoritativeWorldState<
  PlayerState,
  Enemy,
  AuthoritativeProjectileState,
  Cast,
  PlayerState['statusEffects'][number],
  GroundLootStack
>;

export function createGameState(): GameState {
  return {
    players: {},
    enemies: {},
    activeCasts: {},
    effectsByTarget: {},
    projectiles: [],
    lastProjectileId: 0,
    groundLoot: {},
    zones: {
      activeZoneIds: [],
      playerZoneIds: {},
      enemyZoneIds: {},
    },
  };
}

export type EntityState = AuthoritativeEntityState<GameState>;
