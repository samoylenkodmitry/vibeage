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
  skillProgression: Partial<Record<SkillId, SkillRequirement>>;
}

export const CLASS_SKILL_TREES: Record<CharacterClass, ClassSkillTree> = {
  mage: {
    className: 'mage',
    description: 'Masters of elemental magic with high damage output but lower health',
    skillProgression: {
      fireball: { level: 1 },
      waterSplash: { level: 2, requiredSkills: ['fireball'] },
      iceBolt: { level: 3, requiredSkills: ['waterSplash'] },
      petrify: { level: 4, requiredSkills: ['iceBolt'] },
      smite: { level: 5, requiredSkills: ['fireball'] },
      dispel: { level: 6 },
      // PR PP — learnable class passives.
      passive_focus_mind: { level: 5 },
      passive_arcane_potency: { level: 8 },
    },
  },
  warrior: {
    className: 'warrior',
    description: 'Strong melee fighters with high health and defensive capabilities',
    skillProgression: {
      slash: { level: 1 },
      bash: { level: 3, requiredSkills: ['slash'] },
      taunt: { level: 4 },
      powerStrike: { level: 5, requiredSkills: ['slash'] },
      shieldWall: { level: 7 },
      fireball: { level: 6 },
      passive_toughness: { level: 5 },
      passive_brutality: { level: 8 },
    },
  },
  healer: {
    className: 'healer',
    description: 'Support characters focused on healing and buffs',
    skillProgression: {
      holyLight: { level: 1 },
      bless: { level: 3 },
      smite: { level: 4 },
      dispel: { level: 5 },
      waterSplash: { level: 2 },
      divineShield: { level: 7, requiredSkills: ['bless'] },
      passive_serene_mind: { level: 5 },
      passive_warding: { level: 8 },
    },
  },
  ranger: {
    className: 'ranger',
    description: 'Long-range attackers with high speed and moderate damage',
    skillProgression: {
      arrowShot: { level: 1 },
      iceBolt: { level: 2 },
      poisonBlade: { level: 3 },
      volley: { level: 5, requiredSkills: ['arrowShot'] },
      evade: { level: 4 },
      rapidFire: { level: 7, requiredSkills: ['volley'] },
      passive_keen_eye: { level: 5 },
      passive_swift_step: { level: 8 },
    },
  },
  knight: {
    className: 'knight',
    description: 'Disciplined defenders trained to hold the line',
    skillProgression: {
      slash: { level: 1 },
      taunt: { level: 2 },
      bash: { level: 3, requiredSkills: ['slash'] },
      shieldWall: { level: 4 },
      powerStrike: { level: 5, requiredSkills: ['bash'] },
      smite: { level: 6 },
      divineShield: { level: 8, requiredSkills: ['shieldWall'] },
      passive_armor_training: { level: 5 },
      passive_iron_grip: { level: 8 },
    },
  },
  paladin: {
    className: 'paladin',
    description: 'Holy warriors who blend martial discipline with light magic',
    skillProgression: {
      slash: { level: 1 },
      holyLight: { level: 2 },
      smite: { level: 3, requiredSkills: ['slash'] },
      bless: { level: 4 },
      bash: { level: 5 },
      divineShield: { level: 7, requiredSkills: ['holyLight'] },
      dispel: { level: 6 },
      passive_holy_aegis: { level: 5 },
      passive_radiant_focus: { level: 8 },
    },
  },
  rogue: {
    className: 'rogue',
    description: 'Agile striker who blends shadow with venom',
    skillProgression: {
      evade: { level: 1 },
      backstab: { level: 3 },
      poisonBlade: { level: 5, requiredSkills: ['backstab'] },
      slash: { level: 1 },
      iceBolt: { level: 4 },
      vanish: { level: 7, requiredSkills: ['evade'] },
      passive_shadow_grace: { level: 5 },
      passive_lethal_focus: { level: 8 },
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
