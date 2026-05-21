import { describe, expect, it } from 'vitest';
import { QUEST_NPCS } from '../packages/content/npcs';
import {
  applyAcceptQuest,
  applyAdvanceQuest,
  applyClaimQuestReward,
  onEnemyKilledForQuests,
  onTalkedToNpcForQuests,
} from '../server/players/playerQuests';
import { createTransientPlayer } from '../server/playerFactory';
import { createGameState } from '../server/gameState';
import { addItemsToPlayer, emptyAggregateForPlayer } from '../server/inventory/aggregateBridge';
import { playerInventorySlots } from './helpers/inventoryView';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

/**
 * §52/PR-queue-#4 — quest reward overflow regression. Closes the
 * lone explicit TODO at `server/players/playerQuests.ts:135`
 * ("if bag is full they're dropped — TODO follow-up"). The
 * overflow now spawns as a player-owned ground stack at the
 * claim spot via the existing loot pipeline.
 */

function captureOutbound() {
  const events: OutboundEvent[] = [];
  const sink: OutboundEventSink = { publish: (e) => { events.push(e); } };
  return { events, sink };
}

function freshClaimablePlayer(npcId: string, questId: string): PlayerState {
  const player = createTransientPlayer('s-claim', 'claimer');
  player.level = 20;
  // Wipe the starter loadout so reward-delta assertions can compare
  // exact bag contents rather than starter-items + reward.
  player.characterInventory = emptyAggregateForPlayer(player);
  const npc = QUEST_NPCS[npcId];
  if (npc) player.position = { ...npc.position };
  const { sink } = captureOutbound();
  expect(applyAcceptQuest(player, questId, sink)).toBe(true);
  // rats_in_the_cellar — kill 3 goblins then talk back.
  onEnemyKilledForQuests(player, 'goblin', sink);
  onEnemyKilledForQuests(player, 'goblin', sink);
  onEnemyKilledForQuests(player, 'goblin', sink);
  expect(applyAdvanceQuest(player, questId, sink)).toBe(true);
  onTalkedToNpcForQuests(player, npcId, sink);
  expect(applyAdvanceQuest(player, questId, sink)).toBe(true);
  return player;
}

describe('quest reward overflow (§52/PR-queue-#4)', () => {
  it('fits the reward items in the bag when there is room', () => {
    const player = freshClaimablePlayer('warden_galen', 'rats_in_the_cellar');
    const state = createGameState();
    state.players[player.id] = player;
    const { sink } = captureOutbound();

    expect(applyClaimQuestReward(player, 'rats_in_the_cellar', sink, state)).toBe(true);
    // Reward = 2× health potion per content; assert both landed in
    // the bag and no ground loot spawned at the player's position.
    const slots = playerInventorySlots(player);
    const potion = slots.find((s) => s.itemId === 'health_potion');
    expect(potion?.quantity).toBe(2);
    expect(Object.keys(state.groundLoot)).toHaveLength(0);
  });

  it('on bag-full, drops the reward items as a player-owned ground stack at the claim spot', () => {
    const player = freshClaimablePlayer('warden_galen', 'rats_in_the_cellar');
    // Shrink the bag to a single slot (also reset the aggregate so
    // its `limits` matches the new `maxInventorySlots`; the limits
    // are baked in when the aggregate is constructed).
    player.maxInventorySlots = 1;
    player.characterInventory = emptyAggregateForPlayer(player);
    expect(addItemsToPlayer(player, 'worn_sword', 1).ok).toBe(true);
    const beforeSlots = playerInventorySlots(player);
    expect(beforeSlots).toHaveLength(1); // 1/1 occupied — bag full.

    const state = createGameState();
    state.players[player.id] = player;
    const { events, sink } = captureOutbound();

    expect(applyClaimQuestReward(player, 'rats_in_the_cellar', sink, state)).toBe(true);

    // The bag is unchanged — nothing fit.
    expect(playerInventorySlots(player)).toEqual(beforeSlots);

    // A player-owned ground stack carries the overflow.
    const groundEntries = Object.entries(state.groundLoot);
    expect(groundEntries).toHaveLength(1);
    const [, stack] = groundEntries[0];
    expect(stack.position).toEqual({ x: player.position.x, z: player.position.z });
    expect(stack.items).toEqual([{ itemId: 'health_potion', quantity: 2 }]);

    // The LootSpawn wire message is broadcast so the client renders the pile.
    const lootSpawn = events
      .filter((e) => e.type === 'serverMessage')
      .map((e) => e.type === 'serverMessage' ? e.message : null)
      .find((m) => m?.type === 'LootSpawn');
    expect(lootSpawn).toBeDefined();

    // The reward toast hints that the bag overflowed.
    const toast = events
      .filter((e) => e.type === 'serverMessage')
      .map((e) => e.type === 'serverMessage' ? e.message : null)
      .find((m) => m?.type === 'ChatBroadcast' && m.fromId === 'system');
    expect(toast).toBeDefined();
    if (toast && toast.type === 'ChatBroadcast') {
      expect(toast.text).toMatch(/bag full/i);
    }
  });
});
