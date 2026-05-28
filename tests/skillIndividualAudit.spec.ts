import { describe, expect, it, vi } from 'vitest';
import { CLASS_SKILL_TREES } from '../packages/content/classes';
import { SPECIALIZATIONS } from '../packages/content/specializations';
import {
  SKILL_IDS,
  SKILLS,
  UNIVERSAL_SKILLS,
  type SkillEffectType,
  type SkillId,
} from '../packages/content/skills';
import { getSkillTags, type SkillTargetMode } from '../packages/content/skillTags';
import { CastState } from '../packages/protocol/messages';
import type { PlayerState } from '../packages/sim/entities';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { isEntityStunned } from '../server/combat/statusQueries';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';

const NOW = 1_700_000_000_000;

type SkillExpectation = {
  effects: SkillEffectType[];
  targetMode: SkillTargetMode;
  area?: boolean;
  selfTarget?: boolean;
  offenseKeys?: string[];
  reactionIds?: string[];
};

const PLAYER_SKILL_EXPECTATIONS: Record<string, SkillExpectation> = {
  basicAttack: { effects: ['damage'], targetMode: 'enemy' },
  escape: { effects: ['teleport'], targetMode: 'self' },
  fireball: { effects: ['damage', 'burn'], targetMode: 'enemy', reactionIds: ['detonate_burn'] },
  iceBolt: { effects: ['damage', 'poison', 'slow'], targetMode: 'enemy', reactionIds: ['flash_freeze'] },
  waterSplash: { effects: ['damage', 'waterWeakness'], targetMode: 'area-self', area: true },
  petrify: { effects: ['damage', 'stun'], targetMode: 'enemy' },
  slash: { effects: ['damage', 'dot'], targetMode: 'enemy' },
  powerStrike: { effects: ['damage', 'knockback'], targetMode: 'enemy' },
  shieldWall: { effects: ['shield'], targetMode: 'self' },
  taunt: { effects: ['taunt'], targetMode: 'enemy' },
  bash: { effects: ['damage', 'stun'], targetMode: 'enemy', reactionIds: ['crack_bleed'] },
  holyLight: { effects: ['heal'], targetMode: 'self' },
  bless: { effects: ['bless'], targetMode: 'self' },
  dispel: { effects: ['dispel'], targetMode: 'self' },
  smite: { effects: ['damage', 'stun'], targetMode: 'enemy', reactionIds: ['judgment_on_taunt'] },
  divineShield: { effects: ['shield'], targetMode: 'self' },
  arrowShot: { effects: ['damage'], targetMode: 'enemy', area: true, reactionIds: ['pick_slow_target'] },
  volley: { effects: ['damage'], targetMode: 'enemy' },
  rapidFire: { effects: ['attackSpeed'], targetMode: 'self' },
  evade: { effects: ['evasion'], targetMode: 'self' },
  backstab: { effects: ['damage'], targetMode: 'enemy', reactionIds: ['stealth_opener', 'poison_cashout'] },
  poisonBlade: { effects: ['damage', 'poison'], targetMode: 'enemy' },
  vanish: { effects: ['invisible', 'aggroReset'], targetMode: 'self', selfTarget: true },
  arcane_blast: { effects: ['damage'], targetMode: 'enemy' },
  meteor: { effects: ['damage', 'burn'], targetMode: 'area-self', area: true },
  rage: { effects: ['bless'], targetMode: 'self' },
  execute: { effects: ['damage'], targetMode: 'enemy', offenseKeys: ['executeBonus'] },
  greater_heal: { effects: ['heal'], targetMode: 'self' },
  empower: { effects: ['bless'], targetMode: 'self' },
  snipe: { effects: ['damage'], targetMode: 'enemy' },
  silent_step: { effects: ['invisible', 'aggroReset'], targetMode: 'self', selfTarget: true },
  holy_shield: { effects: ['shield'], targetMode: 'self' },
  shadow_strike: { effects: ['damage'], targetMode: 'enemy', offenseKeys: ['armorPen'] },
  phoenix_ward: { effects: ['shield'], targetMode: 'self' },
  sacred_pulse: { effects: ['heal'], targetMode: 'area-self', area: true },
  lucky_strike: { effects: ['damage'], targetMode: 'enemy', offenseKeys: ['bonusCritChance', 'bonusCritMult'] },
  wind_dash: { effects: ['speed_boost', 'aggroReset'], targetMode: 'self' },
  arcane_supremacy: { effects: ['damage'], targetMode: 'enemy' },
  inferno_aura: { effects: ['burn'], targetMode: 'area-self', area: true },
  blood_frenzy: { effects: ['bless'], targetMode: 'self' },
  killing_strike: { effects: ['damage'], targetMode: 'enemy' },
  mass_heal: { effects: ['heal'], targetMode: 'area-self', area: true },
  group_bless: { effects: ['bless'], targetMode: 'area-self', area: true },
  aimed_volley: { effects: ['damage'], targetMode: 'area-self', area: true },
  shadow_arrow: { effects: ['damage'], targetMode: 'enemy', offenseKeys: ['armorPen'] },
  divine_taunt: { effects: ['taunt'], targetMode: 'area-self', area: true },
  soul_eater: { effects: ['damage'], targetMode: 'enemy', offenseKeys: ['lifestealPct'] },
  rebirth: { effects: ['shield'], targetMode: 'self' },
  sacred_aura: { effects: ['heal'], targetMode: 'area-self', area: true },
  treasure_sense: { effects: ['reveal_loot'], targetMode: 'self' },
  stalking_arrow: { effects: ['damage', 'slow'], targetMode: 'enemy' },
};

describe('individual player skill mechanics audit', () => {
  it('has an explicit expectation row for every player-facing active skill', () => {
    expect(orderedPlayerActiveSkillIds()).toEqual(orderedExpectationIds());
  });

  it('pins each player-facing active skill effects, targeting, and special mechanics', () => {
    for (const id of orderedExpectationIds()) {
      const expected = PLAYER_SKILL_EXPECTATIONS[id];
      const skill = SKILLS[id];
      expect(skill, `${id} must exist`).toBeDefined();
      expect(skill.effects.map((effect) => effect.type), `${id} effects`).toEqual(expected.effects);
      expect(getSkillTags(skill).targetMode, `${id} targetMode`).toBe(expected.targetMode);
      if (expected.area !== undefined) expect((skill.area ?? 0) > 0, `${id} area`).toBe(expected.area);
      if (expected.selfTarget) expect(skill.selfTarget, `${id} selfTarget`).toBe(true);
      expect(skill.reactions?.map((reaction) => reaction.id) ?? [], `${id} reaction ids`).toEqual(expected.reactionIds ?? []);
      for (const key of expected.offenseKeys ?? []) {
        expect(skill.offense?.[key as keyof NonNullable<typeof skill.offense>], `${id} offense.${key}`).toBeDefined();
      }
    }
  });

  it('keeps all other skill ids in known non-player-active buckets', () => {
    const playerIds = new Set(orderedPlayerActiveSkillIds());
    const uncategorized = SKILL_IDS.filter((id) => (
      !playerIds.has(id)
      && !id.startsWith('passive_')
      && !id.startsWith('mob')
      && !id.startsWith('boss_')
    ));
    expect(uncategorized).toEqual([]);
  });
});

describe('stun skill runtime mechanics', () => {
  it.each(['bash', 'petrify', 'smite'] as const)('%s applies an action-blocking stun', (skillId) => {
    const caster = makeCaster(skillId);
    const target = createEnemy('goblin', 20, { x: 1, y: 0, z: 0 }, NOW);
    target.health = 10_000;
    target.maxHealth = 10_000;

    resolveCastImpact(targetedCast(caster.id, skillId, target.id, target.position), { publish: vi.fn() }, worldFor(caster, target), NOW);

    const stun = target.statusEffects.find((effect) => effect.type === 'stun');
    expect(stun?.durationMs, `${skillId} stun duration`).toBe(
      SKILLS[skillId].effects.find((effect) => effect.type === 'stun')?.durationMs,
    );
    expect(isEntityStunned(target, NOW)).toBe(true);
  });
});

function orderedPlayerActiveSkillIds(): SkillId[] {
  const ids = new Set<SkillId>(UNIVERSAL_SKILLS);
  for (const tree of Object.values(CLASS_SKILL_TREES)) {
    for (const id of Object.keys(tree.skillProgression) as SkillId[]) {
      if (!id.startsWith('passive_')) ids.add(id);
    }
  }
  for (const spec of Object.values(SPECIALIZATIONS)) {
    for (const id of [...(spec.specSkills ?? []), ...(spec.proficiencySkills ?? [])]) ids.add(id);
  }
  return SKILL_IDS.filter((id) => ids.has(id));
}

function orderedExpectationIds(): SkillId[] {
  const expected = new Set(Object.keys(PLAYER_SKILL_EXPECTATIONS));
  return SKILL_IDS.filter((id) => expected.has(id));
}

function makeCaster(skillId: SkillId): PlayerState {
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
    className: 'warrior',
    unlockedSkills: [skillId],
    availableSkillPoints: 0,
    skillCooldownEndTs: {},
    statusEffects: [],
    level: 20,
    experience: 0,
    experienceToNextLevel: 100,
    castingSkill: null,
    castingProgressMs: 0,
    isAlive: true,
    maxInventorySlots: 20,
    stats: { dmgMult: 1, critChance: 0, critMult: 2, accuracy: 999 },
  } as PlayerState;
}

function targetedCast(casterId: string, skillId: SkillId, targetId: string, pos: { x: number; z: number }): Cast {
  return {
    castId: `cast-${skillId}-${targetId}`,
    casterId,
    skillId,
    targetId,
    state: CastState.Impact,
    origin: { x: 0, z: 0 },
    pos: { x: pos.x, z: pos.z },
    startedAt: NOW,
    castTimeMs: 0,
  };
}

function worldFor(caster: PlayerState, target: ReturnType<typeof createEnemy>): CombatWorld {
  return {
    getEnemyById: (id) => (id === target.id ? target : null),
    getPlayerById: (id) => (id === caster.id ? caster : null),
    getEntitiesInCircle: () => [target],
    onTargetDied: vi.fn(),
  };
}
