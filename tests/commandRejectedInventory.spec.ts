import { describe, expect, it } from 'vitest';
import { onDestroyItem } from '../server/inventory/destroyItem';
import { onDropItem } from '../server/inventory/dropItem';
import { onUseItem } from '../server/inventory/itemUse';
import { onCraftItem } from '../server/inventory/craftRecipe';
import { createTransientPlayer } from '../server/playerFactory';
import { createGameState } from '../server/gameState';
import { addItemsToPlayer } from '../server/inventory/aggregateBridge';
import { upsertActivePlayerSession } from '../server/players/playerSession';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { ServerMessage } from '../packages/protocol/messages';

/**
 * §4 — CommandRejected rollout for inventory commands. Sibling of the
 * equip-feedback tests in `equipFeedback.spec.ts`; this one proves
 * that every silent rejection path now sends a structured envelope
 * with the right `commandType` + `reason`, and echoes `clientSeq` as
 * `requestId` so the client can route the failure.
 */

function setupPlayer() {
  const state = createGameState();
  const player = createTransientPlayer('s1', 'tester');
  upsertActivePlayerSession(state, new SpatialHashGrid(), player);
  return { state, player };
}

function captureRejections() {
  const rejections: Array<ServerMessage & { type: 'CommandRejected' }> = [];
  const direct = {
    send: (msg: ServerMessage) => {
      if (msg.type === 'CommandRejected') rejections.push(msg);
    },
  };
  return { rejections, direct };
}

function noopOutbound() {
  return { publish: () => undefined };
}

describe('CommandRejected — inventory commands (§4)', () => {
  it('UseItem: empty slot → invalidSlot, echoes clientSeq as requestId', () => {
    const { state, player } = setupPlayer();
    const { rejections, direct } = captureRejections();
    onUseItem({ id: player.socketId! }, direct, state,
      { type: 'UseItem', slotIndex: 99, clientTs: 1, clientSeq: 42 },
      noopOutbound());
    expect(rejections).toHaveLength(1);
    expect(rejections[0].commandType).toBe('UseItem');
    expect(rejections[0].reason).toBe('invalidSlot');
    expect(rejections[0].requestId).toBe(42);
  });

  it('UseItem: dead player → playerDead', () => {
    const { state, player } = setupPlayer();
    player.isAlive = false;
    const { rejections, direct } = captureRejections();
    onUseItem({ id: player.socketId! }, direct, state,
      { type: 'UseItem', slotIndex: 0, clientTs: 1 },
      noopOutbound());
    expect(rejections[0].reason).toBe('playerDead');
    expect(rejections[0].requestId).toBeUndefined();
  });

  it('DropItem: empty slot → invalidSlot', () => {
    const { state, player } = setupPlayer();
    const { rejections, direct } = captureRejections();
    onDropItem({ id: player.socketId! }, direct, state,
      { type: 'DropItem', slotIndex: 99, clientSeq: 7 },
      noopOutbound());
    expect(rejections[0].commandType).toBe('DropItem');
    expect(rejections[0].reason).toBe('invalidSlot');
    expect(rejections[0].requestId).toBe(7);
  });

  it('DestroyItem: empty slot → invalidSlot', () => {
    const { state, player } = setupPlayer();
    const { rejections, direct } = captureRejections();
    onDestroyItem({ id: player.socketId! }, direct, state,
      { type: 'DestroyItem', slotIndex: 99 });
    expect(rejections[0].commandType).toBe('DestroyItem');
    expect(rejections[0].reason).toBe('invalidSlot');
  });

  it('CraftItem: slot holds a non-recipe → notRecipe', () => {
    const { state, player } = setupPlayer();
    addItemsToPlayer(player, 'health_potion', 1);
    const slot = player.inventory.findIndex((s) => s?.itemId === 'health_potion');
    expect(slot).toBeGreaterThanOrEqual(0);
    const { rejections, direct } = captureRejections();
    onCraftItem({ id: player.socketId! }, direct, state,
      { type: 'CraftItem', recipeSlotIndex: slot, clientTs: 1, clientSeq: 13 },
      noopOutbound());
    expect(rejections[0].commandType).toBe('CraftItem');
    expect(rejections[0].reason).toBe('notRecipe');
    expect(rejections[0].requestId).toBe(13);
  });
});
