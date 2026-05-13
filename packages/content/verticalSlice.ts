import { SKILLS, type SkillDef, type SkillId } from './skills.js';
import { GAME_ZONES, type Zone } from './zones.js';

export const STARTER_VERTICAL_SLICE = {
  zoneId: 'starter_meadow',
  className: 'mage',
  skillIds: ['fireball', 'waterSplash', 'iceBolt'],
  enemyTypes: ['goblin', 'wolf', 'skeleton', 'slime'],
  levelRange: { min: 1, max: 3 },
  loops: ['movement', 'combat', 'loot', 'leveling', 'respawn'],
} as const satisfies {
  zoneId: string;
  className: 'mage';
  skillIds: readonly SkillId[];
  enemyTypes: readonly string[];
  levelRange: { min: number; max: number };
  loops: readonly string[];
};

export type StarterVerticalSliceSkillId = typeof STARTER_VERTICAL_SLICE.skillIds[number];
export type StarterVerticalSliceEnemyType = typeof STARTER_VERTICAL_SLICE.enemyTypes[number];

export type StarterVerticalSliceContentReport = {
  isComplete: boolean;
  missingSkills: SkillId[];
  missingEnemyTypes: string[];
};

export function getStarterVerticalSliceZone(): Zone {
  const zone = GAME_ZONES.find((candidate) => candidate.id === STARTER_VERTICAL_SLICE.zoneId);
  if (!zone) {
    throw new Error(`Starter vertical slice zone not found: ${STARTER_VERTICAL_SLICE.zoneId}`);
  }

  return zone;
}

export function getStarterVerticalSliceSkills(): Array<SkillDef | undefined> {
  return STARTER_VERTICAL_SLICE.skillIds.map((skillId) => SKILLS[skillId]);
}

export function inspectStarterVerticalSliceContent(): StarterVerticalSliceContentReport {
  const zone = getStarterVerticalSliceZone();
  const zoneEnemyTypes = new Set(zone.mobs.map((mob) => mob.type));
  const missingSkills = STARTER_VERTICAL_SLICE.skillIds.filter((skillId) => !SKILLS[skillId]);
  const missingEnemyTypes = STARTER_VERTICAL_SLICE.enemyTypes.filter(
    (enemyType) => !zoneEnemyTypes.has(enemyType),
  );

  return {
    isComplete: missingSkills.length === 0 && missingEnemyTypes.length === 0,
    missingSkills,
    missingEnemyTypes,
  };
}
