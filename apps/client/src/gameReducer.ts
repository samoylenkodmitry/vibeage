import {
  type InventorySlot,
  type ServerMessage,
} from '../../../packages/protocol/messages';
import type {
  EnemyEntity,
  GameClientState,
  GroundLootStack,
  PlayerEntity,
  ServerGameState,
  Vec3,
} from './gameTypes';
import {
  assignFirstEmptyShortcut,
  createInitialStarterProgress,
  normalizeClientStarterProgress,
} from './starterProgress';
import {
  applyCastFailVisualState,
  applyCastSnapshotVisualState,
  applyCombatLogVisualState,
  applyEnemyAttackVisualState,
  applyInstantHitVisualState,
  applyItemUsedVisualState,
  applyLootAcquiredVisualState,
  applyOtherPlayerLootPickupVisualState,
  pruneClientVisualState,
} from './clientVisualState';
import { mergeVec3, normalizeVec3 } from './vec3';

export const initialGameClientState: GameClientState = {
  connectionState: 'idle',
  message: 'Ready',
  myPlayerId: null,
  players: {},
  enemies: {},
  groundLoot: {},
  selectedTargetId: null,
  targetWorldPos: null,
  casts: {},
  visualEvents: {},
  inventory: [],
  maxInventorySlots: 20,
  combatLog: [],
  starterProgress: createInitialStarterProgress(),
};

export type GameClientAction =
  | { type: 'startConnecting' }
  | { type: 'connected' }
  | { type: 'joined'; playerId: string }
  | { type: 'connectionRejected'; message: string }
  | { type: 'disconnected'; message: string }
  | { type: 'gameState'; state: ServerGameState }
  | { type: 'playerJoined'; player: PlayerEntity }
  | { type: 'playerLeft'; playerId: string }
  | { type: 'playerUpdated'; player: Partial<PlayerEntity> & { id: string } }
  | { type: 'enemyUpdated'; enemy: Partial<EnemyEntity> & { id: string } }
  | { type: 'selectTarget'; targetId: string | null }
  | { type: 'setMoveTarget'; target: Vec3 | null }
  | { type: 'serverMessage'; message: ServerMessage; now: number }
  | { type: 'pruneCasts'; now: number };

export function gameClientReducer(
  state: GameClientState,
  action: GameClientAction,
): GameClientState {
  switch (action.type) {
    case 'startConnecting':
      return { ...initialGameClientState, connectionState: 'connecting', message: 'Connecting' };
    case 'connected':
      return { ...state, connectionState: 'joining', message: 'Joining world' };
    case 'joined':
      return { ...state, connectionState: 'online', message: 'Online', myPlayerId: action.playerId };
    case 'connectionRejected':
      return { ...state, connectionState: 'rejected', message: action.message };
    case 'disconnected':
      return { ...state, connectionState: 'offline', message: action.message };
    case 'gameState':
      return applyGameState(state, action.state);
    case 'playerJoined':
      return { ...state, players: { ...state.players, [action.player.id]: action.player } };
    case 'playerLeft':
      return removePlayer(state, action.playerId);
    case 'playerUpdated':
      return updatePlayer(state, action.player);
    case 'enemyUpdated':
      return updateEnemy(state, action.enemy);
    case 'selectTarget':
      return selectTarget(state, action.targetId);
    case 'setMoveTarget':
      return { ...state, targetWorldPos: action.target };
    case 'serverMessage':
      return applyServerMessage(state, action.message, action.now);
    case 'pruneCasts':
      return pruneClientVisualState(state, action.now);
  }
}

function applyGameState(state: GameClientState, serverState: ServerGameState): GameClientState {
  const players = serverState.players ?? {};
  const enemies = serverState.enemies ?? {};
  const selectedTargetId = enemies[state.selectedTargetId ?? ''] ? state.selectedTargetId : null;
  const inventory = state.myPlayerId ? players[state.myPlayerId]?.inventory ?? state.inventory : state.inventory;
  const maxInventorySlots = state.myPlayerId
    ? players[state.myPlayerId]?.maxInventorySlots ?? state.maxInventorySlots
    : state.maxInventorySlots;
  const groundLoot = normalizeGroundLoot(serverState.groundLoot ?? state.groundLoot);
  const myPlayer = state.myPlayerId ? players[state.myPlayerId] : null;
  const starterProgress = myPlayer
    ? normalizeClientStarterProgress(myPlayer.starterProgress ?? state.starterProgress, myPlayer)
    : state.starterProgress;

  return { ...state, players, enemies, groundLoot, selectedTargetId, inventory, maxInventorySlots, starterProgress };
}

function removePlayer(state: GameClientState, playerId: string): GameClientState {
  const players = { ...state.players };
  delete players[playerId];
  return { ...state, players };
}

function updatePlayer(
  state: GameClientState,
  update: Partial<PlayerEntity> & { id: string },
): GameClientState {
  const current = state.players[update.id];
  if (!current) {
    return state;
  }

  const player = {
    ...current,
    ...update,
    position: mergeVec3(current.position, update.position),
    rotation: mergeVec3(current.rotation, update.rotation),
  };
  const inventory = state.myPlayerId === update.id && update.inventory ? update.inventory : state.inventory;
  const starterProgress = update.id === state.myPlayerId
    ? normalizeClientStarterProgress(player.starterProgress ?? state.starterProgress, player)
    : state.starterProgress;

  return {
    ...state,
    players: { ...state.players, [update.id]: player },
    inventory,
    starterProgress,
  };
}

function updateEnemy(
  state: GameClientState,
  update: Partial<EnemyEntity> & { id: string },
): GameClientState {
  const current = state.enemies[update.id];
  if (!current) {
    return state;
  }

  const enemy = {
    ...current,
    ...update,
    position: mergeVec3(current.position, update.position),
    rotation: mergeVec3(current.rotation, update.rotation),
  };
  const selectedTargetId = enemy.isAlive ? state.selectedTargetId : clearDeadTarget(state, update.id);

  return { ...state, enemies: { ...state.enemies, [update.id]: enemy }, selectedTargetId };
}

function selectTarget(state: GameClientState, targetId: string | null): GameClientState {
  const selectedTargetId = targetId && state.enemies[targetId]?.isAlive ? targetId : null;
  return { ...state, selectedTargetId };
}

function applyServerMessage(
  state: GameClientState,
  message: ServerMessage,
  now: number,
): GameClientState {
  if (message.type === 'BatchUpdate') {
    return message.updates.reduce(
      (nextState, update) => applyServerMessage(nextState, update, now),
      state,
    );
  }

  if (message.type === 'PosSnap') {
    return applyPositionSnapshot(state, message);
  }

  if (message.type === 'CastSnapshot') {
    return applyCastSnapshotVisualState(state, message.data, now);
  }

  if (message.type === 'InstantHit') {
    return applyInstantHitVisualState(state, message, now);
  }

  if (message.type === 'CombatLog') {
    return applyCombatLogVisualState(state, message, now);
  }

  if (message.type === 'CastFail') {
    return applyCastFailVisualState(state, message, now);
  }

  if (message.type === 'EnemyAttack') {
    return applyEnemyAttackVisualState(state, message, now);
  }

  if (message.type === 'InventoryUpdate') {
    return applyInventoryUpdate(state, message.inventory, message.maxInventorySlots, message.playerId);
  }

  if (message.type === 'LootSpawn') {
    return addGroundLoot(state, {
      id: message.lootId ?? `loot-${message.enemyId}`,
      position: normalizeVec3(message.position),
      items: message.loot,
    });
  }

  if (message.type === 'LootPickup') {
    return removeGroundLoot(state, message.lootId, message.playerId, now);
  }

  if (message.type === 'LootAcquired') {
    return applyLootAcquiredVisualState(state, message, now);
  }

  if (message.type === 'StarterProgressUpdate') {
    return { ...state, starterProgress: normalizeClientStarterProgress(message.progress) };
  }

  if (message.type === 'ItemUsed') {
    return applyItemUsedVisualState(state, message, now);
  }

  if (message.type === 'EffectSnapshot' && 'targetId' in message) {
    return applyEffectSnapshot(state, message.targetId, message.effects);
  }

  if (message.type === 'SkillShortcutUpdated') {
    return updateMyPlayer(state, (player) => ({
      ...player,
      skillShortcuts: replaceAt(player.skillShortcuts ?? [], message.slotIndex, message.skillId),
    }));
  }

  if (message.type === 'SkillLearned') {
    return applySkillLearned(state, message);
  }

  return state;
}

function applySkillLearned(
  state: GameClientState,
  message: ServerMessage & { type: 'SkillLearned' },
): GameClientState {
  return updateMyPlayer(state, (player) => ({
    ...player,
    availableSkillPoints: message.remainingPoints,
    unlockedSkills: player.unlockedSkills.includes(message.skillId)
      ? player.unlockedSkills
      : [...player.unlockedSkills, message.skillId],
    skillShortcuts: player.skillShortcuts.includes(message.skillId)
      ? player.skillShortcuts
      : assignFirstEmptyShortcut(player.skillShortcuts, message.skillId),
  }));
}

function applyPositionSnapshot(state: GameClientState, message: ServerMessage & { type: 'PosSnap' }) {
  const asPosition = { x: message.pos.x, z: message.pos.z };
  if (state.players[message.id]) {
    return updatePlayer(state, {
      id: message.id,
      position: { ...state.players[message.id].position, ...asPosition },
      rotation: { ...state.players[message.id].rotation, y: message.rotY ?? 0 },
      velocity: message.vel,
    });
  }

  if (state.enemies[message.id]) {
    return updateEnemy(state, {
      id: message.id,
      position: { ...state.enemies[message.id].position, ...asPosition },
      rotation: { ...state.enemies[message.id].rotation, y: message.rotY ?? 0 },
      velocity: message.vel,
    });
  }

  return state;
}

function addGroundLoot(state: GameClientState, loot: GroundLootStack): GameClientState {
  return {
    ...state,
    groundLoot: {
      ...state.groundLoot,
      [loot.id]: loot,
    },
  };
}

function removeGroundLoot(
  state: GameClientState,
  lootId: string,
  playerId: string,
  now: number,
): GameClientState {
  if (!state.groundLoot[lootId]) {
    return state;
  }

  const groundLoot = { ...state.groundLoot };
  delete groundLoot[lootId];

  if (playerId === state.myPlayerId) {
    return { ...state, groundLoot };
  }

  const playerName = state.players[playerId]?.name ?? 'Another player';
  return applyOtherPlayerLootPickupVisualState({ ...state, groundLoot }, lootId, playerName, now);
}

function applyInventoryUpdate(
  state: GameClientState,
  inventory: InventorySlot[],
  maxInventorySlots: number,
  playerId: string | undefined,
): GameClientState {
  const isLocalInventory = !playerId || playerId === state.myPlayerId;
  let nextState = isLocalInventory ? { ...state, inventory, maxInventorySlots } : state;

  if (!playerId || !state.players[playerId]) {
    return nextState;
  }

  nextState = {
    ...nextState,
    players: {
      ...nextState.players,
      [playerId]: {
        ...nextState.players[playerId],
        inventory,
        maxInventorySlots,
      },
    },
  };

  return nextState;
}

function applyEffectSnapshot(
  state: GameClientState,
  targetId: string,
  statusEffects: PlayerEntity['statusEffects'],
): GameClientState {
  if (state.players[targetId]) {
    return updatePlayer(state, { id: targetId, statusEffects });
  }

  if (state.enemies[targetId]) {
    return updateEnemy(state, { id: targetId, statusEffects });
  }

  return state;
}

function updateMyPlayer(
  state: GameClientState,
  update: (player: PlayerEntity) => PlayerEntity,
): GameClientState {
  if (!state.myPlayerId || !state.players[state.myPlayerId]) {
    return state;
  }

  const player = update(state.players[state.myPlayerId]);
  return {
    ...state,
    players: { ...state.players, [player.id]: player },
    starterProgress: normalizeClientStarterProgress(player.starterProgress ?? state.starterProgress, player),
  };
}

function replaceAt<T>(items: T[], index: number, item: T): T[] {
  const nextItems = [...items];
  nextItems[index] = item;
  return nextItems;
}

function normalizeGroundLoot(
  groundLoot: ServerGameState['groundLoot'] | Record<string, GroundLootStack>,
): Record<string, GroundLootStack> {
  return Object.fromEntries(
    Object.entries(groundLoot ?? {}).map(([id, loot]) => [
      id,
      {
        id,
        position: normalizeVec3(loot.position),
        items: loot.items,
      },
    ]),
  );
}

function clearDeadTarget(state: GameClientState, enemyId: string): string | null {
  return state.selectedTargetId === enemyId ? null : state.selectedTargetId;
}
