import {
  type InventorySlot,
  type ServerMessage,
} from '../../../packages/protocol/messages';
import type {
  EnemyEntity,
  GameClientState,
  GroundLootStack,
  PlayerEntity,
  Vec3,
  WorldPublicState,
} from './gameTypes';
import type { ServerGameState } from './gameTypes';
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
  applyBossTelegraphFeedback,
  applyEnemyDeathFeedback,
  applyEquipFailedVisualState,
  applyEquipmentChangeFeedback,
  applyInstantHitVisualState,
  applyItemUsedVisualState,
  applyLootAcquiredVisualState,
  applyOtherPlayerLootPickupVisualState,
  applyPlayerDeathFeedback,
  pruneClientVisualState,
} from './clientVisualState';
import { applyGameStateSnapshot } from './clientGameStateSnapshot';
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
  nextVisualEventSeq: 0,
  inventory: [],
  maxInventorySlots: 20,
  equipment: {},
  learnSkillRejections: {},
  combatLog: [],
  chatLines: [],
  starterProgress: createInitialStarterProgress(),
  worldPublicState: null,
  streamedRegionIds: [],
  pendingCast: null,
  pendingPickup: null,
  autoAttack: null,
  bossTelegraphs: [],
  trackedQuestId: null,
};

export type GameClientAction =
  | { type: 'startConnecting' }
  | { type: 'connected' }
  | { type: 'joined'; playerId: string }
  | { type: 'connectionRejected'; message: string }
  | { type: 'disconnected'; message: string }
  | { type: 'gameState'; state: ServerGameState }
  | { type: 'worldPublicState'; state: WorldPublicState }
  | { type: 'playerJoined'; player: PlayerEntity }
  | { type: 'playerLeft'; playerId: string }
  | { type: 'playerUpdated'; player: Partial<PlayerEntity> & { id: string }; now: number }
  | { type: 'enemyUpdated'; enemy: Partial<EnemyEntity> & { id: string }; now: number }
  | { type: 'selectTarget'; targetId: string | null }
  | { type: 'setMoveTarget'; target: Vec3 | null }
  | { type: 'serverMessage'; message: ServerMessage; now: number }
  | { type: 'pruneCasts'; now: number }
  | { type: 'setPendingCast'; pendingCast: GameClientState['pendingCast'] }
  | { type: 'clearPendingCast' }
  | { type: 'setPendingPickup'; pendingPickup: GameClientState['pendingPickup'] }
  | { type: 'clearPendingPickup' }
  | { type: 'setAutoAttack'; autoAttack: GameClientState['autoAttack'] }
  | { type: 'clearAutoAttack' }
  | { type: 'setTrackedQuest'; questId: string | null };

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
      return applyGameStateSnapshot(state, action.state);
    case 'worldPublicState':
      return { ...state, worldPublicState: action.state };
    case 'playerJoined':
      return { ...state, players: { ...state.players, [action.player.id]: action.player } };
    case 'playerLeft':
      return removePlayer(state, action.playerId);
    case 'playerUpdated':
      return updatePlayer(state, action.player, action.now);
    case 'enemyUpdated':
      return updateEnemy(state, action.enemy, action.now);
    case 'selectTarget':
      return selectTarget(state, action.targetId);
    case 'setMoveTarget':
      return { ...state, targetWorldPos: action.target };
    case 'serverMessage':
      return applyServerMessage(state, action.message, action.now);
    case 'pruneCasts':
      return pruneClientVisualState(state, action.now);
    case 'setPendingCast':
      return { ...state, pendingCast: action.pendingCast };
    case 'clearPendingCast':
      return state.pendingCast ? { ...state, pendingCast: null } : state;
    case 'setPendingPickup':
      return { ...state, pendingPickup: action.pendingPickup };
    case 'clearPendingPickup':
      return state.pendingPickup ? { ...state, pendingPickup: null } : state;
    case 'setAutoAttack':
      return { ...state, autoAttack: action.autoAttack };
    case 'clearAutoAttack':
      return state.autoAttack ? { ...state, autoAttack: null } : state;
    case 'setTrackedQuest':
      return state.trackedQuestId === action.questId ? state : { ...state, trackedQuestId: action.questId };
  }
}

function removePlayer(state: GameClientState, playerId: string): GameClientState {
  const players = { ...state.players };
  delete players[playerId];
  return { ...state, players };
}

function updatePlayer(
  state: GameClientState,
  update: Partial<PlayerEntity> & { id: string },
  now: number,
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
  const withDeathLog = applyPlayerDeathFeedback(state, update.id, current.name, current.isAlive, player.isAlive, now);

  return {
    ...withDeathLog,
    players: { ...withDeathLog.players, [update.id]: player },
    inventory,
    starterProgress,
  };
}

function updateEnemy(
  state: GameClientState,
  update: Partial<EnemyEntity> & { id: string },
  now: number,
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
  const withDeathLog = applyEnemyDeathFeedback(state, update.id, current.name, current.isAlive, enemy.isAlive, now);

  return { ...withDeathLog, enemies: { ...withDeathLog.enemies, [update.id]: enemy }, selectedTargetId };
}

function selectTarget(state: GameClientState, targetId: string | null): GameClientState {
  if (!targetId) {
    return { ...state, selectedTargetId: null };
  }
  // Self-target: clicking the hero plate selects the player as their own
  // target. Used by buffs / heals — the cast pipeline detects this case
  // and routes to the existing beneficial-only self-cast path.
  if (targetId === state.myPlayerId) {
    return { ...state, selectedTargetId: targetId };
  }
  if (state.enemies[targetId]?.isAlive) {
    return { ...state, selectedTargetId: targetId };
  }
  // PvP: another player is a valid target.
  if (state.players[targetId]?.isAlive) {
    return { ...state, selectedTargetId: targetId };
  }
  return { ...state, selectedTargetId: null };
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
    return applyPositionSnapshot(state, message, now);
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

  if (message.type === 'BossTelegraph') {
    return applyBossTelegraph(state, message, now);
  }

  if (message.type === 'InventoryUpdate') {
    return applyInventoryUpdate(state, message.inventory, message.maxInventorySlots, message.playerId);
  }

  if (message.type === 'EquipmentUpdate') return applyEquipmentChangeFeedback(applyEquipmentUpdate(state, message), message, now);
  if (message.type === 'EquipFailed') return applyEquipFailedVisualState(state, message, now);
  if (message.type === 'LearnSkillFailed') {
    return { ...state, learnSkillRejections: { ...state.learnSkillRejections, [message.skillId]: message.reason } };
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
    return applyEffectSnapshot(state, message.targetId, message.effects, now);
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

  if (message.type === 'ChatBroadcast') {
    return appendChatLine(state, message);
  }

  return state;
}

const CHAT_RING_BUFFER = 50;

function appendChatLine(
  state: GameClientState,
  message: ServerMessage & { type: 'ChatBroadcast' },
): GameClientState {
  const newLine = {
    id: `chat-${message.fromId}-${message.ts}-${state.chatLines.length}`,
    fromId: message.fromId,
    fromName: message.fromName,
    text: message.text,
    scope: message.scope,
    ts: message.ts,
  };
  const sameScope = state.chatLines.filter((line) => line.scope === message.scope);
  const otherScope = state.chatLines.filter((line) => line.scope !== message.scope);
  const trimmedSameScope = [...sameScope, newLine].slice(-CHAT_RING_BUFFER);
  return { ...state, chatLines: [...otherScope, ...trimmedSameScope] };
}

function applyEquipmentUpdate(
  state: GameClientState,
  message: ServerMessage & { type: 'EquipmentUpdate' },
): GameClientState {
  const equipment: Record<string, string> = {};
  for (const entry of message.equipment) {
    equipment[entry.slot] = entry.itemId;
  }
  return { ...state, equipment };
}

function applyBossTelegraph(
  state: GameClientState,
  message: ServerMessage & { type: 'BossTelegraph' },
  now: number,
): GameClientState {
  const entry = {
    enemyId: message.enemyId,
    bossName: message.bossName,
    abilityName: message.abilityName,
    x: message.x,
    z: message.z,
    radius: message.radius,
    startedAt: now,
    impactAt: message.impactAt,
  };
  // Replace any prior telegraph from the same enemy — a boss only
  // ever has one channel in flight at a time.
  const next = state.bossTelegraphs.filter((t) => t.enemyId !== message.enemyId);
  next.push(entry);
  // §49/M2 — also surface the ability start in the combat log so the
  // player gets a text confirmation alongside the ground-ring VFX.
  return applyBossTelegraphFeedback({ ...state, bossTelegraphs: next }, message, now);
}

function applySkillLearned(
  state: GameClientState,
  message: ServerMessage & { type: 'SkillLearned' },
): GameClientState {
  // Clear any previous LearnSkillFailed rejection for this skill so the panel
  // chip disappears once the learn finally succeeds.
  const { [message.skillId]: removed, ...remainingRejections } = state.learnSkillRejections;
  const rejections = removed ? remainingRejections : state.learnSkillRejections;
  const next = updateMyPlayer(state, (player) => ({
    ...player,
    availableSkillPoints: message.remainingPoints,
    unlockedSkills: player.unlockedSkills.includes(message.skillId)
      ? player.unlockedSkills
      : [...player.unlockedSkills, message.skillId],
    skillShortcuts: player.skillShortcuts.includes(message.skillId)
      ? player.skillShortcuts
      : assignFirstEmptyShortcut(player.skillShortcuts, message.skillId),
  }));
  return rejections === state.learnSkillRejections ? next : { ...next, learnSkillRejections: rejections };
}

function applyPositionSnapshot(state: GameClientState, message: ServerMessage & { type: 'PosSnap' }, now: number) {
  const asPosition = { x: message.pos.x, z: message.pos.z };
  if (state.players[message.id]) {
    return updatePlayer(state, {
      id: message.id,
      position: { ...state.players[message.id].position, ...asPosition },
      rotation: { ...state.players[message.id].rotation, y: message.rotY ?? 0 },
      velocity: message.vel,
    }, now);
  }

  if (state.enemies[message.id]) {
    return updateEnemy(state, {
      id: message.id,
      position: { ...state.enemies[message.id].position, ...asPosition },
      rotation: { ...state.enemies[message.id].rotation, y: message.rotY ?? 0 },
      velocity: message.vel,
    }, now);
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
  now: number,
): GameClientState {
  if (state.players[targetId]) {
    return updatePlayer(state, { id: targetId, statusEffects }, now);
  }

  if (state.enemies[targetId]) {
    return updateEnemy(state, { id: targetId, statusEffects }, now);
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

function clearDeadTarget(state: GameClientState, enemyId: string): string | null {
  return state.selectedTargetId === enemyId ? null : state.selectedTargetId;
}
