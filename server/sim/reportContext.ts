import { GAME_ACTIONS } from '../../packages/content/actions.js';
import { BOSS_GEAR_SETS } from '../../packages/content/bossGear.js';
import { CLASS_SKILL_TREES } from '../../packages/content/classes.js';
import { EFFECT_SPECS } from '../../packages/content/effects.js';
import { ENEMY_TEMPLATES } from '../../packages/content/enemies.js';
import { ITEMS } from '../../packages/content/items.js';
import { LOOT_TABLES } from '../../packages/content/lootTables.js';
import { MINI_BOSSES } from '../../packages/content/miniBosses.js';
import { QUEST_NPCS } from '../../packages/content/npcs.js';
import { QUESTS } from '../../packages/content/quests.js';
import { CHARACTER_RACES } from '../../packages/content/races.js';
import { isPassiveSkill, SKILLS } from '../../packages/content/skills.js';
import { SPECIALIZATIONS } from '../../packages/content/specializations.js';
import { VENDORS } from '../../packages/content/vendors.js';
import { GAME_ZONES } from '../../packages/content/zones.js';
import { simPolicyProfiles } from './playerPolicies.js';

export type SimReportStatus = 'provisional';

export type SimContentSnapshot = {
  commitSha: string;
  classes: number;
  specializations: number;
  skills: number;
  activeSkills: number;
  passiveSkills: number;
  effects: number;
  actions: number;
  items: number;
  quests: number;
  enemies: number;
  zones: number;
  npcs: number;
  vendors: number;
  lootTables: number;
  gearSets: number;
  miniBosses: number;
  races: number;
  simPolicyProfiles: number;
};

export type SimCoverageWarning = {
  id: string;
  severity: 'info' | 'warning';
  message: string;
};

export type SimReportContext = {
  status: SimReportStatus;
  snapshot: SimContentSnapshot;
  assumptions: string[];
  warnings: SimCoverageWarning[];
};

export function createSimReportContext(options: { commitSha?: string } = {}): SimReportContext {
  return {
    status: 'provisional',
    snapshot: createContentSnapshot(options.commitSha ?? 'unknown'),
    assumptions: [
      'Use this report as a regression and coverage instrument, not final balance approval.',
      'Mechanics/smoke failures are actionable; balance and feel scores are advisory while classes, skills, items, and quests are still changing.',
      'Rows compare deterministic AI policies under fixed scenario assumptions, so player creativity and route choice are intentionally outside this layer.',
    ],
    warnings: coverageWarnings(),
  };
}

function createContentSnapshot(commitSha: string): SimContentSnapshot {
  const skills = Object.values(SKILLS);
  return {
    commitSha,
    classes: Object.keys(CLASS_SKILL_TREES).length,
    specializations: Object.keys(SPECIALIZATIONS).length,
    skills: skills.length,
    activeSkills: skills.filter((skill) => !isPassiveSkill(skill.id)).length,
    passiveSkills: skills.filter((skill) => isPassiveSkill(skill.id)).length,
    effects: Object.keys(EFFECT_SPECS).length,
    actions: Object.keys(GAME_ACTIONS).length,
    items: Object.keys(ITEMS).length,
    quests: Object.keys(QUESTS).length,
    enemies: Object.keys(ENEMY_TEMPLATES).length,
    zones: GAME_ZONES.length,
    npcs: Object.keys(QUEST_NPCS).length,
    vendors: Object.keys(VENDORS).length,
    lootTables: Object.keys(LOOT_TABLES).length,
    gearSets: Object.keys(BOSS_GEAR_SETS).length,
    miniBosses: Object.keys(MINI_BOSSES).length,
    races: CHARACTER_RACES.length,
    simPolicyProfiles: simPolicyProfiles().length,
  };
}

function coverageWarnings(): SimCoverageWarning[] {
  return [
    {
      id: 'balance-provisional',
      severity: 'warning',
      message: 'Class, skill, item, and quest catalogs are not final; do not tune production balance from these numbers alone.',
    },
    {
      id: 'feel-beat-scope',
      severity: 'warning',
      message: 'Player-feel cadence counts unlocks and availability, but not quest completion, item upgrades, gold milestones, crafting progress, exploration, reputation, rare drops, or social goals yet.',
    },
    {
      id: 'ai-policy-scope',
      severity: 'info',
      message: 'Class/spec AI policies are deterministic approximations for repeatable tests, not final human rotations.',
    },
    {
      id: 'progression-route-scope',
      severity: 'info',
      message: 'Progression time currently uses same-level kill loops plus fixed overhead, not a full quest route with travel, vendor, inventory, death, and mob-mix decisions.',
    },
    {
      id: 'group-scope',
      severity: 'info',
      message: 'PvP/PvE group, party, clan, economy, and market behaviors are not modeled in this first simulator layer.',
    },
  ];
}
