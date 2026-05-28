import { describe, expect, it, vi } from 'vitest';
import { SKILLS } from '../packages/content/skills';
import { CastState } from '../packages/protocol/messages';
import type { PlayerState } from '../packages/sim/entities';
import { getEffectiveSkillRange, getEffectiveSkillStats, getSkillLevel, getSkillUpgradeModifiers } from '../packages/sim/skillUpgrades';
import { canCast } from '../server/combat/castRules';
import { resolveCastImpact } from '../server/combat/impactResolver';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import type { OutboundEventSink } from '../server/transport/outboundEvents';

const NOW = 1_700_000_000_000;

describe('getSkillLevel', () => {
  it('returns 1 when skillLevels is undefined or missing the id', () => {
    expect(getSkillLevel(undefined, 'fireball')).toBe(1);
    expect(getSkillLevel({}, 'fireball')).toBe(1);
  });
  it('clamps below-1 values up to 1', () => {
    expect(getSkillLevel({ fireball: 0 }, 'fireball')).toBe(1);
    expect(getSkillLevel({ fireball: -3 }, 'fireball')).toBe(1);
  });
  it('returns the stored level otherwise', () => {
    expect(getSkillLevel({ fireball: 3 }, 'fireball')).toBe(3);
  });
});

describe('getSkillUpgradeModifiers', () => {
  it('returns identity when the skill has no upgrade tiers', () => {
    const m = getSkillUpgradeModifiers('basicAttack', 5);
    expect(m.dmgMultiplier).toBe(1);
    expect(m.cooldownMultiplier).toBe(1);
    expect(m.rangeBonus).toBe(0);
    expect(m.areaBonus).toBe(0);
    expect(m.manaCostMultiplier).toBe(1);
    expect(m.durationMultiplier).toBe(1);
  });

  it('returns identity for level <= 1 even when upgrades exist', () => {
    const m = getSkillUpgradeModifiers('fireball', 1);
    expect(m.dmgMultiplier).toBe(1);
  });

  it('folds each unlocked tier cumulatively (multiplicative for multipliers)', () => {
    const fireball = SKILLS.fireball;
    expect(fireball.upgrades?.length, 'fireball must have upgrade tiers for this test').toBeGreaterThan(0);

    // Level 2 unlocks tier 0 only.
    const lvl2 = getSkillUpgradeModifiers('fireball', 2);
    const tier0 = fireball.upgrades![0].modifiers;
    if (tier0.dmgMultiplier !== undefined) {
      expect(lvl2.dmgMultiplier).toBeCloseTo(tier0.dmgMultiplier);
    }

    // Level past max only folds up to the available number of tiers.
    const maxLevel = 1 + fireball.upgrades!.length;
    const aboveMax = getSkillUpgradeModifiers('fireball', maxLevel + 10);
    const exactlyMax = getSkillUpgradeModifiers('fireball', maxLevel);
    expect(aboveMax).toEqual(exactlyMax);
  });

  it('folds range and area bonuses for projectile splash upgrades', () => {
    const lvl3 = getSkillUpgradeModifiers('arrowShot', 3);
    expect(lvl3.rangeBonus).toBe(1);
    expect(lvl3.areaBonus).toBe(1);
    const effective = getEffectiveSkillStats('arrowShot', 3);
    expect(effective.range).toBe((SKILLS.arrowShot.range ?? 0) + 1);
    expect(effective.area).toBe((SKILLS.arrowShot.area ?? 0) + 1);
  });

  it('combines upgrade range bonuses with specialization range multipliers', () => {
    expect(getEffectiveSkillRange('arrowShot', { skillLevels: { arrowShot: 3 } })).toBe((SKILLS.arrowShot.range ?? 0) + 1);
    expect(getEffectiveSkillRange('taunt', { specializationId: 'templar_knight', level: 20 })).toBe((SKILLS.taunt.range ?? 0) * 1.5);
  });
});

describe('skill upgrade modifiers apply in combat resolution', () => {
  it('rangeBonus extends server cast validation range', () => {
    const target = createEnemy('goblin', 1, { x: 22.5, y: 0, z: 0 }, NOW);
    const lvl1 = makePlayer({ skillLevels: { arrowShot: 1 } });
    const lvl3 = makePlayer({ skillLevels: { arrowShot: 3 } });
    const skill = { id: 'arrowShot' as const, range: SKILLS.arrowShot.range ?? 0 };

    expect(canCast(lvl1, skill, target, undefined, NOW)).toEqual({ canCast: false, reason: 'outofrange' });
    expect(canCast(lvl3, skill, target, undefined, NOW)).toEqual({ canCast: true });
  });

  it('dmgMultiplier scales heal effects, not just direct damage', () => {
    const caster = makePlayer({
      id: 'healer',
      className: 'healer',
      unlockedSkills: ['holyLight'],
      skillLevels: { holyLight: 2 },
      health: 100,
      maxHealth: 1000,
    });

    resolveCastImpact(selfCast(caster.id, 'holyLight'), noopOutbound(), selfWorld(caster), NOW);

    expect(caster.health).toBe(360);
  });

  it('durationMultiplier scales status-effect durations', () => {
    const caster = makePlayer({
      className: 'warrior',
      unlockedSkills: ['slash'],
      skillLevels: { slash: 3 },
    });
    const target = createEnemy('goblin', 1, { x: 1, y: 0, z: 0 }, NOW);
    target.health = 1000;
    target.maxHealth = 1000;

    resolveCastImpact(targetedCast(caster.id, 'slash', target.id, target.position), noopOutbound(), enemyWorld(caster, [target]), NOW);

    expect(target.statusEffects.find((effect) => effect.type === 'dot')?.durationMs).toBe(8000);
  });

  it('areaBonus expands server-side splash target selection', () => {
    const lvl1Caster = makePlayer({ skillLevels: { arrowShot: 1 } });
    const lvl3Caster = makePlayer({ skillLevels: { arrowShot: 3 } });

    const lvl1Enemies = arrowSplashTargets();
    resolveCastImpact(
      targetedCast(lvl1Caster.id, 'arrowShot', lvl1Enemies.target.id, lvl1Enemies.target.position),
      noopOutbound(),
      enemyWorld(lvl1Caster, [lvl1Enemies.target, lvl1Enemies.splash]),
      NOW,
    );
    expect(lvl1Enemies.splash.health).toBe(1000);

    const lvl3Enemies = arrowSplashTargets();
    resolveCastImpact(
      targetedCast(lvl3Caster.id, 'arrowShot', lvl3Enemies.target.id, lvl3Enemies.target.position),
      noopOutbound(),
      enemyWorld(lvl3Caster, [lvl3Enemies.target, lvl3Enemies.splash]),
      NOW,
    );
    expect(lvl3Enemies.splash.health).toBeLessThan(1000);
  });
});

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'caster',
    socketId: 'socket',
    name: 'caster',
    position: { x: 0, y: 0.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 1000,
    maxHealth: 1000,
    mana: 500,
    maxMana: 500,
    className: 'ranger',
    unlockedSkills: ['arrowShot'],
    availableSkillPoints: 0,
    skillCooldownEndTs: {},
    statusEffects: [],
    level: 10,
    experience: 0,
    experienceToNextLevel: 100,
    castingSkill: null,
    castingProgressMs: 0,
    isAlive: true,
    maxInventorySlots: 20,
    stats: { dmgMult: 1, critChance: 0, critMult: 2, accuracy: 999 },
    ...overrides,
  } as PlayerState;
}

function noopOutbound(): OutboundEventSink {
  return { publish: vi.fn() };
}

function selfCast(casterId: string, skillId: string): Cast {
  return {
    castId: `cast-${skillId}`,
    casterId,
    skillId: skillId as never,
    state: CastState.Impact,
    origin: { x: 0, z: 0 },
    pos: { x: 0, z: 0 },
    startedAt: NOW,
    castTimeMs: 0,
  };
}

function targetedCast(casterId: string, skillId: string, targetId: string, pos: { x: number; z: number }): Cast {
  return {
    castId: `cast-${skillId}-${targetId}`,
    casterId,
    skillId: skillId as never,
    targetId,
    state: CastState.Impact,
    origin: { x: 0, z: 0 },
    pos: { x: pos.x, z: pos.z },
    startedAt: NOW,
    castTimeMs: 0,
  };
}

function selfWorld(caster: PlayerState): CombatWorld {
  return {
    getEnemyById: () => null,
    getPlayerById: (id) => (id === caster.id ? caster : null),
    getEntitiesInCircle: () => [],
    onTargetDied: vi.fn(),
  };
}

function enemyWorld(caster: PlayerState, enemies: ReturnType<typeof createEnemy>[]): CombatWorld {
  return {
    getEnemyById: (id) => enemies.find((enemy) => enemy.id === id) ?? null,
    getPlayerById: (id) => (id === caster.id ? caster : null),
    getEntitiesInCircle: (center, radius) => enemies.filter((enemy) => {
      const dx = enemy.position.x - center.x;
      const dz = enemy.position.z - center.z;
      return dx * dx + dz * dz <= radius * radius;
    }),
    onTargetDied: vi.fn(),
  };
}

function arrowSplashTargets(): { target: ReturnType<typeof createEnemy>; splash: ReturnType<typeof createEnemy> } {
  const target = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, NOW);
  const splash = createEnemy('goblin', 1, { x: 3.1, y: 0, z: 0 }, NOW);
  for (const enemy of [target, splash]) {
    enemy.health = 1000;
    enemy.maxHealth = 1000;
  }
  return { target, splash };
}
