import { SKILLS, type SkillDef, type SkillId } from '../../packages/content/skills.js';
import type { VecXZ } from '../../packages/protocol/messages.js';
import { distanceXZ } from '../../packages/sim/geometry.js';
import type { Enemy, PlayerState } from '../../shared/types.js';
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
  target: Enemy | null,
  targetPos: VecXZ | undefined,
  timestamp: number = Date.now(),
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
  target?: Enemy | null,
  targetPos?: VecXZ,
  timestamp: number = Date.now(),
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

export function applyCastCost(player: PlayerState, skillId: SkillId): PlayerState {
  const skill = SKILLS[skillId];
  if (!skill) return player;

  const updatedPlayer = {
    ...player,
    skillCooldownEndTs: { ...(player.skillCooldownEndTs ?? {}) },
  };

  applyCastResources(updatedPlayer, skillId, skill, Date.now());
  return updatedPlayer;
}

function getCastBlocker(
  caster: PlayerState,
  skillId: SkillId,
  skill: SkillDef,
  target: Enemy | null,
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

  if (isOutOfRange(caster, skill.range ?? 0, target, targetPos)) {
    return 'outofrange';
  }

  return null;
}

function isOutOfRange(
  caster: PlayerState,
  range: number,
  target: Enemy | null,
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
