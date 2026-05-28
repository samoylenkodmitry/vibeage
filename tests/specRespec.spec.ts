import { describe, expect, it, vi } from 'vitest';
import {
  applySpecializationChange,
  applySpecializationRespec,
  SPECIALIZATION_RESPEC_GOLD_COST,
} from '../server/players/playerIdentity';
import { createTransientPlayer } from '../server/playerFactory';
import type { OutboundEvent } from '../server/transport/outboundEvents';
import { handleClientMessage } from '../server/world/clientMessageRouter';
import { createGameState } from '../server/gameState';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';

/**
 * §9 — specialization respec policy.
 *
 * Pins the contract:
 *   - Spec respec costs SPECIALIZATION_RESPEC_GOLD_COST.
 *   - notSpecced when the player has no spec to clear.
 *   - notEnoughGold when the player can't pay.
 *   - On success: gold deducted, specializationId cleared,
 *     PlayerUpdate emitted.
 *   - The router emits a CommandRejected envelope on failure
 *     (typed reason carried back to the client).
 */

function setupSpeccedPlayer(gold = 10_000) {
  const player = createTransientPlayer('s1', 'TestPlayer');
  player.id = 'p1';
  player.level = 25;
  player.className = 'mage';
  player.gold = gold;
  // Drive the spec selection through the real path so passives apply.
  applySpecializationChange(player, 'arcanist', { publish: vi.fn() });
  return player;
}

describe('§9 spec respec — applySpecializationRespec', () => {
  it('clears specializationId and deducts gold on success', () => {
    const player = setupSpeccedPlayer(10_000);
    expect(player.specializationId).toBe('arcanist');
    const events: OutboundEvent[] = [];
    const result = applySpecializationRespec(player, { publish: (e) => events.push(e) });

    expect(result).toEqual({ ok: true });
    expect(player.specializationId).toBe(null);
    expect(player.gold).toBe(10_000 - SPECIALIZATION_RESPEC_GOLD_COST);
    const playerUpdate = events.find((e) => e.type === 'playerUpdated');
    expect(playerUpdate, 'expected a playerUpdated broadcast').toBeDefined();
  });

  it('emits recomputed stat fields when a specialization is chosen', () => {
    const player = createTransientPlayer('s1', 'TestPlayer');
    player.id = 'p1';
    player.level = 25;
    player.className = 'mage';
    const events: OutboundEvent[] = [];

    expect(applySpecializationChange(player, 'arcanist', { publish: (e) => events.push(e) })).toBe(true);
    const update = events.find((e) => e.type === 'playerUpdated');

    expect(update).toBeDefined();
    if (update?.type === 'playerUpdated') {
      expect(update.update.specializationId).toBe('arcanist');
      expect(update.update.stats).toBeDefined();
      expect(update.update.maxHealth).toBe(player.maxHealth);
      expect(update.update.maxMana).toBe(player.maxMana);
    }
  });

  it('refuses with notSpecced when the player has no spec', () => {
    const player = createTransientPlayer('s1', 'TestPlayer');
    player.id = 'p1';
    player.gold = 10_000;
    const result = applySpecializationRespec(player, { publish: vi.fn() });
    expect(result).toEqual({ ok: false, reason: 'notSpecced' });
  });

  it('refuses with notEnoughGold when the player can\'t pay', () => {
    const player = setupSpeccedPlayer(SPECIALIZATION_RESPEC_GOLD_COST - 1);
    const result = applySpecializationRespec(player, { publish: vi.fn() });
    expect(result).toEqual({ ok: false, reason: 'notEnoughGold' });
    expect(player.specializationId).toBe('arcanist');
    expect(player.gold).toBe(SPECIALIZATION_RESPEC_GOLD_COST - 1);
  });
});

describe('§9 spec respec — router CommandRejected envelope', () => {
  it('emits CommandRejected{commandType:RespecSpecialization, reason:notSpecced} for an unsspecced caller', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const player = createTransientPlayer('s1', 'TestPlayer');
    player.id = 'p1';
    player.gold = 10_000;
    state.players[player.id] = player;
    const sentToSocket: { type: string; commandType?: string; reason?: string }[] = [];
    const socket = {
      id: 's1',
      emit: (_evt: string, msg: { type: string; commandType?: string; reason?: string }) => {
        sentToSocket.push(msg);
      },
    };

    handleClientMessage(
      socket as never,
      state,
      { type: 'RespecSpecialization', clientSeq: 7 } as never,
      { publish: vi.fn() },
      spatial,
    );

    const rejection = sentToSocket.find((m) => m.type === 'CommandRejected');
    expect(rejection).toBeDefined();
    expect(rejection?.commandType).toBe('RespecSpecialization');
    expect(rejection?.reason).toBe('notSpecced');
  });
});
