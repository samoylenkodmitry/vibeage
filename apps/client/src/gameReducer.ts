import {
  type InventorySlot,
  type ServerMessage,
} from '../../../packages/protocol/messages';
import type { RejectableCommand } from '../../../packages/protocol/commandRejections';
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
  createInitialStarterProgress,
  normalizeClientStarterProgress,
} from './starterProgress';
import {
  applyCastRejected,
  applyCastSnapshotVisualState,
  applyCombatLogVisualState,
  applyEnemyAttackVisualState,
  applyBossTelegraphFeedback,
  applyEnemyDeathFeedback,
  applyEquipRejected,
  applyEquipmentChangeFeedback,
  applyInventoryRejectedVisualState,
  applyQuestRejectedVisualState,
  EQUIP_VERB_COMMANDS,
  INVENTORY_VERB_COMMANDS,
  QUEST_VERB_COMMANDS,
  applyInstantHitVisualState,
  applyItemUsedVisualState,
  applyLootAcquiredVisualState,
  applyOtherPlayerLootPickupVisualState,
  applyPlayerDeathFeedback,
  applyPlayerLevelUpFeedback,
  applyPlayerRespawnFeedback,
  applySkillLearnedFeedback,
  pruneClientVisualState,
} from './clientVisualState';
import { applyReactionTriggeredVisualState } from './reactionVfxState';
import { applyGameStateSnapshot } from './clientGameStateSnapshot';
import { mergeVec3, normalizeVec3 } from './vec3';
import { logBagDiag } from './bagDiag';
import { pruneExpiredTimeFields } from './timeFreeze';

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
  activePhysicsFields: {},
  visualEvents: {},
  nextVisualEventSeq: 0,
  inventory: [],
  maxInventorySlots: 20,
  equipment: {},
  learnSkillRejections: {},
  combatLog: [],
  chatLines: [],
  lastChatError: null,
  actionFeedback: null,
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
      return pruneClientTimeFreezeState(pruneClientVisualState(state, action.now), action.now);
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

function pruneClientTimeFreezeState(state: GameClientState, now: number): GameClientState {
  const activePhysicsFields = pruneExpiredTimeFields(state.activePhysicsFields, now);
  return activePhysicsFields === state.activePhysicsFields ? state : { ...state, activePhysicsFields };
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
  const withRespawnLog = applyPlayerRespawnFeedback(withDeathLog, update.id, current.name, current.isAlive, player.isAlive, now);
  const withLevelUpLog = applyPlayerLevelUpFeedback(withRespawnLog, update.id, current.level, player.level, now);
  // §52 polish — a successful UpgradeSkill arrives as a
  // `playerUpdated.skillLevels` delta (no dedicated SkillUpgraded
  // message). Mirror the SkillLearned → clear path so the
  // SkillTreePanel chip disappears once the upgrade actually lands.
  const learnSkillRejections = clearRejectionsForUpgradedSkills(state, update);

  return {
    ...withLevelUpLog,
    players: { ...withLevelUpLog.players, [update.id]: player },
    inventory,
    starterProgress,
    learnSkillRejections,
  };
}

function clearRejectionsForUpgradedSkills(
  state: GameClientState,
  update: Partial<PlayerEntity> & { id: string },
): Record<string, string> {
  if (state.myPlayerId !== update.id || !update.skillLevels) return state.learnSkillRejections;
  const prior = state.players[update.id]?.skillLevels ?? {};
  let next: Record<string, string> | null = null;
  for (const [skillId, level] of Object.entries(update.skillLevels)) {
    if ((prior[skillId] ?? 1) < level && skillId in state.learnSkillRejections) {
      next = next ?? { ...state.learnSkillRejections };
      delete next[skillId];
    }
  }
  return next ?? state.learnSkillRejections;
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

  if (message.type === 'PhysicsFieldSnapshot') {
    return applyPhysicsFieldSnapshot(state, message, now);
  }

  if (message.type === 'InstantHit') {
    return applyInstantHitVisualState(state, message, now);
  }

  if (message.type === 'ReactionTriggered') {
    return applyReactionTriggeredVisualState(state, message, now);
  }

  if (message.type === 'CombatLog') {
    return applyCombatLogVisualState(state, message, now);
  }

  if (message.type === 'CommandRejected') return routeCommandRejected(state, message, now);

  if (message.type === 'SystemMessage') return applySystemMessage(state, message, now);

  if (message.type === 'EnemyAttack') {
    return applyEnemyAttackVisualState(state, message, now);
  }

  if (message.type === 'BossTelegraph') {
    return applyBossTelegraph(state, message, now);
  }

  if (message.type === 'InventoryUpdate') {
    return applyInventoryUpdate(state, message.inventory, message.maxInventorySlots, message.playerId);
  }

  if (message.type === 'EquipmentUpdate') {
    // §52 polish — feedback must read the *previous* equipment slots
    // to diff what changed. If we update first, the helper compares
    // the new payload against itself and never emits "Equipped X".
    const withFeedback = applyEquipmentChangeFeedback(state, message, now);
    return applyEquipmentUpdate(withFeedback, message);
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


  if (message.type === 'SkillLearned') {
    return applySkillLearned(state, message, now);
  }

  if (message.type === 'ChatBroadcast') {
    return appendChatLine(state, message);
  }

  return state;
}

function applyPhysicsFieldSnapshot(
  state: GameClientState,
  message: ServerMessage & { type: 'PhysicsFieldSnapshot' },
  now: number,
): GameClientState {
  return {
    ...state,
    activePhysicsFields: {
      ...pruneExpiredTimeFields(state.activePhysicsFields, now),
      [message.field.id]: message.field,
    },
  };
}

/**
 * Archwork #3 sub-work 4 — table-driven CommandRejected routing.
 *
 * Every `RejectableCommand` is mapped to exactly one UI sink. The
 * mapping is a record indexed by commandType so adding a new
 * rejectable command requires picking a sink at compile time
 * (TypeScript flags the registry as non-exhaustive otherwise), and
 * `tests/commandRejectedRouting.spec.ts` asserts every entry
 * resolves at runtime.
 *
 * Sinks:
 *  - 'combatLog' — friendly red line in the combat log
 *    (`apply*RejectedVisualState`)
 *  - 'skillTreeChip' — per-skill chip on the SkillTreePanel keyed
 *    by `targetId` (the skill id)
 *  - 'chatInline' — `state.lastChatError`, rendered inline under the
 *    chat input
 *  - 'silent' — no client-side UX (server-internal or duplicate
 *    failures that have a domain-specific surface elsewhere)
 */
type CommandRejectedSink = 'combatLog' | 'skillTreeChip' | 'chatInline' | 'silent';

const COMMAND_REJECTED_ROUTE: { [C in RejectableCommand]: CommandRejectedSink } = {
  CastReq: 'combatLog',
  EquipItem: 'combatLog',
  UnequipItem: 'combatLog',
  UseItem: 'combatLog',
  DropItem: 'combatLog',
  DestroyItem: 'combatLog',
  CraftItem: 'combatLog',
  LootPickup: 'combatLog',
  LearnSkill: 'skillTreeChip',
  UpgradeSkill: 'skillTreeChip',
  AcceptQuest: 'combatLog',
  CancelQuest: 'combatLog',
  AdvanceQuest: 'combatLog',
  ClaimQuestReward: 'combatLog',
  BuyFromVendor: 'combatLog',
  SellToVendor: 'combatLog',
  ChatRequest: 'chatInline',
  SelectClass: 'silent',
  SelectRace: 'silent',
  // §9 — respec rejections feel like a vendor transaction (player
  // tried to spend gold, got an insufficient-gold or no-spec
  // reply). Combat log matches the BuyFromVendor / SellToVendor
  // sink choice.
  RespecSpecialization: 'combatLog',
  GmCommand: 'combatLog',
};

function applySystemMessage(
  state: GameClientState,
  message: ServerMessage & { type: 'SystemMessage' },
  now: number,
): GameClientState {
  return {
    ...state,
    combatLog: [
      { id: `sys-${state.combatLog.length}-${now}`, text: message.text },
      ...state.combatLog,
    ].slice(0, 200),
  };
}

function routeCommandRejected(
  state: GameClientState,
  message: ServerMessage & { type: 'CommandRejected' },
  now: number,
): GameClientState {
  if (message.commandType === 'LootPickup' || message.reason === 'inventoryFull') {
    const player = state.myPlayerId ? state.players[state.myPlayerId] : null;
    logBagDiag('CommandRejected', {
      commandType: message.commandType, reason: message.reason, requestId: message.requestId,
      clientInventoryLen: state.inventory.length,
      clientFilledSlots: state.inventory.filter((s) => s && s.quantity > 0).length,
      clientMaxInventorySlots: state.maxInventorySlots,
      playerMaxSlots: player?.maxInventorySlots,
      slotIndexes: state.inventory.map((s) => s.slotIndex),
      itemIds: state.inventory.map((s) => s.itemId),
    });
  }
  const sink = COMMAND_REJECTED_ROUTE[message.commandType];
  switch (sink) {
    case 'combatLog':
      // Three combat-log handlers based on the originating verb
      // family; each maps reasons to friendly copy and prepends a
      // line. The choice between them mirrors the verb sets the
      // server uses (EQUIP / QUEST / INVENTORY / cast).
      if (message.commandType === 'CastReq') return applyCastRejected(state, message, now);
      if (EQUIP_VERB_COMMANDS.has(message.commandType)) return applyEquipRejected(state, message, now);
      if (QUEST_VERB_COMMANDS.has(message.commandType)) return applyQuestRejectedVisualState(state, message, now);
      if (INVENTORY_VERB_COMMANDS.has(message.commandType)) return applyInventoryRejectedVisualState(state, message, now);
      return state;
    case 'skillTreeChip':
      // Learn + Upgrade share the SkillTreePanel chip slot keyed by
      // skill id — only one chip per row at a time. targetId is the
      // failing skill id; without it we have nowhere to hang the
      // chip, so we silently drop (defensive).
      if (!message.targetId) return state;
      return { ...state, learnSkillRejections: { ...state.learnSkillRejections, [message.targetId]: message.reason } };
    case 'chatInline':
      return { ...state, lastChatError: { reason: message.reason, at: now } };
    case 'silent':
      return state;
  }
}

export { COMMAND_REJECTED_ROUTE };
export type { CommandRejectedSink };

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
  // §52 polish — a successful broadcast for the local player implies
  // the previous attempt succeeded; clear any stale rejection chip.
  // Other-player broadcasts leave the rejection alone (only the local
  // player's send/error pair is meaningful for the chip).
  const lastChatError = message.fromId === state.myPlayerId ? null : state.lastChatError;
  return { ...state, chatLines: [...otherScope, ...trimmedSameScope], lastChatError };
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
    innerRadius: message.innerRadius,
    directionRad: message.directionRad,
    halfAngleDeg: message.halfAngleDeg,
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
  now: number,
): GameClientState {
  // Clear any previous LearnSkillFailed rejection for this skill so the panel
  // chip disappears once the learn finally succeeds.
  const { [message.skillId]: removed, ...remainingRejections } = state.learnSkillRejections;
  const rejections = removed ? remainingRejections : state.learnSkillRejections;
  // Only emit the "You learned X." log line on a NEW unlock — the
  // server re-sends SkillLearned idempotently on duplicate-learn
  // (see server/players/playerSkills.ts:51-54), which we don't want
  // to spam the combat log with.
  const alreadyKnown = state.players[state.myPlayerId ?? '']?.unlockedSkills.includes(message.skillId) ?? false;
  const next = updateMyPlayer(state, (player) => ({
    ...player,
    availableSkillPoints: message.remainingPoints,
    unlockedSkills: player.unlockedSkills.includes(message.skillId)
      ? player.unlockedSkills
      : [...player.unlockedSkills, message.skillId],
  }));
  const withLog = alreadyKnown ? next : applySkillLearnedFeedback(next, message.skillId, now);
  return rejections === state.learnSkillRejections ? withLog : { ...withLog, learnSkillRejections: rejections };
}

function applyPositionSnapshot(state: GameClientState, message: ServerMessage & { type: 'PosSnap' }, now: number) {
  const asPosition = { x: message.pos.x, z: message.pos.z };
  const snapSeq = message.snap ? message.seq ?? message.snapTs : undefined;
  if (state.players[message.id]) {
    return updatePlayer(state, {
      id: message.id,
      position: { ...state.players[message.id].position, ...asPosition },
      rotation: { ...state.players[message.id].rotation, y: message.rotY ?? 0 },
      velocity: message.vel,
      ...(snapSeq !== undefined ? { snapSeq } : {}),
    }, now);
  }

  if (state.enemies[message.id]) {
    return updateEnemy(state, {
      id: message.id,
      position: { ...state.enemies[message.id].position, ...asPosition },
      rotation: { ...state.enemies[message.id].rotation, y: message.rotY ?? 0 },
      velocity: message.vel,
      ...(snapSeq !== undefined ? { snapSeq } : {}),
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

function clearDeadTarget(state: GameClientState, enemyId: string): string | null {
  return state.selectedTargetId === enemyId ? null : state.selectedTargetId;
}
