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
      expect(profile.rules.length).toBeGreaterThan(0);
      for (const skillId of profile.rules.map((rule) => rule.skillId)) expect(SKILLS[skillId]).toBeDefined();
      for (const skillId of [...(spec.specSkills ?? []), ...(spec.proficiencySkills ?? [])]) {
        expect(ruleSkills.has(skillId), `${specId} AI should know ${skillId}`).toBe(true);
      }
    }
  });

  it('uses specialization-specific tactical choices', () => {
    expect(firstCastSkill('arcanist', 20, { targetEffects: [effect('waterWeakness')] })).toBe('iceBolt');
    expect(firstCastSkill('arcanist', 20, { targetEffects: [effect('freeze')] })).toBe('arcane_blast');
    expect(firstCastSkill('pyromancer', 20, { targetEffects: [effect('burn')] })).toBe('meteor');
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
  options: { targetEffects?: StatusEffect[]; targetHealthFraction?: number; healthFraction?: number } = {},
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
  const target = createSimulatedEnemy('goblin', level, { id: `${specializationId}-target`, position: { x: 3, z: 0 }, healthMultiplier: 8 });
  target.health = Math.floor(target.maxHealth * (options.targetHealthFraction ?? 1));
  target.statusEffects = options.targetEffects ?? [];
  const actions = createClassAiPolicy(spec.baseClass, specializationId)(contextFor(player, target));
  return actions.find((action) => action.type === 'castSkill')?.skillId;
}

function contextFor(player: ReturnType<typeof createSimProfilePlayer>, target: ReturnType<typeof createSimulatedEnemy>): PlayerAiContext {
  return {
    state: {} as PlayerAiContext['state'],
    player,
    now: NOW,
    deltaMs: 1000 / 30,
    teamId: 'players',
    hostiles: [target],
    allies: [player],
    distanceTo: (entity) => distanceXZ(player.position, entity.position),
    teamFor: (entityId) => entityId === player.id ? 'players' : entityId === target.id ? 'enemies' : null,
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
