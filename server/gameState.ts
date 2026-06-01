import type { ItemDrop, VecXZ } from '../packages/protocol/messages.js';
import type {
  AuthoritativeEntityState,
  AuthoritativeGroundLootStack,
  AuthoritativeProjectileState,
  AuthoritativeWorldState,
} from '../packages/sim/authoritativeState.js';
import type { Enemy, PlayerState } from '../packages/sim/entities.js';
import type { Cast } from './combat/skillSystem.js';
import type { AreaPhysicsField } from './physics/areaPhysics.js';

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
> & {
  activePhysicsFields: Record<string, AreaPhysicsField>;
};

export function createGameState(): GameState {
  return {
    players: {},
    enemies: {},
    activeCasts: {},
    effectsByTarget: {},
    projectiles: [],
    activePhysicsFields: {},
    lastProjectileId: 0,
    groundLoot: {},
    zones: {
      activeZoneIds: [],
      playerZoneIds: {},
      enemyZoneIds: {},
      spawnedZoneIds: [],
    },
  };
}

export type EntityState = AuthoritativeEntityState<GameState>;
