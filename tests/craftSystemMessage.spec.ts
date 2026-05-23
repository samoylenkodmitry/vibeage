import { describe, expect, it } from 'vitest';
import { onCraftItem } from '../server/inventory/craftRecipe';
import { createTransientPlayer } from '../server/playerFactory';
import { createGameState } from '../server/gameState';
import { addItemsToPlayer, ensureCharacterInventory } from '../server/inventory/aggregateBridge';
import { upsertActivePlayerSession } from '../server/players/playerSession';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { ITEMS } from '../packages/content/items';
import { listInventoryItems } from '../packages/sim/characterInventory';
import type { ServerMessage } from '../packages/protocol/messages';

/**
 * User: "when crafting element i want messages in system chat."
 *
 * After a successful craft the server now emits a `SystemMessage`
 * with `kind: 'craft'` carrying a "Crafted X (consumed Y …)" line.
 * The client reducer appends that to `combatLog` so the player sees
 * a record of what just happened (the inventory delta alone is too
 * easy to miss).
 */
describe('craft success → SystemMessage in combat log', () => {
  it('emits a SystemMessage describing the produced + consumed items', () => {
    const state = createGameState();
    const player = createTransientPlayer('s1', 'crafter');
    upsertActivePlayerSession(state, new SpatialHashGrid(), player);
    // Pick a recipe item from the registry + seed every input plus the
    // recipe itself so the craft succeeds.
    const recipeItem = Object.values(ITEMS).find((i) => i.recipe);
    expect(recipeItem, 'no recipe items registered').toBeDefined();
    const recipe = recipeItem!.recipe!;
    for (const input of recipe.inputs) addItemsToPlayer(player, input.itemId, input.quantity);
    addItemsToPlayer(player, recipeItem!.id, 1);
    const inv = ensureCharacterInventory(player);
    const recipeSlot = listInventoryItems(inv).find((it) => it.templateId === recipeItem!.id);
    expect(recipeSlot, 'recipe not landed in bag').toBeDefined();
    expect(recipeSlot!.location.kind).toBe('inventory');
    const slotIndex = recipeSlot!.location.kind === 'inventory' ? recipeSlot!.location.slotIndex! : -1;
    expect(slotIndex).toBeGreaterThanOrEqual(0);

    const messages: ServerMessage[] = [];
    const direct = { send: (msg: ServerMessage) => messages.push(msg) };
    const outbound = { publish: () => undefined };
    onCraftItem({ id: player.socketId! }, direct, state, {
      type: 'CraftItem', recipeSlotIndex: slotIndex,
      clientTs: 1, clientSeq: 7,
    }, outbound);

    const system = messages.find((m): m is ServerMessage & { type: 'SystemMessage' } => m.type === 'SystemMessage');
    expect(system, 'craft did not emit a SystemMessage').toBeDefined();
    expect(system!.kind).toBe('craft');
    const outputName = ITEMS[recipe.output.itemId]?.name ?? recipe.output.itemId;
    expect(system!.text).toMatch(new RegExp(`Crafted ${outputName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`));
  });
});
