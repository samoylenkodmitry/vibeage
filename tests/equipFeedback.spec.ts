import { describe, expect, it } from 'vitest';
import {
  applyEquipFailedVisualState,
  applyEquipmentChangeFeedback,
} from '../apps/client/src/clientVisualState';
import type { GameClientState } from '../apps/client/src/gameTypes';
import type { ServerMessage } from '../packages/protocol/messages';

/**
 * §49/M2 — equip feedback. The reducer routes EquipFailed +
 * EquipmentUpdate through these helpers; the helpers prepend a
 * combat-log line so the player sees what happened.
 */
function emptyState(): GameClientState {
  return {
    combatLog: [],
    equipment: {},
  } as unknown as GameClientState;
}

describe('applyEquipFailedVisualState', () => {
  it('prepends a friendly reason line for known reasons', () => {
    const msg = { type: 'EquipFailed', reason: 'levelTooLow' } as ServerMessage & { type: 'EquipFailed' };
    const next = applyEquipFailedVisualState(emptyState(), msg, 1);
    expect(next.combatLog).toHaveLength(1);
    expect(next.combatLog[0].text).toMatch(/level/i);
  });
  it('falls back to raw reason when unknown', () => {
    const msg = { type: 'EquipFailed', reason: 'weird_unknown_reason' } as ServerMessage & { type: 'EquipFailed' };
    const next = applyEquipFailedVisualState(emptyState(), msg, 1);
    expect(next.combatLog[0].text).toContain('weird_unknown_reason');
  });
});

describe('applyEquipmentChangeFeedback', () => {
  it('skips logging on the initial empty equipment update (first spawn)', () => {
    const msg = { type: 'EquipmentUpdate', equipment: [{ slot: 'CHEST', itemId: 'leather_tunic' }] } as ServerMessage & { type: 'EquipmentUpdate' };
    const next = applyEquipmentChangeFeedback(emptyState(), msg, 1);
    expect(next.combatLog).toHaveLength(0);
  });
  it('logs "Equipped …" once an equipment baseline exists and the slot changes', () => {
    const state = { ...emptyState(), equipment: { CHEST: 'leather_tunic' } } as GameClientState;
    const msg = { type: 'EquipmentUpdate', equipment: [{ slot: 'CHEST', itemId: 'plate_cuirass' }] } as ServerMessage & { type: 'EquipmentUpdate' };
    const next = applyEquipmentChangeFeedback(state, msg, 1);
    expect(next.combatLog).toHaveLength(1);
    expect(next.combatLog[0].text).toMatch(/equipped/i);
  });
  it('skips slots that didn\'t change', () => {
    const state = { ...emptyState(), equipment: { CHEST: 'plate_cuirass' } } as GameClientState;
    const msg = { type: 'EquipmentUpdate', equipment: [{ slot: 'CHEST', itemId: 'plate_cuirass' }] } as ServerMessage & { type: 'EquipmentUpdate' };
    const next = applyEquipmentChangeFeedback(state, msg, 1);
    expect(next.combatLog).toHaveLength(0);
  });
});
