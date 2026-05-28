import { CLASS_SKILL_TREES, type CharacterClass } from '../../packages/content/classes.js';
import {
  PROFICIENCY_LEVEL,
  SPECIALIZATION_UNLOCK_LEVEL,
  SPECIALIZATIONS,
  type SpecializationId,
} from '../../packages/content/specializations.js';
import { classifySkill, SKILLS, type SkillId } from '../../packages/content/skills.js';
import { starterSkillsFor } from '../players/playerProgression.js';
import {
  createClassCombatPolicy,
  createSimulatedPlayer,
  type ClassCombatPolicyOptions,
  type PlayerAiPolicy,
  type SimulatedPlayerOptions,
} from './gameSimulator.js';

const CLASS_POLICY_OPTIONS: Record<CharacterClass, ClassCombatPolicyOptions> = {
  mage: { primarySkillId: 'fireball' },
  warrior: { primarySkillId: 'powerStrike' },
  healer: { primarySkillId: 'smite', healAtHealthFraction: 0.65 },
  ranger: { primarySkillId: 'arrowShot' },
  knight: { primarySkillId: 'powerStrike' },
  paladin: { primarySkillId: 'smite', healAtHealthFraction: 0.55 },
  rogue: { primarySkillId: 'backstab' },
};

const SPEC_PRIMARY_SKILL: Partial<Record<SpecializationId, SkillId>> = {
  arcanist: 'arcane_blast',
  pyromancer: 'meteor',
  berserker: 'rage',
  slayer: 'execute',
  cardinal: 'smite',
  theurge: 'smite',
  hawkeye: 'snipe',
  phantom_ranger: 'shadow_arrow',
  templar_knight: 'holy_shield',
  dark_avenger: 'shadow_strike',
  phoenix_knight: 'phoenix_ward',
  evas_templar: 'smite',
  treasure_hunter: 'lucky_strike',
  plains_walker: 'stalking_arrow',
};

export type SimPolicyProfile = {
  className: CharacterClass;
  specializationId?: SpecializationId;
};

export function createClassAiPolicy(
  className: CharacterClass,
  specializationId?: SpecializationId,
): PlayerAiPolicy {
  const options = { ...CLASS_POLICY_OPTIONS[className] };
  const specPrimary = specializationId ? SPEC_PRIMARY_SKILL[specializationId] : undefined;
  if (specPrimary && isHarmfulSkill(specPrimary)) {
    options.primarySkillId = specPrimary;
  }
  return createClassCombatPolicy(options);
}

export function createSimProfilePlayer(options: SimulatedPlayerOptions & SimPolicyProfile) {
  return createSimulatedPlayer({
    ...options,
    unlockedSkills: options.unlockedSkills ?? unlockedSkillsForSimProfile(options),
    specializationId: options.specializationId ?? null,
  });
}

export function unlockedSkillsForSimProfile(profile: SimPolicyProfile & { level?: number }): SkillId[] {
  const level = profile.level ?? 1;
  const unlocked = new Set<SkillId>(starterSkillsFor(profile.className));
  unlockClassTreeSkills(profile.className, level, unlocked);
  unlockSpecializationSkills(profile, level, unlocked);
  return [...unlocked];
}

export function simPolicyProfiles(): SimPolicyProfile[] {
  const classes = Object.keys(CLASS_SKILL_TREES) as CharacterClass[];
  return [
    ...classes.map((className) => ({ className })),
    ...Object.values(SPECIALIZATIONS).map((spec) => ({
      className: spec.baseClass,
      specializationId: spec.id,
    })),
  ];
}

function unlockClassTreeSkills(className: CharacterClass, level: number, unlocked: Set<SkillId>): void {
  const progression = CLASS_SKILL_TREES[className].skillProgression;
  let changed = true;
  while (changed) {
    changed = false;
    for (const [skillId, requirement] of Object.entries(progression)) {
      if (!requirement || requirement.level > level) continue;
      const id = skillId as SkillId;
      if (unlocked.has(id) || !hasPrerequisites(requirement.requiredSkills, unlocked)) continue;
      unlocked.add(id);
      changed = true;
    }
  }
}

function unlockSpecializationSkills(
  profile: SimPolicyProfile,
  level: number,
  unlocked: Set<SkillId>,
): void {
  if (!profile.specializationId) return;
  const spec = SPECIALIZATIONS[profile.specializationId];
  if (!spec || spec.baseClass !== profile.className) return;
  if (level >= SPECIALIZATION_UNLOCK_LEVEL) {
    for (const skillId of spec.specSkills ?? []) unlocked.add(skillId);
  }
  if (level >= PROFICIENCY_LEVEL) {
    for (const skillId of spec.proficiencySkills ?? []) unlocked.add(skillId);
  }
}

function hasPrerequisites(requiredSkills: readonly SkillId[] | undefined, unlocked: Set<SkillId>): boolean {
  return requiredSkills?.every((skillId) => unlocked.has(skillId)) ?? true;
}

function isHarmfulSkill(skillId: SkillId): boolean {
  const skill = SKILLS[skillId];
  return Boolean(skill && classifySkill(skill.effects) === 'harmful');
}
