import type { SkillId } from './skills.js';

export type CharacterClass = 'mage' | 'warrior' | 'healer' | 'ranger';

export interface SkillRequirement {
  level: number;
  classType?: CharacterClass;
  requiredSkills?: SkillId[];
}

export interface ClassSkillTree {
  className: CharacterClass;
  description: string;
  baseStats: {
    healthMultiplier: number;
    manaMultiplier: number;
    damageMultiplier: number;
    speedMultiplier: number;
  };
  skillProgression: Record<SkillId, SkillRequirement>;
}

export const CLASS_SKILL_TREES: Record<CharacterClass, ClassSkillTree> = {
  mage: {
    className: 'mage',
    description: 'Masters of elemental magic with high damage output but lower health',
    baseStats: {
      healthMultiplier: 0.8,
      manaMultiplier: 1.3,
      damageMultiplier: 1.2,
      speedMultiplier: 0.9,
    },
    skillProgression: {
      fireball: { level: 1 },
      waterSplash: { level: 2, requiredSkills: ['fireball'] },
      iceBolt: { level: 3, requiredSkills: ['waterSplash'] },
      petrify: { level: 4, requiredSkills: ['iceBolt'] },
    },
  },
  warrior: {
    className: 'warrior',
    description: 'Strong melee fighters with high health and defensive capabilities',
    baseStats: {
      healthMultiplier: 1.3,
      manaMultiplier: 0.7,
      damageMultiplier: 1.1,
      speedMultiplier: 1.0,
    },
    skillProgression: {
      fireball: { level: 2 },
      waterSplash: { level: 4 },
      iceBolt: { level: 5 },
      petrify: { level: 3 },
    },
  },
  healer: {
    className: 'healer',
    description: 'Support characters focused on healing and buffs',
    baseStats: {
      healthMultiplier: 0.9,
      manaMultiplier: 1.2,
      damageMultiplier: 0.8,
      speedMultiplier: 1.0,
    },
    skillProgression: {
      fireball: { level: 4 },
      waterSplash: { level: 1 },
      iceBolt: { level: 3 },
      petrify: { level: 5 },
    },
  },
  ranger: {
    className: 'ranger',
    description: 'Long-range attackers with high speed and moderate damage',
    baseStats: {
      healthMultiplier: 0.9,
      manaMultiplier: 1.0,
      damageMultiplier: 1.1,
      speedMultiplier: 1.2,
    },
    skillProgression: {
      iceBolt: { level: 1 },
      fireball: { level: 2 },
      waterSplash: { level: 3 },
      petrify: { level: 4 },
    },
  },
};

export function canLearnSkill(
  skillId: SkillId,
  playerClass: CharacterClass,
  playerLevel: number,
  playerSkills: readonly SkillId[],
): boolean {
  const classTree = CLASS_SKILL_TREES[playerClass];
  const skillReq = classTree?.skillProgression[skillId];

  if (!skillReq || playerLevel < skillReq.level) {
    return false;
  }

  return skillReq.requiredSkills?.every((requiredSkill) => playerSkills.includes(requiredSkill)) ?? true;
}

export function getAvailableSkills(
  playerClass: CharacterClass,
  playerLevel: number,
  playerSkills: readonly SkillId[],
): SkillId[] {
  const classTree = CLASS_SKILL_TREES[playerClass];
  if (!classTree) {
    return [];
  }

  return Object.keys(classTree.skillProgression)
    .filter((skillId): skillId is SkillId => !playerSkills.includes(skillId as SkillId))
    .filter((skillId) => canLearnSkill(skillId, playerClass, playerLevel, playerSkills));
}
