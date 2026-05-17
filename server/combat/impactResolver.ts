import { nanoid } from 'nanoid';
import type { SkillDef, SkillEffect } from '../../packages/content/skills.js';
import { SKILLS } from '../../packages/content/skills.js';
import { getDamage } from '../../packages/sim/combatMath.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import {
  emitEnemyUpdated,
  emitPlayerUpdated,
  emitServerMessage,
  type OutboundEventSink,
} from '../transport/outboundEvents.js';
import type { Cast } from './skillSystem.js';
import type { CombatWorld } from './worldContract.js';

type ImpactContext = {
  caster: PlayerState | null;
  skill: SkillDef;
  outbound: OutboundEventSink;
  world: CombatWorld;
};

const NEGATIVE_EFFECT_TYPES: ReadonlySet<string> = new Set([
  'slow',
  'stun',
  'burn',
  'poison',
  'dot',
  'freeze',
  'waterWeakness',
]);

const BENEFICIAL_EFFECT_TYPES: ReadonlySet<string> = new Set([
  'heal',
  'shield',
  'bless',
  'dispel',
  'evasion',
  'invisible',
]);

export function resolveCastImpact(cast: Cast, outbound: OutboundEventSink, world: CombatWorld): void {
  const skill = SKILLS[cast.skillId];
  const caster = world.getPlayerById(cast.casterId);
  const context = { caster, skill, outbound, world };

  const targets = resolveCastTargets(cast, world, skill, caster);
  // Compute caster buffs once for the whole cast rather than per-target
  // (matters for multi-target skills like volley / waterSplash).
  const blessMult = blessDamageMultiplier(caster);
  const damages = targets.map((target) => calculateDamage(skill, caster, blessMult, cast.castId, target.id));

  targets.forEach((target, index) => {
    applyCastToTarget(target, damages[index], context);
  });

  emitServerMessage(outbound, {
    type: 'CombatLog',
    castId: cast.castId,
    skillId: cast.skillId,
    casterId: cast.casterId,
    targets: targets.map((target) => target.id),
    damages,
  });
}

function isBeneficialOnly(skill: SkillDef): boolean {
  if (!skill.effects?.length) {
    return false;
  }
  return skill.effects.every((effect) => BENEFICIAL_EFFECT_TYPES.has(effect.type));
}

function resolveCastTargets(
  cast: Cast,
  world: CombatWorld,
  skill: SkillDef,
  caster: PlayerState | null,
): Array<Enemy | PlayerState> {
  if (caster && !cast.targetId && (!skill.area || skill.area <= 0) && isBeneficialOnly(skill)) {
    return [caster];
  }
  return getTargetsInArea(cast, world);
}

function calculateDamage(
  skill: SkillDef,
  caster: PlayerState | null | undefined,
  blessMult: number,
  castId?: string,
  targetId?: string,
): number {
  if (!skill?.dmg) {
    return 0;
  }

  const baseStats = caster?.stats || { dmgMult: 1, critChance: 0, critMult: 2 };

  const result = getDamage({
    caster: { ...baseStats, dmgMult: (baseStats.dmgMult ?? 1) * blessMult },
    skill: { base: skill.dmg, variance: 0.1 },
    seed: `${castId || nanoid()}:${targetId || nanoid()}`,
  });

  return result.dmg;
}

/**
 * Sum bless-style damage tilts active on the caster into a single
 * multiplier. effect.value is a percentage (Bless: 25 → +25%); the
 * helper converts to (1 + value/100).
 *
 * KNOWN ISSUE: upsertStatusEffect replaces existing effects of the
 * same type (instead of stacking), so the additive loop here is
 * unreachable today — at most one 'bless' is ever active. Keeping the
 * sum so a later stacking-policy fix (Section 8 L520) lights up
 * bless stacking without re-touching this code. Balance is currently
 * tuned around the non-stacking behaviour; fixing both at once needs
 * a dedicated balance pass.
 */
function blessDamageMultiplier(caster: PlayerState | null | undefined): number {
  if (!caster?.statusEffects?.length) return 1;
  const now = Date.now();
  let pct = 0;
  for (const effect of caster.statusEffects) {
    if (effect.type !== 'bless') continue;
    const expiresAt = (effect.startTimeTs ?? 0) + (effect.durationMs ?? 0);
    if (expiresAt <= now) continue;
    pct += effect.value ?? 0;
  }
  return 1 + pct / 100;
}

function getTargetsInArea(cast: Cast, world: CombatWorld): Array<Enemy | PlayerState> {
  const skill = SKILLS[cast.skillId];
  const targets: Array<Enemy | PlayerState> = [];
  const pos = cast.pos || cast.origin;

  if (cast.targetId) {
    const enemy = world.getEnemyById(cast.targetId);
    if (enemy?.isAlive) {
      targets.push(enemy);
    } else {
      // PvP: targetId can be another player. Damage / death flow
      // through the same Enemy|PlayerState path below.
      const otherPlayer = world.getPlayerById(cast.targetId);
      if (otherPlayer?.isAlive && otherPlayer.id !== cast.casterId) {
        targets.push(otherPlayer);
      }
    }
  }

  if (skill.area && skill.area > 0) {
    for (const entity of world.getEntitiesInCircle(pos, skill.area)) {
      if (entity.id !== cast.casterId && entity.isAlive && !targets.some((target) => target.id === entity.id)) {
        targets.push(entity);
      }
    }
  }

  return targets;
}

function applyCastToTarget(
  target: Enemy | PlayerState,
  damage: number,
  context: ImpactContext,
): void {
  const { caster, skill, outbound, world } = context;
  const incoming = absorbWithShield(target, damage);

  target.health = Math.max(0, target.health - incoming);

  // Damage-based aggro: don't retarget while a taunt is active — that
  // would let any other attacker break the taunt by hitting the mob,
  // defeating the whole point of the skill.
  if (isEnemy(target) && incoming > 0 && caster && target.isAlive && !isEntityTaunted(target)) {
    target.targetId = caster.id;
    target.aiState = 'chasing';
  }

  applySkillEffects(target, skill, caster);

  if (target.health <= 0 && target.isAlive && caster) {
    target.deathTimeTs = Date.now();
    world.onTargetDied(caster, target);
  }

  emitServerMessage(outbound, {
    type: 'EffectSnapshot',
    targetId: target.id,
    effects: target.statusEffects,
  });

  if (isEnemy(target)) {
    emitEnemyUpdated(outbound, target);
  } else {
    // PvP: broadcast the player's health change immediately so other
    // clients see the damage right away instead of waiting for the
    // next tick-pipeline snapshot.
    emitPlayerUpdated(outbound, {
      id: target.id,
      health: target.health,
      isAlive: target.isAlive,
      deathTimeTs: target.deathTimeTs,
      statusEffects: target.statusEffects,
    });
  }
}

function applySkillEffects(
  target: Enemy | PlayerState,
  skill: SkillDef,
  caster: PlayerState | null,
): void {
  target.statusEffects = target.statusEffects ?? [];

  for (const effect of skill.effects ?? []) {
    if (effect.type === 'heal') {
      applyHealEffect(target, effect);
      continue;
    }
    if (effect.type === 'dispel') {
      target.statusEffects = target.statusEffects.filter((existing) => !NEGATIVE_EFFECT_TYPES.has(existing.type));
      continue;
    }
    upsertStatusEffect(target, effect, skill.id);
    // Taunt: force the enemy to focus the caster for the duration of
    // the effect. Damage-based aggro (above) is suppressed while
    // isEntityTaunted is true, so the caster keeps the lock.
    if (effect.type === 'taunt' && isEnemy(target) && caster) {
      target.targetId = caster.id;
      target.aiState = 'chasing';
    }
  }
}

/**
 * True when the entity carries an active taunt effect. Currently used
 * to suppress damage-based retargeting in applyCastToTarget so a
 * taunted enemy stays glued to its taunter for the effect duration.
 */
export function isEntityTaunted(entity: Enemy | PlayerState, now: number = Date.now()): boolean {
  return (entity.statusEffects ?? []).some((effect) => {
    if (effect.type !== 'taunt') return false;
    const expiresAt = (effect.startTimeTs ?? 0) + (effect.durationMs ?? 0);
    return expiresAt > now;
  });
}

function applyHealEffect(target: Enemy | PlayerState, effect: SkillEffect): void {
  const max = isEnemy(target) ? target.maxHealth : target.maxHealth;
  target.health = Math.min(max, target.health + effect.value);
}

function upsertStatusEffect(target: Enemy | PlayerState, effect: SkillEffect, skillId: string): void {
  const durationMs = effect.durationMs ?? 0;
  if (!durationMs) {
    return;
  }

  const statusEffect = {
    id: nanoid(),
    type: effect.type,
    value: effect.value,
    durationMs,
    startTimeTs: Date.now(),
    sourceSkill: skillId,
  };

  const stacking = effect as SkillEffect & { stackable?: boolean; maxStacks?: number };
  target.statusEffects = target.statusEffects ?? [];
  const existingIndex = target.statusEffects.findIndex((existing) => existing.type === effect.type);
  if (existingIndex >= 0) {
    const existing = target.statusEffects[existingIndex];
    if (stacking.stackable && existing) {
      target.statusEffects[existingIndex] = {
        ...statusEffect,
        stacks: Math.min((existing.stacks ?? 1) + 1, stacking.maxStacks ?? 1),
      };
    } else {
      target.statusEffects[existingIndex] = statusEffect;
    }
  } else {
    target.statusEffects.push(stacking.stackable ? { ...statusEffect, stacks: 1 } : statusEffect);
  }
}

function absorbWithShield(target: Enemy | PlayerState, damage: number): number {
  if (damage <= 0) {
    return damage;
  }
  const effects = target.statusEffects;
  if (!effects?.length) {
    return damage;
  }
  let remaining = damage;
  for (const effect of effects) {
    if (effect.type !== 'shield' || effect.value <= 0) {
      continue;
    }
    const absorbed = Math.min(effect.value, remaining);
    effect.value -= absorbed;
    remaining -= absorbed;
    if (remaining <= 0) {
      break;
    }
  }
  target.statusEffects = effects.filter((effect) => effect.type !== 'shield' || effect.value > 0);
  return remaining;
}

function isEnemy(target: Enemy | PlayerState): target is Enemy {
  return 'type' in target;
}
