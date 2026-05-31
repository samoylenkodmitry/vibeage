import type { SkillDef, SkillEffect, SkillEffectType } from '../../packages/content/skills.js';
import type { ReactionVfxFlavor, SkillReactionCondition } from '../../packages/content/skillReactions.js';
import type { Enemy, PlayerState, StatusEffect } from '../../packages/sim/entities.js';
import {
  emitPlayerUpdated,
  emitServerMessage,
  type OutboundEventSink,
} from '../transport/outboundEvents.js';
import { recomputePlayerStats } from '../players/playerStatsRefresh.js';

type Combatant = Enemy | PlayerState;

export type PreparedSkillReaction = {
  reactionId: string;
  flavor: ReactionVfxFlavor;
  damageMultiplier: number;
  consumeTargetEffect?: SkillEffectType;
  consumeCasterEffect?: SkillEffectType;
  effects: readonly SkillEffect[];
  casterEffects: readonly SkillEffect[];
};

export function prepareSkillReactions(
  skill: SkillDef,
  target: Combatant,
  caster: Combatant | null,
  now: number,
): PreparedSkillReaction[] {
  const prepared: PreparedSkillReaction[] = [];
  for (const reaction of skill.reactions ?? []) {
    if (!conditionMatches(reaction.condition, target, caster, now)) continue;
    const consumedTargetStacks = reaction.consumeTargetEffect
      ? activeEffectStacks(target, reaction.consumeTargetEffect, now)
      : 0;
    const consumedCasterStacks = reaction.consumeCasterEffect && caster
      ? activeEffectStacks(caster, reaction.consumeCasterEffect, now)
      : 0;
    if (reaction.consumeTargetEffect && consumedTargetStacks <= 0) continue;
    if (reaction.consumeCasterEffect && consumedCasterStacks <= 0) continue;

    const consumedStacks = consumedTargetStacks + consumedCasterStacks;
    const stackMultiplier = reaction.damageMultiplierPerConsumedStack
      ? 1 + reaction.damageMultiplierPerConsumedStack * consumedStacks
      : 1;

    prepared.push({
      reactionId: reaction.id,
      flavor: reaction.flavor,
      damageMultiplier: (reaction.damageMultiplier ?? 1) * stackMultiplier,
      consumeTargetEffect: reaction.consumeTargetEffect,
      consumeCasterEffect: reaction.consumeCasterEffect,
      effects: reaction.effects ?? [],
      casterEffects: reaction.casterEffects ?? [],
    });
  }
  return prepared;
}

export function reactionDamageMultiplier(reactions: readonly PreparedSkillReaction[]): number {
  return reactions.reduce((multiplier, reaction) => multiplier * reaction.damageMultiplier, 1);
}

export function applyPreparedSkillReactions(input: {
  target: Combatant;
  caster: Combatant | null;
  reactions: readonly PreparedSkillReaction[];
  outbound: OutboundEventSink;
  applyEffects: (target: Combatant, effects: readonly SkillEffect[]) => number;
}): number {
  const { target, caster, reactions, outbound, applyEffects } = input;
  if (reactions.length === 0) return 0;

  let healApplied = 0;
  let casterStatusChanged = false;

  for (const reaction of reactions) {
    // Tell clients a combo reaction fired here so they can play the flavored
    // burst — server-authoritative (the server decides when a reaction triggers).
    emitServerMessage(outbound, {
      type: 'ReactionTriggered',
      reactionId: reaction.reactionId,
      flavor: reaction.flavor,
      position: { x: target.position.x, y: target.position.y, z: target.position.z },
      targetId: target.id,
    });
    if (reaction.consumeTargetEffect) removeStatusEffectType(target, reaction.consumeTargetEffect);
    if (reaction.consumeCasterEffect && caster) {
      casterStatusChanged = removeStatusEffectType(caster, reaction.consumeCasterEffect) || casterStatusChanged;
    }
    if (reaction.effects.length > 0) {
      healApplied += applyEffects(target, reaction.effects);
    }
    if (reaction.casterEffects.length > 0 && caster) {
      applyEffects(caster, reaction.casterEffects);
      casterStatusChanged = true;
    }
  }

  if (casterStatusChanged && caster && !isEnemy(caster) && caster.id !== target.id) {
    emitServerMessage(outbound, {
      type: 'EffectSnapshot',
      targetId: caster.id,
      effects: caster.statusEffects,
    });
    emitPlayerUpdated(outbound, {
      id: caster.id,
      health: caster.health,
      isAlive: caster.isAlive,
      deathTimeTs: caster.deathTimeTs,
      statusEffects: caster.statusEffects,
      stats: caster.stats, maxHealth: caster.maxHealth, maxMana: caster.maxMana,
      position: caster.position,
    });
  }

  return healApplied;
}

function conditionMatches(
  condition: SkillReactionCondition,
  target: Combatant,
  caster: Combatant | null,
  now: number,
): boolean {
  if (condition.targetHasEffect && !hasActiveEffect(target, condition.targetHasEffect, now)) return false;
  if (condition.casterHasEffect && (!caster || !hasActiveEffect(caster, condition.casterHasEffect, now))) return false;
  if (condition.targetHealthBelowPct !== undefined && healthFraction(target) >= condition.targetHealthBelowPct) return false;
  if (condition.targetHealthAbovePct !== undefined && healthFraction(target) <= condition.targetHealthAbovePct) return false;
  if (condition.casterHealthBelowPct !== undefined && (!caster || healthFraction(caster) >= condition.casterHealthBelowPct)) return false;
  if (condition.casterHealthAbovePct !== undefined && (!caster || healthFraction(caster) <= condition.casterHealthAbovePct)) return false;
  return true;
}

function hasActiveEffect(entity: Combatant, type: SkillEffectType, now: number): boolean {
  return activeEffectStacks(entity, type, now) > 0;
}

function activeEffectStacks(entity: Combatant, type: SkillEffectType, now: number): number {
  let stacks = 0;
  for (const effect of entity.statusEffects ?? []) {
    if (effect.type !== type || !isActiveStatusEffect(effect, now)) continue;
    stacks += effect.stacks ?? 1;
  }
  return stacks;
}

function isActiveStatusEffect(effect: StatusEffect, now: number): boolean {
  return effect.durationMs <= 0 || effect.startTimeTs + effect.durationMs > now;
}

function healthFraction(entity: Combatant): number {
  if (entity.maxHealth <= 0) return 0;
  return Math.max(0, entity.health / entity.maxHealth);
}

function removeStatusEffectType(target: Combatant, effectType: string): boolean {
  const before = target.statusEffects?.length ?? 0;
  if (before === 0) return false;
  target.statusEffects = target.statusEffects.filter((effect) => effect.type !== effectType);
  const changed = target.statusEffects.length !== before;
  if (changed && !isEnemy(target)) recomputePlayerStats(target);
  return changed;
}

function isEnemy(target: Combatant): target is Enemy {
  return 'type' in target;
}
