import type { SkillId } from './skills.js';

export type CharacterClass = 'mage' | 'warrior' | 'healer' | 'ranger' | 'knight' | 'paladin' | 'rogue';

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

type PartialSkillProgression = Partial<Record<SkillId, SkillRequirement>>;

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
    skillProgression: completeProgression({
      fireball: { level: 1 },
      waterSplash: { level: 2, requiredSkills: ['fireball'] },
      iceBolt: { level: 3, requiredSkills: ['waterSplash'] },
      petrify: { level: 4, requiredSkills: ['iceBolt'] },
      smite: { level: 5, requiredSkills: ['fireball'] },
      dispel: { level: 6 },
    }),
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
    skillProgression: completeProgression({
      slash: { level: 1 },
      bash: { level: 3, requiredSkills: ['slash'] },
      taunt: { level: 4 },
      powerStrike: { level: 5, requiredSkills: ['slash'] },
      shieldWall: { level: 7 },
      fireball: { level: 6 },
    }),
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
    skillProgression: completeProgression({
      holyLight: { level: 1 },
      bless: { level: 3 },
      smite: { level: 4 },
      dispel: { level: 5 },
      waterSplash: { level: 2 },
      divineShield: { level: 7, requiredSkills: ['bless'] },
    }),
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
    skillProgression: completeProgression({
      arrowShot: { level: 1 },
      iceBolt: { level: 2 },
      poisonBlade: { level: 3 },
      volley: { level: 5, requiredSkills: ['arrowShot'] },
      evade: { level: 4 },
      rapidFire: { level: 7, requiredSkills: ['volley'] },
    }),
  },
  knight: {
    className: 'knight',
    description: 'Disciplined defenders trained to hold the line',
    baseStats: {
      healthMultiplier: 1.45,
      manaMultiplier: 0.6,
      damageMultiplier: 1.0,
      speedMultiplier: 0.95,
    },
    skillProgression: completeProgression({
      slash: { level: 1 },
      taunt: { level: 2 },
      bash: { level: 3, requiredSkills: ['slash'] },
      shieldWall: { level: 4 },
      powerStrike: { level: 5, requiredSkills: ['bash'] },
      smite: { level: 6 },
      divineShield: { level: 8, requiredSkills: ['shieldWall'] },
    }),
  },
  paladin: {
    className: 'paladin',
    description: 'Holy warriors who blend martial discipline with light magic',
    baseStats: {
      healthMultiplier: 1.2,
      manaMultiplier: 1.0,
      damageMultiplier: 1.0,
      speedMultiplier: 1.0,
    },
    skillProgression: completeProgression({
      slash: { level: 1 },
      holyLight: { level: 2 },
      smite: { level: 3, requiredSkills: ['slash'] },
      bless: { level: 4 },
      bash: { level: 5 },
      divineShield: { level: 7, requiredSkills: ['holyLight'] },
      dispel: { level: 6 },
    }),
  },
  rogue: {
    className: 'rogue',
    description: 'Agile striker who blends shadow with venom',
    baseStats: {
      healthMultiplier: 0.9,
      manaMultiplier: 0.9,
      damageMultiplier: 1.25,
      speedMultiplier: 1.25,
    },
    skillProgression: completeProgression({
      evade: { level: 1 },
      backstab: { level: 3 },
      poisonBlade: { level: 5, requiredSkills: ['backstab'] },
      slash: { level: 1 },
      iceBolt: { level: 4 },
      vanish: { level: 7, requiredSkills: ['evade'] },
    }),
  },
};

function completeProgression(progression: PartialSkillProgression): Record<SkillId, SkillRequirement> {
  return progression as Record<SkillId, SkillRequirement>;
}

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
