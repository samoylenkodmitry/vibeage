import { describe, expect, it, vi } from 'vitest';
import { handleResourceRegeneration } from '../server/players/playerLifecycle';
import { PROFICIENCY_LEVEL } from '../packages/content/specializations';
import { createGameState } from '../server/gameState';
import type { PlayerState } from '../packages/sim/entities';

// §45.3 follow-up — Cardinal `Sanctity` (proficiency, L40) gives
// nearby allies +2 HP/sec on top of their own regen, within 12m.
// `handleResourceRegeneration` reads spec-aura bonuses live so
// movement toggles the buff without a stat recompute.

function makeAlly(id: string, specializationId: string | null, x: number, level = PROFICIENCY_LEVEL): PlayerState {
  return {
    id, socketId: `s-${id}`, name: id,
    position: { x, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 50, maxHealth: 100, mana: 100, maxMana: 100,
    className: id === 'cardinal' ? 'healer' : 'mage',
    unlockedSkills: [], availableSkillPoints: 0,
    skillCooldownEndTs: {}, statusEffects: [],
    level, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0,
    isAlive: true, maxInventorySlots: 20,
    specializationId,
    stats: { hpRegen: 1 },
  };
}

describe('Cardinal Sanctity — party HP regen aura', () => {
  it('teammate within 12m of a Cardinal regens an extra 2 HP/sec', () => {
    const state = createGameState();
    const teammate = makeAlly('teammate', null, 0);
    const cardinal = makeAlly('cardinal', 'cardinal', 5);
    state.players[teammate.id] = teammate;
    state.players[cardinal.id] = cardinal;
    const NOW = 1_000_000;
    teammate.lastRegenTimeMs = NOW;

    handleResourceRegeneration(state, { publish: vi.fn() }, NOW + 1000);

    // teammate.stats.hpRegen = 1 + 2 = 3 HP/sec
    expect(teammate.health).toBeCloseTo(50 + 3, 3);
  });

  it('teammate beyond 12m gets no aura bonus', () => {
    const state = createGameState();
    const teammate = makeAlly('teammate', null, 0);
    const cardinal = makeAlly('cardinal', 'cardinal', 20);
    state.players[teammate.id] = teammate;
    state.players[cardinal.id] = cardinal;
    const NOW = 1_000_000;
    teammate.lastRegenTimeMs = NOW;

    handleResourceRegeneration(state, { publish: vi.fn() }, NOW + 1000);

    expect(teammate.health).toBeCloseTo(50 + 1, 3);
  });
});
