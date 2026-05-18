import { describe, expect, it } from 'vitest';
import { handleResourceRegeneration } from '../server/players/playerLifecycle';
import { createGameState } from '../server/gameState';
import { createTransientPlayer } from '../server/playerFactory';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';

function captureOutbound(): { events: OutboundEvent[]; sink: OutboundEventSink } {
  const events: OutboundEvent[] = [];
  return { events, sink: { publish: (e) => events.push(e) } };
}

describe('handleResourceRegeneration', () => {
  it('applies hp + mp regen over real seconds based on derived stats', () => {
    const state = createGameState();
    const player = createTransientPlayer('s1', 'tester');
    player.health = 50;
    player.maxHealth = 200;
    player.mana = 30;
    player.maxMana = 200;
    player.stats = { hpRegen: 4, mpRegen: 6 };
    state.players[player.id] = player;
    const { sink } = captureOutbound();

    // Seed last regen time.
    handleResourceRegeneration(state, sink, 1_000_000);
    // 2.5 real seconds later → +10 hp (4 * 2.5), +15 mp (6 * 2.5).
    handleResourceRegeneration(state, sink, 1_002_500);
    expect(player.health).toBeCloseTo(60, 4);
    expect(player.mana).toBeCloseTo(45, 4);
  });

  it('caps regen at maxHealth / maxMana', () => {
    const state = createGameState();
    const player = createTransientPlayer('s2', 'tester');
    player.health = 198;
    player.maxHealth = 200;
    player.mana = 199;
    player.maxMana = 200;
    player.stats = { hpRegen: 10, mpRegen: 10 };
    state.players[player.id] = player;
    const { sink } = captureOutbound();
    handleResourceRegeneration(state, sink, 1_000_000);
    handleResourceRegeneration(state, sink, 1_005_000);
    expect(player.health).toBe(200);
    expect(player.mana).toBe(200);
  });

  it('does nothing for dead players', () => {
    const state = createGameState();
    const player = createTransientPlayer('s3', 'tester');
    player.isAlive = false;
    player.health = 0;
    player.mana = 0;
    player.stats = { hpRegen: 10, mpRegen: 10 };
    state.players[player.id] = player;
    const { sink } = captureOutbound();
    handleResourceRegeneration(state, sink, 1_000_000);
    handleResourceRegeneration(state, sink, 1_010_000);
    expect(player.health).toBe(0);
    expect(player.mana).toBe(0);
  });
});
