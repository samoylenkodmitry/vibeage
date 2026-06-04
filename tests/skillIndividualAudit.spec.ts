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
  blink?: boolean;
  swap?: boolean;
};

const PLAYER_SKILL_EXPECTATIONS: Record<string, SkillExpectation> = {
  basicAttack: { effects: ['damage'], targetMode: 'enemy' },
  escape: { effects: ['teleport'], targetMode: 'self' },
  fireball: { effects: ['damage', 'burn'], targetMode: 'enemy', reactionIds: ['detonate_burn'] },
  iceBolt: { effects: ['damage', 'poison', 'slow'], targetMode: 'enemy', reactionIds: ['flash_freeze'] },
  waterSplash: { effects: ['damage', 'waterWeakness'], targetMode: 'enemy', area: true },
  petrify: { effects: ['damage', 'stun'], targetMode: 'enemy' },
  slash: { effects: ['damage', 'dot'], targetMode: 'enemy', reactionIds: ['hamstring_slow'] },
  powerStrike: { effects: ['damage', 'knockback'], targetMode: 'enemy', reactionIds: ['shatter_stun'] },
  shieldWall: { effects: ['shield'], targetMode: 'self' },
  taunt: { effects: ['taunt'], targetMode: 'enemy' },
  bash: { effects: ['damage', 'stun'], targetMode: 'enemy', reactionIds: ['crack_bleed'] },
  holyLight: { effects: ['heal'], targetMode: 'self' },
  bless: { effects: ['bless'], targetMode: 'self' },
  dispel: { effects: ['dispel'], targetMode: 'self' },
  smite: { effects: ['damage', 'stun'], targetMode: 'enemy', reactionIds: ['judgment_on_taunt'] },
  divineShield: { effects: ['shield'], targetMode: 'self' },
  arrowShot: { effects: ['damage', 'marked'], targetMode: 'enemy', area: true, reactionIds: ['pick_slow_target'] },
  volley: { effects: ['damage'], targetMode: 'enemy', reactionIds: ['pinning_fire', 'marked_barrage'] },
  rapidFire: { effects: ['attackSpeed'], targetMode: 'self' },
  evade: { effects: ['evasion'], targetMode: 'self' },
  backstab: { effects: ['damage'], targetMode: 'enemy', reactionIds: ['stealth_opener', 'poison_cashout'] },
  poisonBlade: { effects: ['damage', 'poison'], targetMode: 'enemy', reactionIds: ['venom_bleed'] },
  vanish: { effects: ['invisible', 'aggroReset'], targetMode: 'self', selfTarget: true },
  arcane_blast: { effects: ['damage'], targetMode: 'enemy', reactionIds: ['arcane_shatter', 'charged_arcana'] },
  meteor: { effects: ['damage', 'burn'], targetMode: 'area-self', area: true, reactionIds: ['conflagration'] },
  magma_chain: { effects: [], targetMode: 'enemy' },
  combustion_bloom: { effects: [], targetMode: 'enemy', area: true },
  phase_prison: { effects: [], targetMode: 'enemy', area: true },
  stasis_lattice: { effects: [], targetMode: 'enemy', area: true },
  rage: { effects: ['bless'], targetMode: 'self' },
  blood_magnet: { effects: [], targetMode: 'area-self', area: true, selfTarget: true },
  execute: { effects: ['damage'], targetMode: 'enemy', offenseKeys: ['executeBonus'], reactionIds: ['blood_in_water'] },
  duelist_lunge: { effects: [], targetMode: 'enemy' },
  blade_reversal: { effects: [], targetMode: 'enemy' },
  greater_heal: { effects: ['heal'], targetMode: 'self' },
  lifeline_swap: { effects: [], targetMode: 'ally' },
  sanctuary_gate: { effects: [], targetMode: 'area-self', area: true, selfTarget: true },
  empower: { effects: ['bless'], targetMode: 'self' },
  echoing_benediction: { effects: [], targetMode: 'area-self', area: true, selfTarget: true },
  snipe: { effects: ['damage'], targetMode: 'enemy', reactionIds: ['steady_target'] },
  tripwire_volley: { effects: [], targetMode: 'enemy', area: true },
  ricochet_prism: { effects: [], targetMode: 'enemy', area: true },
  silent_step: { effects: ['invisible', 'aggroReset'], targetMode: 'self', selfTarget: true },
  umbra_mine: { effects: [], targetMode: 'enemy', area: true },
  holy_shield: { effects: ['shield'], targetMode: 'self' },
  guardian_hook: { effects: [], targetMode: 'enemy', area: true },
  bulwark_zone: { effects: [], targetMode: 'area-self', area: true, selfTarget: true },
  shadow_strike: { effects: ['damage'], targetMode: 'enemy', offenseKeys: ['armorPen'], reactionIds: ['umbral_opener'], blink: true },
  vengeance_tether: { effects: [], targetMode: 'enemy' },
  phoenix_ward: { effects: ['shield'], targetMode: 'self' },
  phoenix_leap: { effects: [], targetMode: 'enemy', area: true },
  sunbreak_charge: { effects: [], targetMode: 'enemy', area: true },
  sacred_pulse: { effects: ['heal'], targetMode: 'area-self', area: true },
  aegis_relay: { effects: [], targetMode: 'area-self', area: true, selfTarget: true },
  tidal_barrier: { effects: [], targetMode: 'area-self', area: true, selfTarget: true },
  purifying_mirror: { effects: [], targetMode: 'area-self', area: true, selfTarget: true },
  lucky_strike: { effects: ['damage'], targetMode: 'enemy', offenseKeys: ['bonusCritChance', 'bonusCritMult'], reactionIds: ['loaded_dice'] },
  jackpot_snare: { effects: [], targetMode: 'enemy', area: true },
  loaded_mirage: { effects: [], targetMode: 'enemy', area: true },
  wind_dash: { effects: ['speed_boost', 'aggroReset'], targetMode: 'self' },
  razorwind_step: { effects: [], targetMode: 'enemy', area: true },
  phantom_split: { effects: [], targetMode: 'enemy', area: true },
  ember_relay: { effects: [], targetMode: 'enemy', area: true },
  seismic_rend: { effects: [], targetMode: 'enemy', area: true },
  harmonic_seal: { effects: [], targetMode: 'enemy', area: true },
  nightfall_net: { effects: [], targetMode: 'enemy', area: true },
  pain_dividend: { effects: [], targetMode: 'enemy', area: true },
  cinder_halo: { effects: [], targetMode: 'area-self', area: true, selfTarget: true },
  arcane_supremacy: { effects: ['damage'], targetMode: 'enemy', reactionIds: ['arcane_overflow'] },
  time_sphere: { effects: ['timeStop'], targetMode: 'enemy', area: true },
  dimensional_swap: { effects: ['damage', 'stun'], targetMode: 'enemy', reactionIds: ['charged_dislocation'], swap: true },
  inferno_aura: { effects: ['burn'], targetMode: 'area-self', area: true },
  blood_frenzy: { effects: ['bless'], targetMode: 'self' },
  killing_strike: { effects: ['damage'], targetMode: 'enemy', reactionIds: ['execution_window'] },
  mass_heal: { effects: ['heal'], targetMode: 'area-self', area: true },
  group_bless: { effects: ['bless'], targetMode: 'area-self', area: true },
  waygate: { effects: ['speed_boost', 'aggroReset'], targetMode: 'area-self', area: true },
  aimed_volley: { effects: ['damage'], targetMode: 'area-self', area: true, reactionIds: ['kill_zone'] },
  shadow_arrow: { effects: ['damage'], targetMode: 'enemy', offenseKeys: ['armorPen'] },
  divine_taunt: { effects: ['taunt'], targetMode: 'area-self', area: true },
  soul_eater: { effects: ['damage'], targetMode: 'enemy', offenseKeys: ['lifestealPct'], reactionIds: ['dark_feast'] },
  spectral_guard: { effects: ['damageReflect'], targetMode: 'self', selfTarget: true },
  rebirth: { effects: ['shield'], targetMode: 'self' },
  sacred_aura: { effects: ['heal'], targetMode: 'area-self', area: true },
  treasure_sense: { effects: ['reveal_loot'], targetMode: 'self' },
  stalking_arrow: { effects: ['damage', 'slow'], targetMode: 'enemy', reactionIds: ['venom_tracking'] },
  rift_step: { effects: ['damage', 'slow'], targetMode: 'enemy', area: true, reactionIds: ['vanishing_cut'], blink: true },
  rewind_mark: { effects: [], targetMode: 'self', selfTarget: true },
  portal_pair: { effects: [], targetMode: 'ground', area: true },
  gravity_well: { effects: [], targetMode: 'enemy', area: true },
  mirror_spell: { effects: [], targetMode: 'self', selfTarget: true },
  soul_link: { effects: [], targetMode: 'enemy' },
  phase_step: { effects: [], targetMode: 'enemy' },
  projectile_capture: { effects: [], targetMode: 'self', selfTarget: true },
  terrain_sigil: { effects: [], targetMode: 'enemy', area: true },
  puppet_mastery: { effects: [], targetMode: 'enemy' },
  momentum_strike: { effects: [], targetMode: 'enemy' },
  delayed_fate: { effects: [], targetMode: 'enemy' },
  clone_swap: { effects: [], targetMode: 'enemy' },
  silence_bubble: { effects: ['silence'], targetMode: 'enemy', area: true },
  reflection_contract: { effects: ['damageReflect'], targetMode: 'self', selfTarget: true },
  cataclysm_rings: { effects: ['damage', 'burn'], targetMode: 'enemy', area: true },
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
      if (expected.blink) expect(skill.blink, `${id} blink`).toBeDefined();
      if (expected.swap) expect(skill.swap, `${id} swap`).toBeDefined();
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
