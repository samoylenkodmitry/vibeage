import { describe, expect, it } from 'vitest';
import {
  applyEnemyDeathFeedback,
  applyPlayerDeathFeedback,
} from '../apps/client/src/clientVisualState';
import type { GameClientState } from '../apps/client/src/gameTypes';

/**
 * §49/M2 — combat-log death feedback. The client detects death via
 * `isAlive` flipping from true → false on the next snapshot; the
 * helpers under test live in clientVisualState.ts and are wired
 * into gameReducer's updateEnemy / updatePlayer.
 */
function emptyState(): GameClientState {
  return {
    combatLog: [],
    enemies: {},
    players: {},
  } as unknown as GameClientState;
}

describe('applyEnemyDeathFeedback', () => {
  it('prepends "X has fallen." on alive → dead transition', () => {
    const next = applyEnemyDeathFeedback(emptyState(), 'enemy-1', 'Goblin', true, false, 1);
    expect(next.combatLog).toHaveLength(1);
    expect(next.combatLog[0].text).toBe('Goblin has fallen.');
  });

  it('is a no-op when the entity was already dead (dead → dead)', () => {
    const state = emptyState();
    const next = applyEnemyDeathFeedback(state, 'enemy-1', 'Goblin', false, false, 1);
    expect(next).toBe(state);
  });

  it('is a no-op on respawn (dead → alive)', () => {
    const state = emptyState();
    const next = applyEnemyDeathFeedback(state, 'enemy-1', 'Goblin', false, true, 1);
    expect(next).toBe(state);
  });

  it('is a no-op on alive → alive', () => {
    const state = emptyState();
    const next = applyEnemyDeathFeedback(state, 'enemy-1', 'Goblin', true, true, 1);
    expect(next).toBe(state);
  });

  it('falls back to "Enemy" when name is missing or whitespace', () => {
    const blank = applyEnemyDeathFeedback(emptyState(), 'enemy-1', '   ', true, false, 1);
    expect(blank.combatLog[0].text).toBe('Enemy has fallen.');
    const missing = applyEnemyDeathFeedback(emptyState(), 'enemy-1', undefined, true, false, 1);
    expect(missing.combatLog[0].text).toBe('Enemy has fallen.');
  });
});

describe('applyPlayerDeathFeedback', () => {
  it('prepends "X was defeated." on alive → dead transition', () => {
    const next = applyPlayerDeathFeedback(emptyState(), 'p-1', 'Aldric', true, false, 1);
    expect(next.combatLog).toHaveLength(1);
    expect(next.combatLog[0].text).toBe('Aldric was defeated.');
  });

  it('is a no-op on dead → dead, dead → alive, and alive → alive', () => {
    const state = emptyState();
    expect(applyPlayerDeathFeedback(state, 'p', 'X', false, false, 1)).toBe(state);
    expect(applyPlayerDeathFeedback(state, 'p', 'X', false, true, 1)).toBe(state);
    expect(applyPlayerDeathFeedback(state, 'p', 'X', true, true, 1)).toBe(state);
  });

  it('falls back to "A player" when name is missing or whitespace', () => {
    const blank = applyPlayerDeathFeedback(emptyState(), 'p-1', '', true, false, 1);
    expect(blank.combatLog[0].text).toBe('A player was defeated.');
  });
});
