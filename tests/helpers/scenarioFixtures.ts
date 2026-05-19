import type { ItemId } from '../../packages/content/items';
import type { SkillId } from '../../packages/content/skills';
import type { ItemDrop, InventorySlot } from '../../packages/protocol/messages';
import type { Enemy, PlayerState } from '../../packages/sim/entities';
import { createEnemy } from '../../server/enemies/enemyLifecycle';
import { createGameState, type GameState } from '../../server/gameState';
import { buildStablePlayerPersistenceData } from '../../server/persistence';
import { hydratePersistedPlayer } from '../../server/players/playerSession';
import { createTransientPlayer } from '../../server/playerFactory';
import { addItemsToPlayer } from '../../server/inventory/aggregateBridge';
import { createEmptyInventory } from '../../packages/sim/characterInventory';
import { SpatialHashGrid } from '../../server/spatial/SpatialHashGrid';
import type { ServerWorldRegion } from '../../server/world/regions';

export const SCENARIO_REGION_A = 'scenario-region-a';
export const SCENARIO_REGION_B = 'scenario-region-b';

export function makeScenarioPlayer(options: {
  id: string;
  socketId: string;
  name?: string;
  x?: number;
  z?: number;
  inventory?: InventorySlot[];
  skills?: SkillId[];
}): PlayerState {
  const unlockedSkills = options.skills ?? ['fireball'];
  const player = createTransientPlayer(options.socketId, options.name ?? options.id);
  player.id = options.id;
  player.position = { x: options.x ?? 0, y: 0.5, z: options.z ?? 0 };
  // §45.7 — `characterInventory` is the source of truth; reset
  // both fields together so the fixture's `inventory` override
  // can't silently diverge from the aggregate. Then push each
  // requested item through the bridge so the two stay in lockstep.
  player.characterInventory = createEmptyInventory(player.id, player.characterInventory!.limits);
  player.inventory = [];
  for (const slot of options.inventory ?? []) {
    addItemsToPlayer(player, slot.itemId, slot.quantity);
  }
  player.unlockedSkills = [...unlockedSkills];
  player.skillShortcuts = [
    unlockedSkills[0] ?? null,
    unlockedSkills[1] ?? null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ];
  player.lastUpdateTime = 1;
  return player;
}

export function makeScenarioEnemy(options: {
  id: string;
  type?: string;
  level?: number;
  x?: number;
  z?: number;
  targetId?: string | null;
}): Enemy {
  const enemy = createEnemy(
    options.type ?? 'goblin',
    options.level ?? 1,
    { x: options.x ?? 4, y: 0.5, z: options.z ?? 0 },
    deterministicNumber(options.id),
  );
  enemy.id = options.id;
  enemy.targetId = options.targetId ?? null;
  return enemy;
}

export function createTwoPlayersInRegionsScenario(): {
  state: GameState;
  playerA: PlayerState;
  playerB: PlayerState;
  regions: ServerWorldRegion[];
} {
  const state = createGameState();
  const regions = makeScenarioRegions();
  const playerA = makeScenarioPlayer({ id: 'player-a', socketId: 'socket-a', x: 0, z: 0 });
  const playerB = makeScenarioPlayer({ id: 'player-b', socketId: 'socket-b', x: 300, z: 0 });

  state.players[playerA.id] = playerA;
  state.players[playerB.id] = playerB;
  state.zones.activeZoneIds = [SCENARIO_REGION_A, SCENARIO_REGION_B];
  state.zones.playerZoneIds = {
    [playerA.id]: SCENARIO_REGION_A,
    [playerB.id]: SCENARIO_REGION_B,
  };

  return { state, playerA, playerB, regions };
}

export function createCombatEncounterScenario(): {
  state: GameState;
  spatial: SpatialHashGrid;
  player: PlayerState;
  enemy: Enemy;
} {
  const state = createGameState();
  const spatial = new SpatialHashGrid();
  const player = makeScenarioPlayer({ id: 'combat-player', socketId: 'combat-socket' });
  const enemy = makeScenarioEnemy({ id: 'combat-enemy', x: 4, z: 0, targetId: player.id });

  state.players[player.id] = player;
  state.enemies[enemy.id] = enemy;
  state.zones.activeZoneIds = [SCENARIO_REGION_A];
  state.zones.playerZoneIds[player.id] = SCENARIO_REGION_A;
  state.zones.enemyZoneIds[enemy.id] = SCENARIO_REGION_A;
  spatial.insert(player.id, { x: player.position.x, z: player.position.z });
  spatial.insert(enemy.id, { x: enemy.position.x, z: enemy.position.z });

  return { state, spatial, player, enemy };
}

export function createLootPickupScenario(): {
  state: GameState;
  player: PlayerState;
  lootId: string;
  loot: ItemDrop[];
} {
  const state = createGameState();
  const player = makeScenarioPlayer({ id: 'loot-player', socketId: 'loot-socket' });
  const lootId = 'loot-stack-1';
  const loot = [{ itemId: 'gold_coin', quantity: 3 }] satisfies ItemDrop[];

  state.players[player.id] = player;
  state.groundLoot[lootId] = {
    position: { x: 1, z: 0 },
    items: loot,
  };

  return { state, player, lootId, loot };
}

export function createFullInventoryScenario(maxInventorySlots = 3): {
  state: GameState;
  player: PlayerState;
} {
  const inventory = Array.from({ length: maxInventorySlots }, (_, index) => ({
    itemId: itemIdForSlot(index),
    quantity: 1,
  }));
  const state = createGameState();
  const player = makeScenarioPlayer({
    id: 'full-inventory-player',
    socketId: 'full-inventory-socket',
    inventory,
  });
  player.maxInventorySlots = maxInventorySlots;
  state.players[player.id] = player;

  return { state, player };
}

export function createPersistedPlayerReconnectScenario(): {
  beforeRelog: PlayerState;
  afterRelog: PlayerState;
} {
  const beforeRelog = makeScenarioPlayer({
    id: 'persisted-player',
    socketId: 'old-socket',
    name: 'Persisted',
    x: 12,
    z: -4,
    inventory: [
      { itemId: 'health_potion', quantity: 2 },
      { itemId: 'gold_coin', quantity: 5 },
    ],
    skills: ['fireball', 'waterSplash'],
  });
  beforeRelog.health = 44;
  beforeRelog.level = 3;
  beforeRelog.experience = 80;

  const stable = buildStablePlayerPersistenceData(beforeRelog, 123);
  const afterRelog = hydratePersistedPlayer({
    id: beforeRelog.id,
    position_x: stable.position_x,
    position_y: stable.position_y,
    position_z: stable.position_z,
    health: stable.health,
    level: stable.level,
    experience: stable.experience,
    is_alive: stable.is_alive,
    class_name: stable.class_name,
    skills: stable.skills,
    skill_shortcuts: stable.skill_shortcuts,
    available_skill_points: stable.available_skill_points,
    starter_progress: stable.starter_progress,
    inventory: stable.inventory,
  }, 'new-socket', beforeRelog.name);

  return { beforeRelog, afterRelog };
}

export function createScopedRegionStreamingScenario(): {
  state: GameState;
  regions: ServerWorldRegion[];
  localPlayer: PlayerState;
  remotePlayer: PlayerState;
  localEnemy: Enemy;
  remoteEnemy: Enemy;
} {
  const { state, regions, playerA: localPlayer, playerB: remotePlayer } = createTwoPlayersInRegionsScenario();
  const localEnemy = makeScenarioEnemy({ id: 'local-enemy', x: 6, z: 0 });
  const remoteEnemy = makeScenarioEnemy({ id: 'remote-enemy', type: 'wolf', x: 306, z: 0 });

  state.enemies[localEnemy.id] = localEnemy;
  state.enemies[remoteEnemy.id] = remoteEnemy;
  state.groundLoot.local = {
    position: { x: 4, z: 0 },
    items: [{ itemId: 'gold_coin', quantity: 1 }],
  };
  state.groundLoot.remote = {
    position: { x: 304, z: 0 },
    items: [{ itemId: 'gold_coin', quantity: 1 }],
  };
  state.zones.enemyZoneIds = {
    [localEnemy.id]: SCENARIO_REGION_A,
    [remoteEnemy.id]: SCENARIO_REGION_B,
  };

  return { state, regions, localPlayer, remotePlayer, localEnemy, remoteEnemy };
}

export function makeScenarioRegions(): ServerWorldRegion[] {
  return [
    makeScenarioRegion(SCENARIO_REGION_A, 0),
    makeScenarioRegion(SCENARIO_REGION_B, 300),
  ];
}

function makeScenarioRegion(id: string, x: number): ServerWorldRegion {
  return {
    id,
    zoneId: id,
    name: id,
    center: { x, y: 0, z: 0 },
    radius: 50,
    active: true,
    maxEnemies: 4,
  };
}

function itemIdForSlot(index: number): ItemId {
  return index % 2 === 0 ? 'worn_sword' : 'sprite_glow';
}

function deterministicNumber(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}
