import { SKILLS, type SkillDef, type SkillId } from '../../packages/content/skills.js';
import { getSpecializationById, PROFICIENCY_LEVEL } from '../../packages/content/specializations.js';
import type { VecXZ } from '../../packages/protocol/messages.js';
import { distanceXZ } from '../../packages/sim/geometry.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import { applySkillCostAndCooldown, hasEnoughMana, isSkillOnCooldown, type PlayerResourceUpdate } from './cooldowns.js';

export type CastRuleFailReason = 'cooldown' | 'nomana' | 'invalid' | 'outofrange';

export type CastRuleResult =
  | {
      ok: true;
      skillId: SkillId;
      skill: SkillDef;
    }
  | {
      ok: false;
      reason: CastRuleFailReason;
    };

export function validateCastRequest(
  caster: PlayerState,
  requestedSkillId: string,
  target: Enemy | PlayerState | null,
  targetPos: VecXZ | undefined,
  timestamp: number,
): CastRuleResult {
  const skillId = requestedSkillId as SkillId;
  const skill = SKILLS[skillId];

  if (!skill || !caster.isAlive || !caster.unlockedSkills.includes(skillId)) {
    return { ok: false, reason: 'invalid' };
  }

  const blocker = getCastBlocker(caster, skillId, skill, target, targetPos, timestamp);
  if (blocker) {
    return { ok: false, reason: blocker };
  }

  return { ok: true, skillId, skill };
}

export function canCast(
  caster: PlayerState,
  skill: { id: SkillId; range: number },
  target: Enemy | PlayerState | null,
  targetPos: VecXZ | undefined,
  timestamp: number,
): { canCast: boolean; reason?: CastRuleFailReason } {
  const skillDef = SKILLS[skill.id];
  if (!skillDef || !caster.isAlive) {
    return { canCast: false, reason: 'invalid' };
  }

  const blocker = getCastBlocker(caster, skill.id, skillDef, target ?? null, targetPos, timestamp);
  return blocker ? { canCast: false, reason: blocker } : { canCast: true };
}

export function applyCastResources(
  player: PlayerState,
  skillId: SkillId,
  skill: Pick<SkillDef, 'manaCost' | 'cooldownMs'>,
  now: number,
): PlayerResourceUpdate {
  return applySkillCostAndCooldown(player, skillId, skill, now);
}

function getCastBlocker(
  caster: PlayerState,
  skillId: SkillId,
  skill: SkillDef,
  target: Enemy | PlayerState | null,
  targetPos: VecXZ | undefined,
  timestamp: number,
): CastRuleFailReason | null {
  if (!hasEnoughMana(caster, skill)) {
    return 'nomana';
  }

  if (isSkillOnCooldown(caster, skillId, timestamp)) {
    return 'cooldown';
  }

  if (skill.requiresTarget && !target) {
    return 'invalid';
  }

  // §45.3 follow-up — spec passives like Bulwark widen specific
  // skills' cast ranges. Multiplies on top of the skill's stored
  // range; non-matching specs leave it alone.
  const effectiveRange = (skill.range ?? 0) * specRangeMultiplierFor(caster, skillId);
  if (isOutOfRange(caster, effectiveRange, target, targetPos)) {
    return 'outofrange';
  }

  return null;
}

function specRangeMultiplierFor(player: PlayerState, skillId: SkillId): number {
  if (!player.specializationId) return 1;
  const spec = getSpecializationById(player.specializationId);
  if (!spec) return 1;
  let mul = spec.specializationPassive.modifiers.rangeMultiplierBySkill?.[skillId] ?? 1;
  if (player.level >= PROFICIENCY_LEVEL) {
    mul *= spec.proficiencyPassive.modifiers.rangeMultiplierBySkill?.[skillId] ?? 1;
  }
  return mul;
}

function isOutOfRange(
  caster: PlayerState,
  range: number,
  target: Enemy | PlayerState | null,
  targetPos: VecXZ | undefined,
): boolean {
  if (!range) {
    return false;
  }

  const origin = { x: caster.position.x, z: caster.position.z };
  if (targetPos && distanceXZ(origin, targetPos) > range) {
    return true;
  }

  return Boolean(target && distanceXZ(origin, { x: target.position.x, z: target.position.z }) > range);
}
