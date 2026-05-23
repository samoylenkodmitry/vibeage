import { describe, expect, it, vi } from 'vitest';
import { tryGiveLoot } from '../server/loot/groundLoot';
import { createGameState } from '../server/gameState';
import { createTransientPlayer } from '../server/playerFactory';
import { upsertActivePlayerSession } from '../server/players/playerSession';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { OutboundEvent } from '../server/transport/outboundEvents';

/**
 * User: "sometimes when my bag is full i see that i picked up 45x
 * gold but i didnt see gold at all in bag."
 *
 * Root cause: `tryGiveLoot` credited `player.gold` server-side and
 * emitted `LootAcquired` so the chat line read "Picked up 45 gold"
 * — but no `playerUpdated` carried the new gold value back to the
 * client. The vitals counter stayed at the old number until some
 * unrelated tick (regen, damage) shipped a fresh player snapshot.
 */
describe('gold pickup sync', () => {
  it('emits a playerUpdated with the new gold counter after a pickup that included gold', () => {
    const state = createGameState();
    const player = createTransientPlayer('s1', 'miner');
    upsertActivePlayerSession(state, new SpatialHashGrid(), player);
    state.groundLoot['loot-1'] = {
      position: { x: 0, z: 0 },
      items: [{ itemId: 'gold_coin', quantity: 45 }],
    };
    const initialGold = player.gold ?? 0;
    const events: OutboundEvent[] = [];
    const outbound = { publish: vi.fn((e: OutboundEvent) => events.push(e)) };

    const result = tryGiveLoot(state, outbound, player.id, 'loot-1');

    expect(result.ok).toBe(true);
    expect(player.gold).toBe(initialGold + 45);
    const goldUpdates = events.filter((e): e is OutboundEvent & {
      type: 'playerUpdated';
      update: { id: string; gold?: number };
    } => e.type === 'playerUpdated' && (e.update as { gold?: number }).gold !== undefined);
    expect(goldUpdates.length).toBeGreaterThan(0);
    expect(goldUpdates[0].update.gold).toBe(initialGold + 45);
  });

  it('does NOT emit an extra gold-only playerUpdated when no gold dropped (no churn)', () => {
    const state = createGameState();
    const player = createTransientPlayer('s2', 'fighter');
    upsertActivePlayerSession(state, new SpatialHashGrid(), player);
    state.groundLoot['loot-2'] = {
      position: { x: 0, z: 0 },
      items: [{ itemId: 'goblin_ear', quantity: 1 }],
    };
    const events: OutboundEvent[] = [];
    const outbound = { publish: vi.fn((e: OutboundEvent) => events.push(e)) };

    const result = tryGiveLoot(state, outbound, player.id, 'loot-2');

    expect(result.ok).toBe(true);
    const goldUpdates = events.filter((e): e is OutboundEvent & {
      type: 'playerUpdated';
      update: { id: string; gold?: number };
    } => e.type === 'playerUpdated' && (e.update as { gold?: number }).gold !== undefined);
    expect(goldUpdates.length).toBe(0);
  });
});
