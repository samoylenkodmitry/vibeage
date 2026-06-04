import { describe, expect, it } from 'vitest';
import { GAME_ACTIONS } from '../packages/content/actions';
import { CLASS_SKILL_TREES } from '../packages/content/classes';
import { EQUIPMENT_SETS } from '../packages/content/equipmentSets';
import { EFFECT_SPECS } from '../packages/content/effects';
import { ENEMY_TEMPLATES } from '../packages/content/enemies';
import { ITEMS } from '../packages/content/items';
import { LOOT_TABLES } from '../packages/content/lootTables';
import { MINI_BOSSES } from '../packages/content/miniBosses';
import { QUEST_NPCS } from '../packages/content/npcs';
import { QUESTS } from '../packages/content/quests';
import { CHARACTER_RACES } from '../packages/content/races';
import { isPassiveSkill, SKILLS } from '../packages/content/skills';
import { SPECIALIZATIONS } from '../packages/content/specializations';
import { VENDORS } from '../packages/content/vendors';
import { GAME_ZONES } from '../packages/content/zones';
import { simPolicyProfiles } from '../server/sim/playerPolicies';
import { createSimReportContext } from '../server/sim/reportContext';

describe('sim report context', () => {
  it('captures the current content catalog shape for advisory reports', () => {
    const context = createSimReportContext({ commitSha: 'test-sha' });
    const snapshot = context.snapshot;

    expect(context.status).toBe('provisional');
    expect(snapshot.commitSha).toBe('test-sha');
    expect(snapshot.classes).toBe(Object.keys(CLASS_SKILL_TREES).length);
    expect(snapshot.specializations).toBe(Object.keys(SPECIALIZATIONS).length);
    expect(snapshot.skills).toBe(Object.keys(SKILLS).length);
    expect(snapshot.activeSkills).toBe(Object.values(SKILLS).filter((skill) => !isPassiveSkill(skill.id)).length);
    expect(snapshot.passiveSkills).toBe(Object.values(SKILLS).filter((skill) => isPassiveSkill(skill.id)).length);
    expect(snapshot.effects).toBe(Object.keys(EFFECT_SPECS).length);
    expect(snapshot.actions).toBe(Object.keys(GAME_ACTIONS).length);
    expect(snapshot.items).toBe(Object.keys(ITEMS).length);
    expect(snapshot.quests).toBe(Object.keys(QUESTS).length);
    expect(snapshot.enemies).toBe(Object.keys(ENEMY_TEMPLATES).length);
    expect(snapshot.zones).toBe(GAME_ZONES.length);
    expect(snapshot.npcs).toBe(Object.keys(QUEST_NPCS).length);
    expect(snapshot.vendors).toBe(Object.keys(VENDORS).length);
    expect(snapshot.lootTables).toBe(Object.keys(LOOT_TABLES).length);
    expect(snapshot.gearSets).toBe(Object.keys(EQUIPMENT_SETS).length);
    expect(snapshot.miniBosses).toBe(Object.keys(MINI_BOSSES).length);
    expect(snapshot.races).toBe(CHARACTER_RACES.length);
    expect(snapshot.simPolicyProfiles).toBe(simPolicyProfiles().length);
  });

  it('declares known simulator blind spots instead of presenting final balance truth', () => {
    const context = createSimReportContext();
    const warningIds = new Set(context.warnings.map((warning) => warning.id));

    expect(context.assumptions.join(' ')).toContain('not final balance approval');
    expect(warningIds).toContain('balance-provisional');
    expect(warningIds).toContain('feel-beat-scope');
    expect(warningIds).toContain('ai-policy-scope');
    expect(warningIds).toContain('progression-route-scope');
    expect(warningIds).toContain('group-scope');
  });
});
