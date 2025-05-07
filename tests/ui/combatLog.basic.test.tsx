import { expect, test, describe, beforeEach } from 'vitest';
import { useCombatLogStore } from '../../app/game/stores/useCombatLogStore';

// This is a simplified test that doesn't require rendering React components
describe('CombatLog Store', () => {
  // Clear the store before each test
  beforeEach(() => {
    const store = useCombatLogStore.getState();
    store.list = [];
  });

  test('should initialize with empty list', () => {
    // Get a fresh instance of the store
    const store = useCombatLogStore.getState();
    expect(store.list).toEqual([]);
  });

});
