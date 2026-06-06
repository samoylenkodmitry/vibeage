import { describe, expect, it } from 'vitest';
import { SKILLS, type SkillId } from '../packages/content/skills';
import { SPECIALIZATIONS, type SpecializationId } from '../packages/content/specializations';
import type { StatusEffect } from '../packages/sim/entities';
import { distanceXZ } from '../packages/sim/geometry';
import { createSimulatedEnemy, type PlayerAiContext } from '../server/sim/gameSimulator';
import {
  createClassAiPolicy,
  createSimProfilePlayer,
  SPECIALIZATION_AI_PROFILES,
} from '../server/sim/playerPolicies';
import { pveSpecializationScenarios, runPveScenario } from '../server/sim/scenarioCatalog';

const NOW = 1_700_000_000_000;

describe('specialization AI policy registry', () => {
  it('defines one explicit AI profile for every specialization', () => {
    expect(Object.keys(SPECIALIZATION_AI_PROFILES).sort()).toEqual(Object.keys(SPECIALIZATIONS).sort());

    for (const [specId, spec] of Object.entries(SPECIALIZATIONS) as Array<[SpecializationId, (typeof SPECIALIZATIONS)[SpecializationId]]>) {
      const profile = SPECIALIZATION_AI_PROFILES[specId];
      const ruleSkills = new Set(profile.rules.map((rule) => rule.skillId));

      expect(profile.baseClass).toBe(spec.baseClass);
      expect(profile.identity.plan.length).toBeGreaterThan(20);
      expect(profile.identity.desiredRangeFraction).toBeGreaterThan(0);
      expect(profile.identity.desiredRangeFraction).toBeLessThanOrEqual(1);
      expect(profile.identity.priorityTactics.length).toBeGreaterThanOrEqual(3);
      expect(profile.rules.length).toBeGreaterThan(0);
      expect(Object.values(profile.tactics).flat().length).toBeGreaterThan(0);
      for (const tactic of profile.identity.priorityTactics) {
        expect(profile.tactics[tactic].length, `${specId} priority tactic ${tactic}`).toBeGreaterThan(0);
      }
      for (const skillId of profile.rules.map((rule) => rule.skillId)) expect(SKILLS[skillId]).toBeDefined();
      for (const skillId of [...(spec.specSkills ?? []), ...(spec.proficiencySkills ?? [])]) {
        expect(ruleSkills.has(skillId), `${specId} AI should know ${skillId}`).toBe(true);
      }
    }
  });

  it('uses specialization-specific tactical choices', () => {
    expect(firstCastSkill('arcanist', 20, { targetEffects: [effect('waterWeakness')] })).toBe('iceBolt');
    expect(firstCastSkill('arcanist', 20, { targetEffects: [effect('freeze')] })).toBe('arcane_blast');
    expect(firstCastSkill('arcanist', 20, { casterEffects: [effect('arcaneCharge')] })).toBe('arcane_blast');
    expect(firstCastSkill('arcanist', 20)).toBe('phase_prison');
    expect(firstCastSkill('arcanist', 40, { casterEffects: [effect('arcaneCharge')] })).toBe('arcane_supremacy');
    expect(firstCastSkill('pyromancer', 20, { targetEffects: [effect('burn')] })).toBe('combustion_bloom');
    expect(firstCastSkill('berserker', 20)).toBe('blood_magnet');
    expect(firstCastSkill('phantom_ranger', 20, { casterEffects: [effect('invisible')] })).toBe('umbra_mine');
    expect(firstCastSkill('phoenix_knight', 20)).toBe('cinder_halo');
    expect(firstCastSkill('evas_templar', 20, { casterEffects: [effect('poison')] })).toBe('tidal_barrier');
    expect(firstCastSkill('treasure_hunter', 20, { casterEffects: [effect('reveal_loot')] })).toBe('jackpot_snare');
    expect(firstCastSkill('plains_walker', 20, { targetEffects: [effect('poison')] })).toBe('razorwind_step');
    expect(firstCastSkill('hawkeye', 20, { targetEffects: [effect('marked')] })).toBe('ricochet_prism');
    expect(firstCastSkill('hawkeye', 20)).toBe('tripwire_volley');
    expect(firstCastSkill('hawkeye', 40, { targetEffects: [effect('marked')] })).toBe('aimed_volley');
    expect(firstCastSkill('templar_knight', 20)).toBe('guardian_hook');
    expect(firstCastSkill('cardinal', 20, { allyHealthFraction: 0.4 })).toBe('lifeline_swap');
    expect(firstCastSkill('cardinal', 20, { healthFraction: 0.7 })).toBe('greater_heal');
    expect(firstCastSkill('treasure_hunter', 20, { targetHealthFraction: 0.4 })).toBe('lucky_strike');
  });
});

describe('specialization AI simulator coverage', () => {
  it('runs every specialization PvE profile at spec and proficiency levels', () => {
    for (const scenario of pveSpecializationScenarios()) {
      const result = runPveScenario(scenario, 120_000);

      expect(result.timedOut, scenario.id).toBe(false);
      expect(result.summary.winnerTeamId, scenario.id).toBe('players');
    }
  });
});

function firstCastSkill(
  specializationId: SpecializationId,
  level: number,
  options: {
    targetEffects?: StatusEffect[];
    casterEffects?: StatusEffect[];
    targetHealthFraction?: number;
    healthFraction?: number;
    allyHealthFraction?: number;
  } = {},
): SkillId | undefined {
  const spec = SPECIALIZATIONS[specializationId];
  const player = createSimProfilePlayer({
    id: `${specializationId}-ai`,
    className: spec.baseClass,
    specializationId,
    level,
    position: { x: 0, z: 0 },
  });
  player.health = Math.floor(player.maxHealth * (options.healthFraction ?? 1));
  player.statusEffects = options.casterEffects ?? [];
  const target = createSimulatedEnemy('goblin', level, { id: `${specializationId}-target`, position: { x: 3, z: 0 }, healthMultiplier: 8 });
  target.health = Math.floor(target.maxHealth * (options.targetHealthFraction ?? 1));
  target.statusEffects = options.targetEffects ?? [];
  const allies = [player];
  if (options.allyHealthFraction !== undefined) {
    const ally = createSimProfilePlayer({
      id: `${specializationId}-ally`,
      className: spec.baseClass,
      specializationId,
      level,
      position: { x: 2, z: 0 },
    });
    ally.health = Math.floor(ally.maxHealth * options.allyHealthFraction);
    allies.push(ally);
  }
  const actions = createClassAiPolicy(spec.baseClass, specializationId)(contextFor(player, target, allies));
  return actions.find((action) => action.type === 'castSkill')?.skillId;
}

function contextFor(
  player: ReturnType<typeof createSimProfilePlayer>,
  target: ReturnType<typeof createSimulatedEnemy>,
  allies: ReturnType<typeof createSimProfilePlayer>[] = [player],
): PlayerAiContext {
  return {
    state: {} as PlayerAiContext['state'],
    player,
    now: NOW,
    deltaMs: 1000 / 30,
    teamId: 'players',
    hostiles: [target],
    allies,
    distanceTo: (entity) => distanceXZ(player.position, entity.position),
    teamFor: (entityId) => allies.some((ally) => ally.id === entityId) ? 'players' : entityId === target.id ? 'enemies' : null,
  };
}

function effect(type: StatusEffect['type']): StatusEffect {
  return {
    id: `${type}-effect`,
    type,
    value: 1,
    durationMs: 10_000,
    startTimeTs: NOW,
    sourceSkill: 'test',
  };
}
