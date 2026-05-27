import { describe, expect, it, vi } from 'vitest';
import { createGameState } from '../server/gameState';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { handleResourceRegeneration } from '../server/players/playerLifecycle';

const NOW = 1_700_000_000_000;

/**
 * Regen is a generic system over characteristics: the SAME core that
 * heals players advances a mob's HP, and whether a given mob
 * regenerates is purely its spec `hpRegen` — not a hardcode in the
 * regen loop. These pin both the default (0 → flat) and the
 * spec-driven (>0 → heals) cases.
 */
describe('mob regen is a per-entity characteristic', () => {
  it('a default mob (hpRegen 0) does not regenerate', () => {
    const state = createGameState();
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0.5, z: 0 }, NOW);
    enemy.health = 10;
    state.enemies[enemy.id] = enemy;
    enemy.lastRegenTimeMs = NOW;

    handleResourceRegeneration(state, { publish: vi.fn() }, NOW + 5_000);

    expect(enemy.health).toBe(10);
  });

  it('a mob with a spec hpRegen heals toward its cap over real seconds', () => {
    const state = createGameState();
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0.5, z: 0 }, NOW);
    enemy.stats = { ...enemy.stats, hpRegen: 5 };
    enemy.health = 10;
    state.enemies[enemy.id] = enemy;
    enemy.lastRegenTimeMs = NOW;

    handleResourceRegeneration(state, { publish: vi.fn() }, NOW + 4_000);

    // 5 hp/s × 4s = +20, clamped at maxHealth.
    expect(enemy.health).toBe(Math.min(enemy.maxHealth, 30));
  });

  it('regen never exceeds maxHealth', () => {
    const state = createGameState();
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0.5, z: 0 }, NOW);
    enemy.stats = { ...enemy.stats, hpRegen: 1000 };
    enemy.health = enemy.maxHealth - 1;
    state.enemies[enemy.id] = enemy;
    enemy.lastRegenTimeMs = NOW;

    handleResourceRegeneration(state, { publish: vi.fn() }, NOW + 10_000);

    expect(enemy.health).toBe(enemy.maxHealth);
  });

  it('dead mobs do not regenerate', () => {
    const state = createGameState();
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0.5, z: 0 }, NOW);
    enemy.stats = { ...enemy.stats, hpRegen: 5 };
    enemy.health = 0;
    enemy.isAlive = false;
    state.enemies[enemy.id] = enemy;
    enemy.lastRegenTimeMs = NOW;

    handleResourceRegeneration(state, { publish: vi.fn() }, NOW + 5_000);

    expect(enemy.health).toBe(0);
  });
});
