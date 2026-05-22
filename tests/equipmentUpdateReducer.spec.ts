import { describe, expect, it } from 'vitest';
import { gameClientReducer, initialGameClientState } from '../apps/client/src/gameReducer';
import type { GameClientState } from '../apps/client/src/gameTypes';

/**
 * ROADMAP — reducer tests for every server message type (Equipment).
 *
 * Covers the full `EquipmentUpdate` reducer path: replacing the slot
 * map, idempotency on repeat payloads, slot-removal when a payload
 * drops a slot, and the "first payload after spawn is silent" guard
 * (initial-empty equipment map should NOT produce combat-log noise).
 *
 * The deeper "Equipped X" combat-log copy is already pinned by
 * tests/equipFeedback.spec.ts at the helper layer. This file pins
 * the reducer-dispatch flow end-to-end via `gameClientReducer`.
 */

const baseState: GameClientState = {
  ...initialGameClientState,
  connectionState: 'online' as const,
  myPlayerId: 'me',
};

function dispatchEquipmentUpdate(
  state: GameClientState,
  equipment: ReadonlyArray<{ slot: string; itemId: string }>,
  now = 1000,
): GameClientState {
  return gameClientReducer(state, {
    type: 'serverMessage',
    now,
    message: { type: 'EquipmentUpdate', equipment },
  });
}

describe('gameClientReducer — EquipmentUpdate', () => {
  it('writes the equipment slot map from the wire payload', () => {
    const next = dispatchEquipmentUpdate(baseState, [
      { slot: 'CHEST', itemId: 'leather_tunic' },
      { slot: 'MAIN_HAND', itemId: 'rusty_sword' },
    ]);
    expect(next.equipment).toEqual({ CHEST: 'leather_tunic', MAIN_HAND: 'rusty_sword' });
  });

  it('replaces (not merges) the slot map on each payload', () => {
    let state = dispatchEquipmentUpdate(baseState, [{ slot: 'CHEST', itemId: 'leather_tunic' }]);
    state = dispatchEquipmentUpdate(state, [{ slot: 'MAIN_HAND', itemId: 'rusty_sword' }], 2000);
    // The old CHEST slot is gone — the server's payload is authoritative.
    expect(state.equipment).toEqual({ MAIN_HAND: 'rusty_sword' });
  });

  it('handles an empty equipment payload (e.g., full unequip)', () => {
    const seeded = dispatchEquipmentUpdate(baseState, [{ slot: 'CHEST', itemId: 'leather_tunic' }]);
    const cleared = dispatchEquipmentUpdate(seeded, [], 2000);
    expect(cleared.equipment).toEqual({});
  });

  it('updates the itemId in place when the same slot changes', () => {
    let state = dispatchEquipmentUpdate(baseState, [{ slot: 'CHEST', itemId: 'leather_tunic' }]);
    state = dispatchEquipmentUpdate(state, [{ slot: 'CHEST', itemId: 'plate_cuirass' }], 2000);
    expect(state.equipment).toEqual({ CHEST: 'plate_cuirass' });
  });

  it('first payload after spawn does not produce combat-log "Equipped X" noise', () => {
    expect(baseState.combatLog).toHaveLength(0);
    const next = dispatchEquipmentUpdate(baseState, [
      { slot: 'CHEST', itemId: 'leather_tunic' },
      { slot: 'MAIN_HAND', itemId: 'rusty_sword' },
    ]);
    expect(next.combatLog).toHaveLength(0);
    // But state.equipment IS populated — the suppression only affects
    // the feedback log, not the slot map.
    expect(next.equipment).toEqual({ CHEST: 'leather_tunic', MAIN_HAND: 'rusty_sword' });
  });

  it('subsequent payload adds a combat-log line for a newly-filled slot', () => {
    const first = dispatchEquipmentUpdate(baseState, [{ slot: 'CHEST', itemId: 'leather_tunic' }]);
    expect(first.combatLog).toHaveLength(0);
    const second = dispatchEquipmentUpdate(first, [
      { slot: 'CHEST', itemId: 'leather_tunic' },
      { slot: 'MAIN_HAND', itemId: 'rusty_sword' },
    ], 2000);
    // Only the NEW slot contributes a line; the unchanged CHEST is silent.
    expect(second.combatLog).toHaveLength(1);
    expect(second.combatLog[0].text.startsWith('Equipped ')).toBe(true);
  });

  it('subsequent payload adds a line when an existing slot swaps to a different itemId', () => {
    const first = dispatchEquipmentUpdate(baseState, [{ slot: 'CHEST', itemId: 'leather_tunic' }]);
    const second = dispatchEquipmentUpdate(first, [{ slot: 'CHEST', itemId: 'plate_cuirass' }], 2000);
    expect(second.combatLog).toHaveLength(1);
    expect(second.combatLog[0].text.startsWith('Equipped ')).toBe(true);
  });

  it('subsequent payload with no slot changes does NOT spam the combat log', () => {
    const first = dispatchEquipmentUpdate(baseState, [{ slot: 'CHEST', itemId: 'leather_tunic' }]);
    const second = dispatchEquipmentUpdate(first, [{ slot: 'CHEST', itemId: 'leather_tunic' }], 2000);
    expect(second.combatLog).toHaveLength(0);
  });

  it('out-of-order / duplicate payloads stay idempotent on the slot map', () => {
    let state = dispatchEquipmentUpdate(baseState, [
      { slot: 'CHEST', itemId: 'leather_tunic' },
      { slot: 'MAIN_HAND', itemId: 'rusty_sword' },
    ]);
    // Same payload again — slot map should be byte-for-byte identical.
    state = dispatchEquipmentUpdate(state, [
      { slot: 'CHEST', itemId: 'leather_tunic' },
      { slot: 'MAIN_HAND', itemId: 'rusty_sword' },
    ], 2000);
    expect(state.equipment).toEqual({ CHEST: 'leather_tunic', MAIN_HAND: 'rusty_sword' });
    expect(state.combatLog).toHaveLength(0);
  });

  it('leaves other state slices alone (no incidental writes to players, quests, chat)', () => {
    const seeded: GameClientState = {
      ...baseState,
      chatLines: [{ id: 'c1', fromId: 'me', fromName: 'me', text: 'hi', scope: 'say', ts: 1 }],
    };
    const next = dispatchEquipmentUpdate(seeded, [{ slot: 'CHEST', itemId: 'leather_tunic' }]);
    expect(next.chatLines).toBe(seeded.chatLines);
    expect(next.players).toBe(seeded.players);
    expect(next.questsById).toBe(seeded.questsById);
  });
});
