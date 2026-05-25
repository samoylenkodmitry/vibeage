import { describe, expect, it } from 'vitest';
import { buildSkillRows } from '../apps/client/src/hud/SkillTreePanel';
import type { PlayerEntity } from '../apps/client/src/gameTypes';

// §49/M3 PR015 — skill tree lock/rejection UX. Detail strings on
// locked rows should tell the player *exactly* what they need:
// current level vs required, missing-prereq skill names (not ids),
// spec name for spec-locked rows.

function makePlayer(overrides: Partial<PlayerEntity>): PlayerEntity {
  return {
    id: 'p1', name: 'p', position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className: 'mage', race: 'human',
    unlockedSkills: [],
    availableSkillPoints: 0, level: 1,
    experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0, isAlive: true,
    skillCooldownEndTs: {}, statusEffects: [],
    specializationId: null,
    skillLevels: {},
    ...overrides,
  } as PlayerEntity;
}

describe('SkillTreePanel buildSkillRows — lock reasons (§49/M3 PR015)', () => {
  it('shows concrete level gap on locked class skills (have X / need Y)', () => {
    const player = makePlayer({ className: 'mage', level: 1, unlockedSkills: ['fireball'] });
    const rows = buildSkillRows(player);
    const petrify = rows.find((r) => r.skillId === 'petrify');
    expect(petrify).toBeDefined();
    expect(petrify!.status).toBe('locked');
    // Required Lv 4, player is L1 → "need Lv 4 (you're 1)".
    expect(petrify!.detail).toContain("Lv 4");
    expect(petrify!.detail).toContain("you're 1");
  });

  it('uses skill names not ids for missing prereqs', () => {
    // iceBolt requires fireball+waterSplash chain for a mage at L3.
    const player = makePlayer({ className: 'mage', level: 5, unlockedSkills: [] });
    const rows = buildSkillRows(player);
    const iceBolt = rows.find((r) => r.skillId === 'iceBolt');
    expect(iceBolt).toBeDefined();
    expect(iceBolt!.status).toBe('locked');
    // detail should mention "Water Splash" by display name, not "waterSplash" id.
    expect(iceBolt!.detail).toMatch(/Water Splash/);
    expect(iceBolt!.detail).not.toMatch(/waterSplash/);
  });

  it('spec-locked rows tell the player which spec to pick + the spec unlock level when under it', () => {
    const player = makePlayer({ className: 'mage', level: 5, specializationId: null });
    const rows = buildSkillRows(player);
    const specLocked = rows.find((r) => r.status === 'locked' && r.detail.includes('Lv 20'));
    expect(specLocked, 'expected at least one spec-locked row mentioning the L20 spec gate').toBeDefined();
  });

  it('available rows still surface the required level without scolding', () => {
    const player = makePlayer({ className: 'mage', level: 10, availableSkillPoints: 1, unlockedSkills: ['fireball', 'waterSplash', 'iceBolt'] });
    const rows = buildSkillRows(player);
    const petrify = rows.find((r) => r.skillId === 'petrify');
    expect(petrify!.status).toBe('available');
    expect(petrify!.detail).toBe('Required Lv 4');
  });
});
