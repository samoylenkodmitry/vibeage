import type { SkillId } from '../../../packages/content/skills';
import { ITEMS } from '../../../packages/content/items';
import {
  CastState,
  type CastSnapshot,
  type InventorySlot,
  type ItemDrop,
  type ServerMessage,
} from '../../../packages/protocol/messages';
import type {
  CombatLine,
  EnemyEntity,
  GameClientState,
  GroundLootStack,
  PlayerEntity,
  ServerGameState,
  Vec3,
  VisualEvent,
} from './gameTypes';
import { addCombatDamageVisualEvents } from './combatFeedback';
import {
  assignFirstEmptyShortcut,
  createInitialStarterProgress,
  normalizeClientStarterProgress,
} from './starterProgress';

const CAST_VISIBLE_MS = 3_000;
const VISUAL_EVENT_VISIBLE_MS = 1_800;
const MAX_COMBAT_LINES = 5;

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
      return {
        ...state,
        casts: pruneCasts(state.casts, action.now),
        visualEvents: pruneVisualEvents(state.visualEvents, action.now),
      };
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
    return applyCastSnapshot(state, message.data, now);
  }

  if (message.type === 'InstantHit') {
    return applyInstantHit(state, message, now);
  }

  if (message.type === 'CombatLog') {
    return applyCombatLog(state, message, now);
  }

  if (message.type === 'CastFail') {
    return addCombatLine(
      { ...state, message: `Cast failed: ${message.reason}` },
      { id: makeCombatLineId(`fail-${message.clientSeq}`, state.combatLog.length, now), text: `Cast failed: ${message.reason}` },
    );
  }

  if (message.type === 'EnemyAttack') {
    return addCombatLine(state, {
      id: makeCombatLineId(`${message.enemyId}-${message.targetId}`, state.combatLog.length, now),
      text: formatEnemyAttackLine(state, message.enemyId, message.targetId, message.damage),
    });
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
    return applyLootAcquired(state, message, now);
  }

  if (message.type === 'StarterProgressUpdate') {
    return { ...state, starterProgress: normalizeClientStarterProgress(message.progress) };
  }

  if (message.type === 'ItemUsed') {
    return applyItemUsed(state, message, now);
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

function applyCombatLog(
  state: GameClientState,
  message: ServerMessage & { type: 'CombatLog' },
  now: number,
): GameClientState {
  const withDamageFeedback = addCombatDamageVisualEvents(state, message, now);

  return addCombatLine(withDamageFeedback, {
    id: makeCombatLineId(message.castId, state.combatLog.length, now),
    text: formatCombatLogLine(state, message.skillId, message.targets, message.damages),
  });
}

function applyLootAcquired(
  state: GameClientState,
  message: ServerMessage & { type: 'LootAcquired' },
  now: number,
): GameClientState {
  return addCombatLine(state, {
    id: makeCombatLineId(`loot-${now}`, state.combatLog.length, now),
    text: `Picked up ${formatItemDrops(message.items)}`,
  });
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

function addCastSnapshot(
  state: GameClientState,
  snapshot: CastSnapshot,
  now: number,
): GameClientState {
  const casts = {
    ...state.casts,
    [snapshot.castId]: { snapshot, seenAt: now },
  };
  const message = snapshot.state === CastState.Impact ? `${snapshot.skillId} impact` : state.message;

  return { ...state, casts, message };
}

function applyCastSnapshot(
  state: GameClientState,
  snapshot: CastSnapshot,
  now: number,
): GameClientState {
  const nextState = addCastSnapshot(state, snapshot, now);
  if (snapshot.state !== CastState.Impact) {
    return nextState;
  }

  return addSkillImpactVisualEvent(nextState, snapshot.skillId, normalizeVec3(snapshot.pos), now);
}

function applyInstantHit(
  state: GameClientState,
  message: ServerMessage & { type: 'InstantHit' },
  now: number,
): GameClientState {
  return addSkillImpactVisualEvent(state, message.skillId, normalizeVec3(message.targetPos), now);
}

function addSkillImpactVisualEvent(
  state: GameClientState,
  skillId: string,
  position: Vec3,
  now: number,
): GameClientState {
  if (skillId === 'waterSplash') {
    return addVisualEvent(state, { kind: 'splash', position, radius: 3, createdAt: now });
  }

  if (skillId === 'petrify') {
    return addVisualEvent(state, { kind: 'petrify', position, createdAt: now });
  }

  return state;
}

function addVisualEvent(
  state: GameClientState,
  event: Omit<VisualEvent, 'id'>,
): GameClientState {
  const id = `${event.kind}:${event.createdAt}:${Object.keys(state.visualEvents).length}`;
  return {
    ...state,
    visualEvents: {
      ...state.visualEvents,
      [id]: { id, ...event },
    },
  };
}

function addCombatLine(state: GameClientState, line: CombatLine): GameClientState {
  return { ...state, combatLog: [line, ...state.combatLog].slice(0, MAX_COMBAT_LINES) };
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
  return addCombatLine(
    { ...state, groundLoot },
    { id: makeCombatLineId(`pickup-${lootId}`, state.combatLog.length, now), text: `${playerName} picked up loot` },
  );
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

function applyItemUsed(
  state: GameClientState,
  itemUse: ServerMessage & { type: 'ItemUsed' },
  now: number,
): GameClientState {
  const inventory = [...state.inventory];
  if (itemUse.newQuantity > 0) {
    inventory[itemUse.slotIndex] = { itemId: itemUse.itemId, quantity: itemUse.newQuantity };
  } else {
    inventory.splice(itemUse.slotIndex, 1);
  }

  const deltas = [
    itemUse.healthDelta ? `+${Math.round(itemUse.healthDelta)} HP` : null,
    itemUse.manaDelta ? `+${Math.round(itemUse.manaDelta)} MP` : null,
  ].filter(Boolean).join(', ');
  const nextState = addItemUseVisualEvent({ ...state, inventory }, itemUse, now);

  return addCombatLine(
    nextState,
    {
      id: makeCombatLineId(`item-${itemUse.slotIndex}`, state.combatLog.length, now),
      text: `Used ${getItemName(itemUse.itemId)}${deltas ? ` (${deltas})` : ''}`,
    },
  );
}

function addItemUseVisualEvent(
  state: GameClientState,
  itemUse: ServerMessage & { type: 'ItemUsed' },
  now: number,
): GameClientState {
  const player = state.myPlayerId ? state.players[state.myPlayerId] : null;
  if (!player) {
    return state;
  }

  let nextState = state;
  if (itemUse.healthDelta && itemUse.healthDelta > 0) {
    nextState = addVisualEvent(nextState, {
      kind: 'healing',
      position: player.position,
      amount: itemUse.healthDelta,
      createdAt: now,
    });
  }

  if (itemUse.manaDelta && itemUse.manaDelta > 0) {
    nextState = addVisualEvent(nextState, {
      kind: 'mana',
      position: player.position,
      amount: itemUse.manaDelta,
      createdAt: now,
    });
  }

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

function normalizeVec3(position: { x: number; y?: number; z: number } | undefined): Vec3 {
  return {
    x: position?.x ?? 0,
    y: position?.y ?? 0.35,
    z: position?.z ?? 0,
  };
}

function formatCombatLogLine(
  state: GameClientState,
  skillId: string,
  targetIds: string[],
  damages: number[],
): string {
  const firstTarget = state.enemies[targetIds[0]]?.name ?? state.players[targetIds[0]]?.name;
  const totalDamage = damages.reduce((sum, damage) => sum + damage, 0);
  const targetText = firstTarget ? ` ${firstTarget}` : ` ${targetIds.length} target(s)`;
  return `${skillId} hit${targetText} for ${Math.round(totalDamage)} damage`;
}

function formatEnemyAttackLine(
  state: GameClientState,
  enemyId: string,
  targetId: string,
  damage: number,
): string {
  const enemyName = state.enemies[enemyId]?.name ?? 'Enemy';
  const playerName = state.players[targetId]?.name ?? 'player';
  return `${enemyName} hit ${playerName} for ${Math.round(damage)} damage`;
}

function formatItemDrops(items: ItemDrop[]): string {
  return items.map((item) => `${item.quantity}x ${getItemName(item.itemId)}`).join(', ');
}

function getItemName(itemId: string): string {
  return ITEMS[itemId]?.name ?? itemId;
}

function makeCombatLineId(castId: string, currentLineCount: number, now: number): string {
  return `${castId}:${now}:${currentLineCount}`;
}

function pruneCasts(casts: GameClientState['casts'], now: number): GameClientState['casts'] {
  return Object.fromEntries(
    Object.entries(casts).filter(([, cast]) => now - cast.seenAt < CAST_VISIBLE_MS),
  );
}

function pruneVisualEvents(
  visualEvents: GameClientState['visualEvents'],
  now: number,
): GameClientState['visualEvents'] {
  return Object.fromEntries(
    Object.entries(visualEvents)
      .filter(([, event]) => now - event.createdAt < VISUAL_EVENT_VISIBLE_MS),
  );
}

function mergeVec3(current: Vec3, update: Partial<Vec3> | undefined): Vec3 {
  return update ? { ...current, ...update } : current;
}

function clearDeadTarget(state: GameClientState, enemyId: string): string | null {
  return state.selectedTargetId === enemyId ? null : state.selectedTargetId;
}

export function getPlayerPosition(player: PlayerEntity | null): Vec3 {
  return player?.position ?? { x: 0, y: 0.5, z: 0 };
}

export function getNearestAliveEnemyId(
  enemies: Record<string, EnemyEntity>,
  origin: Vec3,
): string | null {
  let bestId: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const enemy of Object.values(enemies)) {
    if (!enemy.isAlive) {
      continue;
    }

    const distance = distanceSq(origin, enemy.position);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = enemy.id;
    }
  }

  return bestId;
}

function distanceSq(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

export function getHotkeySkill(
  player: PlayerEntity | null,
  slotIndex: number,
): SkillId | null {
  return player?.skillShortcuts?.[slotIndex] ?? player?.unlockedSkills?.[slotIndex] ?? null;
}
