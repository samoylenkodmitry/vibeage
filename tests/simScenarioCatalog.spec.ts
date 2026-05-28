import { describe, expect, it } from 'vitest';
import { SPECIALIZATIONS } from '../packages/content/specializations';
import {
  gearSetMilestones,
  pveClassScenarios,
  pveSpecializationScenarios,
  pvpClassScenarios,
  questRewardMilestones,
  runPveScenario,
  runPvpScenario,
  SIM_LEVEL_CHECKPOINTS,
} from '../server/sim/scenarioCatalog';
import { createClassAiPolicy, createSimProfilePlayer, unlockedSkillsForSimProfile } from '../server/sim/playerPolicies';

describe('sim scenario catalog', () => {
  it('covers every class at every checkpoint for PvE', () => {
    const scenarios = pveClassScenarios();
    const classes = new Set(scenarios.map((scenario) => scenario.className));

    expect(classes).toEqual(new Set(['mage', 'warrior', 'healer', 'ranger', 'knight', 'paladin', 'rogue']));
    expect(scenarios).toHaveLength(classes.size * SIM_LEVEL_CHECKPOINTS.length);
  });

  it('covers every specialization at spec and proficiency levels', () => {
    const scenarios = pveSpecializationScenarios();
    const specs = new Set(scenarios.map((scenario) => scenario.specializationId));

    expect(specs).toEqual(new Set(Object.keys(SPECIALIZATIONS)));
    expect(scenarios).toHaveLength(Object.keys(SPECIALIZATIONS).length * 2);
  });

  it('unlocks profile skills for class and specialization simulations', () => {
    const unlocked = unlockedSkillsForSimProfile({ className: 'mage', specializationId: 'pyromancer', level: 40 });

    expect(unlocked).toContain('fireball');
    expect(unlocked).toContain('meteor');
    expect(unlocked).toContain('inferno_aura');
  });

  it('runs representative catalog scenarios', () => {
    const pve = runPveScenario(pveClassScenarios()[0]);
    const pvp = runPvpScenario(pvpClassScenarios()[0]);

    expect(pve.timedOut).toBe(false);
    expect(pve.summary.winnerTeamId).not.toBeNull();
    expect(pvp.timedOut).toBe(false);
    expect(pvp.summary.winnerTeamId).not.toBeNull();
  });

  it('builds AI-controlled profile players', () => {
    const player = createSimProfilePlayer({
      id: 'policy-player',
      className: 'paladin',
      specializationId: 'evas_templar',
      level: 20,
    });
    const policy = createClassAiPolicy(player.className, 'evas_templar');

    expect(player.specializationId).toBe('evas_templar');
    expect(player.unlockedSkills).toContain('sacred_pulse');
    expect(policy).toBeTypeOf('function');
  });

  it('summarizes quest rewards and gear sets for progression reports', () => {
    const questMilestones = questRewardMilestones();
    const gearMilestones = gearSetMilestones();

    expect(questMilestones[0].totalXp).toBeGreaterThan(0);
    expect(questMilestones[0].totalGold).toBeGreaterThan(0);
    expect(gearMilestones.length).toBeGreaterThan(0);
    expect(gearMilestones.every((set) => set.pieces.length > 0)).toBe(true);
  });
});
