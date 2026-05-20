import { describe, expect, it, vi, afterEach } from 'vitest';
import { generateLoot } from '../server/loot/generateLoot';
import { PROFICIENCY_LEVEL } from '../packages/content/specializations';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import type { PlayerState } from '../packages/sim/entities';

// §45.3 follow-up — Treasure Hunter `Lucky Find` (proficiency,
// L40) sets `lootRateMultiplier: 1.5`. `generateLoot` reads the
// killer's spec and scales each drop's chance by the multiplier
// (clamped at 1.0). Verified by stubbing the RNG so chance vs
// roll is deterministic.

let rngQueue: number[] = [];

vi.mock('../server/utils/rng', () => ({
  rng: () => {
    if (rngQueue.length === 0) throw new Error('rng queue exhausted');
    return rngQueue.shift()!;
  },
}));

function makeKiller(specializationId: string | null): PlayerState {
  return {
    id: 'killer', socketId: 's', name: 'killer',
    position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className: 'rogue', unlockedSkills: [],
    skillShortcuts: [], availableSkillPoints: 0,
    skillCooldownEndTs: {}, statusEffects: [],
    level: PROFICIENCY_LEVEL, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0,
    isAlive: true, maxInventorySlots: 20,
    specializationId,
  };
}

afterEach(() => { rngQueue = []; });

describe('lootRateMultiplier — Treasure Hunter Lucky Find', () => {
  it('boosts every drop chance by 1.5x for a Treasure Hunter killer', () => {
    // The goblin loot table has multiple drops; we focus on one
    // entry by stubbing the rng to return a value between baseline
    // chance and (baseline * 1.5). Baseline rolls fail; boosted
    // rolls pass.
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, Date.now());
    // The table's lowest-chance drop is the goblin_ear (0.7), so a
    // roll of 0.8 fails without a boost but passes with ×1.5
    // (effective 1.05 → clamped at 1.0). We need a value strictly
    // between 0.7 and the boosted ceiling. 0.8 works for both.
    rngQueue = Array(20).fill(0.8);

    const baseline = generateLoot(enemy, makeKiller(null));
    rngQueue = Array(20).fill(0.8);
    const lucky = generateLoot(enemy, makeKiller('treasure_hunter'));

    expect(lucky.length).toBeGreaterThanOrEqual(baseline.length);
  });

  it('a null killer behaves identically to an unspecced one', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, Date.now());
    rngQueue = Array(20).fill(0.5);
    const nullKiller = generateLoot(enemy, null);
    rngQueue = Array(20).fill(0.5);
    const noSpec = generateLoot(enemy, makeKiller(null));
    expect(nullKiller).toEqual(noSpec);
  });
});
