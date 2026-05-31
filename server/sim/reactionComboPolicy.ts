import { classifySkill, SKILLS, type SkillEffectType, type SkillId } from '../../packages/content/skills.js';
import type { SkillReactionCondition } from '../../packages/content/skillReactions.js';
import { distanceXZ } from '../../packages/sim/geometry.js';
import type { PlayerAiContext, PlayerAiPolicy, SimEntity, SimulationAction } from './gameSimulator.js';

export type ReactionComboPolicyOptions = {
  primarySkillId: SkillId;
  fallbackSkillIds?: readonly SkillId[];
  desiredRangeFraction?: number;
};

export function createReactionComboPolicy(options: ReactionComboPolicyOptions): PlayerAiPolicy {
  return (context) => {
    if (context.player.castingSkill) return [];
    const target = nearestEntity(context.player, context.hostiles);
    if (!target) return [];
    const skillId = chooseComboSkill(context, target, options);
    return skillId ? engage(context, target, skillId, options.desiredRangeFraction) : [];
  };
}

function chooseComboSkill(
  context: PlayerAiContext,
  target: SimEntity,
  options: ReactionComboPolicyOptions,
): SkillId | null {
  const primary = options.primarySkillId;
  if (canAttemptSkill(context, primary)) {
    const setup = setupSkillForMissingReaction(context, target, primary);
    if (setup) return setup;
    return primary;
  }
  for (const fallback of options.fallbackSkillIds ?? []) {
    if (canAttemptSkill(context, fallback)) return fallback;
  }
  return context.player.unlockedSkills.find((skillId) => isReadyHarmful(context, skillId)) ?? null;
}

function setupSkillForMissingReaction(context: PlayerAiContext, target: SimEntity, payoffSkillId: SkillId): SkillId | null {
  const payoff = SKILLS[payoffSkillId];
  if (!payoff?.reactions?.length) return null;
  if (payoff.reactions.some((reaction) => reactionConditionSatisfied(reaction.condition, target, context.player, context.now))) {
    return null;
  }

  for (const reaction of payoff.reactions) {
    const targetEffect = reaction.condition.targetHasEffect;
    if (targetEffect && !hasActiveEffect(target, targetEffect, context.now)) {
      const setup = findReadySkillApplying(context, targetEffect, 'target');
      if (setup && setup !== payoffSkillId) return setup;
    }

    const casterEffect = reaction.condition.casterHasEffect;
    if (casterEffect && !hasActiveEffect(context.player, casterEffect, context.now)) {
      const setup = findReadySkillApplying(context, casterEffect, 'caster');
      if (setup && setup !== payoffSkillId) return setup;
    }
  }
  return null;
}

function reactionConditionSatisfied(
  condition: SkillReactionCondition,
  target: SimEntity,
  caster: SimEntity,
  now: number,
): boolean {
  if (condition.targetHasEffect && !hasActiveEffect(target, condition.targetHasEffect, now)) return false;
  if (condition.casterHasEffect && !hasActiveEffect(caster, condition.casterHasEffect, now)) return false;
  if (condition.targetHealthBelowPct !== undefined && healthFraction(target) >= condition.targetHealthBelowPct) return false;
  if (condition.targetHealthAbovePct !== undefined && healthFraction(target) <= condition.targetHealthAbovePct) return false;
  if (condition.casterHealthBelowPct !== undefined && healthFraction(caster) >= condition.casterHealthBelowPct) return false;
  if (condition.casterHealthAbovePct !== undefined && healthFraction(caster) <= condition.casterHealthAbovePct) return false;
  return true;
}

function findReadySkillApplying(
  context: PlayerAiContext,
  effectType: SkillEffectType,
  recipient: 'target' | 'caster',
): SkillId | null {
  for (const skillId of context.player.unlockedSkills) {
    const skill = SKILLS[skillId];
    if (!skill?.effects.some((effect) => effect.type === effectType)) continue;
    if (recipient === 'target' && classifySkill(skill.effects) !== 'harmful') continue;
    if (recipient === 'caster' && classifySkill(skill.effects) === 'harmful') continue;
    if (canAttemptSkill(context, skillId)) return skillId;
  }
  return null;
}

function engage(
  context: PlayerAiContext,
  target: SimEntity,
  skillId: SkillId,
  desiredRangeFraction = 0.8,
): SimulationAction[] {
  const skill = SKILLS[skillId];
  const targetCast = Boolean(skill?.requiresTarget || classifySkill(skill?.effects ?? []) === 'harmful');
  if (targetCast) {
    const range = skillRange(skillId);
    if (context.distanceTo(target) > range) {
      return [{ type: 'moveTo', targetPos: approachPoint(context.player.position, target.position, range, desiredRangeFraction) }];
    }
  }
  const actions: SimulationAction[] = [];
  if (context.player.movement?.isMoving) actions.push({ type: 'stopMoving' });
  if (targetCast) actions.push({ type: 'setTarget', targetId: target.id });
  actions.push({ type: 'castSkill', skillId, targetId: targetCast ? target.id : undefined, force: targetCast && !isEnemy(target) });
  return actions;
}

function canAttemptSkill(context: PlayerAiContext, skillId: SkillId): boolean {
  const skill = SKILLS[skillId];
  if (!skill || !context.player.unlockedSkills.includes(skillId)) return false;
  if ((context.player.skillCooldownEndTs[skillId] ?? 0) > context.now) return false;
  return context.player.mana >= skill.manaCost;
}

function isReadyHarmful(context: PlayerAiContext, skillId: SkillId): boolean {
  const skill = SKILLS[skillId];
  return Boolean(skill && classifySkill(skill.effects) === 'harmful' && canAttemptSkill(context, skillId));
}

function skillRange(skillId: SkillId): number {
  const skill = SKILLS[skillId];
  return Math.max(1, skill?.range ?? skill?.projectile?.maxRange ?? 1);
}

function hasActiveEffect(entity: SimEntity, type: SkillEffectType, now: number): boolean {
  return (entity.statusEffects ?? []).some((effect) => (
    effect.type === type && (effect.durationMs <= 0 || effect.startTimeTs + effect.durationMs > now)
  ));
}

function healthFraction(entity: SimEntity): number {
  if (entity.maxHealth <= 0) return 0;
  return Math.max(0, entity.health / entity.maxHealth);
}

function nearestEntity(origin: SimEntity, candidates: readonly SimEntity[]): SimEntity | null {
  let nearest: SimEntity | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = distanceXZ(origin.position, candidate.position);
    if (distance < bestDistance) {
      nearest = candidate;
      bestDistance = distance;
    }
  }
  return nearest;
}

function approachPoint(
  from: { x: number; z: number },
  target: { x: number; z: number },
  range: number,
  desiredRangeFraction: number,
) {
  const distance = distanceXZ(from, target);
  if (distance <= 0.001) return { x: target.x, z: target.z };
  const desired = Math.max(0.5, range * desiredRangeFraction);
  const keep = Math.min(distance, desired);
  return {
    x: target.x + ((from.x - target.x) / distance) * keep,
    z: target.z + ((from.z - target.z) / distance) * keep,
  };
}

function isEnemy(target: SimEntity): boolean {
  return 'type' in target;
}
