import type { ClientMessage } from '../../packages/protocol/messages.js';
import type { RejectableCommand } from '../../packages/protocol/commandRejections.js';
import { sendCommandRejected } from '../transport/commandRejected.js';
import {
  applyAcceptQuest,
  applyAdvanceQuest,
  applyCancelQuest,
} from '../players/playerQuests.js';
import { onUseItem } from '../inventory/itemUse.js';
import { onCraftItem } from '../inventory/craftRecipe.js';
import { onDropItem } from '../inventory/dropItem.js';
import { onDestroyItem } from '../inventory/destroyItem.js';
import { onLearnSkill, onSetSkillShortcut } from '../players/playerSkills.js';
import { onRespawnRequest } from '../players/playerLifecycle.js';
import { debug, LOG_CATEGORIES } from '../logger.js';
import type { GameState } from '../gameState.js';
import type { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import {
  makeSocketMessageSink,
  type OutboundEventSink,
} from '../transport/outboundEvents.js';
import { bucketForCommand, sharedRateLimiter } from './rateLimiter.js';
import { runtimeMetrics } from '../observability/runtimeMetrics.js';
import { onCastReq, createWorldCombatBridge } from './router/castHandlers.js';
import { onChatRequest } from './router/chatHandlers.js';
import type { WorldClient } from './router/commandContext.js';
import { onDevTeleport, onGmCommand } from './router/devHandlers.js';
import {
  onRespecSpecialization,
  onSelectClass,
  onSelectRace,
  onSelectSpecialization,
  onUpgradeSkill,
} from './router/identityHandlers.js';
import {
  emitInventoryUpdate,
  onEquipItem,
  onLootPickup,
  onRequestInventory,
  onUnequipItem,
} from './router/inventoryHandlers.js';
import { onMoveIntent } from './router/movementHandlers.js';
import { onClaimQuestReward, onQuestVerb, onTalkNpc } from './router/questHandlers.js';
import { onBuyFromVendor, onSellToVendor } from './router/vendorHandlers.js';

export { createWorldCombatBridge, emitInventoryUpdate };

/**
 * §52 polish — commands that emit a `CommandRejected{reason:'rateLimited'}`
 * envelope when the rate limiter drops them. Movement / cast / loot
 * intents stay silent because they're client-initiated at high
 * frequency; a rate-limit drop is normal there and would spam the
 * combat log. User-initiated, low-frequency commands get the
 * envelope so the UI can surface "slow down" feedback.
 */
const RATE_LIMIT_FEEDBACK_COMMANDS: ReadonlySet<RejectableCommand> = new Set<RejectableCommand>([
  'ChatRequest',
  'BuyFromVendor', 'SellToVendor',
  'CraftItem', 'UseItem', 'DropItem', 'DestroyItem',
  'EquipItem', 'UnequipItem',
  'LearnSkill', 'UpgradeSkill',
  'AcceptQuest', 'CancelQuest', 'AdvanceQuest', 'ClaimQuestReward',
  'GmCommand',
]);

export function handleClientMessage(
  socket: WorldClient,
  state: GameState,
  msg: ClientMessage,
  outbound: OutboundEventSink,
  spatial: SpatialHashGrid,
): void {
  const bucket = bucketForCommand(msg.type);
  const direct = makeSocketMessageSink(socket);
  if (bucket && !sharedRateLimiter().allow(socket.id, bucket)) {
    debug(LOG_CATEGORIES.SYSTEM, `Rate-limited ${msg.type} from ${socket.id}`);
    runtimeMetrics.increment(`rateLimit.dropped.${msg.type}`);
    runtimeMetrics.increment('rateLimit.dropped.total');
    if ((RATE_LIMIT_FEEDBACK_COMMANDS as ReadonlySet<string>).has(msg.type)) {
      sendCommandRejected(direct, msg.type as RejectableCommand, 'rateLimited',
        (msg as { clientSeq?: number }).clientSeq);
    }
    return;
  }
  switch (msg.type) {
    case 'MoveIntent':
      return onMoveIntent(socket, state, msg, outbound);
    case 'CastReq':
      return onCastReq(socket, direct, state, msg, outbound, spatial);
    case 'LearnSkill':
      return onLearnSkill(socket, direct, outbound, state, msg);
    case 'SetSkillShortcut':
      return onSetSkillShortcut(socket, direct, outbound, state, msg);
    case 'RespawnRequest':
      return onRespawnRequest(state, msg, outbound, spatial, socket.id);
    case 'UseItem':
      return onUseItem(socket, direct, state, msg, outbound);
    case 'CraftItem':
      return onCraftItem(socket, direct, state, msg, outbound);
    case 'LootPickup':
      return onLootPickup(socket, direct, state, msg, outbound);
    case 'DropItem':
      return onDropItem(socket, direct, state, msg, outbound);
    case 'DestroyItem':
      return onDestroyItem(socket, direct, state, msg);
    case 'RequestInventory':
      return onRequestInventory(socket, direct, state);
    case 'SelectClass':
      return onSelectClass(socket, direct, state, msg, outbound);
    case 'SelectRace':
      return onSelectRace(socket, direct, state, msg, outbound);
    case 'DevTeleport':
      return onDevTeleport(socket, state, msg);
    case 'ChatRequest':
      return onChatRequest(socket, direct, state, msg, outbound, spatial);
    case 'EquipItem':
      return onEquipItem(socket, direct, state, msg, outbound);
    case 'UnequipItem':
      return onUnequipItem(socket, direct, state, msg, outbound);
    case 'SelectSpecialization':
      return onSelectSpecialization(socket, state, msg, outbound);
    case 'RespecSpecialization':
      return onRespecSpecialization(socket, direct, state, msg, outbound);
    case 'UpgradeSkill':
      return onUpgradeSkill(socket, direct, state, msg, outbound);
    case 'TalkNpc':
      return onTalkNpc(socket, state, msg, outbound);
    case 'AcceptQuest':
      return onQuestVerb(socket, direct, state, msg, outbound, applyAcceptQuest);
    case 'CancelQuest':
      return onQuestVerb(socket, direct, state, msg, outbound, applyCancelQuest);
    case 'AdvanceQuest':
      return onQuestVerb(socket, direct, state, msg, outbound, applyAdvanceQuest);
    case 'ClaimQuestReward':
      return onClaimQuestReward(socket, direct, state, msg, outbound);
    case 'BuyFromVendor':
      return onBuyFromVendor(socket, direct, state, msg, outbound);
    case 'SellToVendor':
      return onSellToVendor(socket, direct, state, msg, outbound);
    case 'GmCommand':
      return onGmCommand(socket, direct, state, msg, outbound);
  }
}
