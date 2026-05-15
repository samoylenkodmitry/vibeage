import { nanoid } from 'nanoid';
import type { SkillDef, SkillEffect } from '../../packages/content/skills.js';
import { SKILLS } from '../../packages/content/skills.js';
import { getDamage } from '../../packages/sim/combatMath.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import {
  emitEnemyUpdated,
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

export function resolveCastImpact(cast: Cast, outbound: OutboundEventSink, world: CombatWorld): void {
  const skill = SKILLS[cast.skillId];
  const caster = world.getPlayerById(cast.casterId);
  const context = { caster, skill, outbound, world };

  if (caster && isSelfBuffSkill(skill)) {
    applySelfBuffSkill(caster, context);
    emitServerMessage(outbound, {
      type: 'CombatLog',
      castId: cast.castId,
      skillId: cast.skillId,
      casterId: cast.casterId,
      targets: [caster.id],
      damages: [0],
    });
    return;
  }

  const targets = getTargetsInArea(cast, world);
  const damages = targets.map((target) => calculateDamage(skill, caster, cast.castId, target.id));

  targets.forEach((target, index) => {
    applyDamageToTarget(target, damages[index], context);
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

function isSelfBuffSkill(skill: SkillDef): boolean {
  if (skill.requiresTarget) {
    return false;
  }
  if (!skill.effects?.length) {
    return false;
  }
  return skill.effects.every((effect) =>
    effect.type === 'heal' || effect.type === 'shield' || effect.type === 'bless'
    || effect.type === 'dispel' || effect.type === 'evasion' || effect.type === 'invisible',
  );
}

function applySelfBuffSkill(caster: PlayerState, context: ImpactContext): void {
  const { skill, outbound } = context;
  for (const effect of skill.effects ?? []) {
    if (effect.type === 'heal') {
      caster.health = Math.min(caster.maxHealth, caster.health + effect.value);
      continue;
    }
    if (effect.type === 'dispel') {
      caster.statusEffects = (caster.statusEffects ?? []).filter((existing) => !isNegativeEffect(existing.type));
      continue;
    }
    upsertStatusEffect(caster, effect, skill.id);
  }
  emitServerMessage(outbound, {
    type: 'EffectSnapshot',
    targetId: caster.id,
    effects: caster.statusEffects ?? [],
  });
}

const NEGATIVE_EFFECT_TYPES: ReadonlySet<string> = new Set([
  'slow',
  'stun',
  'burn',
  'poison',
  'dot',
  'freeze',
  'waterWeakness',
]);

function isNegativeEffect(type: string): boolean {
  return NEGATIVE_EFFECT_TYPES.has(type);
}

function upsertStatusEffect(target: Enemy | PlayerState, effect: SkillEffect, skillId: string): void {
  target.statusEffects = target.statusEffects ?? [];
  const durationMs = effect.durationMs ?? 0;
  if (!durationMs) {
    return;
  }
  const next = {
    id: nanoid(),
    type: effect.type,
    value: effect.value,
    durationMs,
    startTimeTs: Date.now(),
    sourceSkill: skillId,
  };
  const idx = target.statusEffects.findIndex((existing) => existing.type === effect.type);
  if (idx >= 0) {
    target.statusEffects[idx] = next;
  } else {
    target.statusEffects.push(next);
  }
}

function calculateDamage(skill: SkillDef, caster?: PlayerState | null, castId?: string, targetId?: string): number {
  if (!skill?.dmg) {
    return 10;
  }

  const result = getDamage({
    caster: caster?.stats || { dmgMult: 1, critChance: 0, critMult: 2 },
    skill: { base: skill.dmg, variance: 0.1 },
    seed: `${castId || nanoid()}:${targetId || nanoid()}`,
  });

  return result.dmg;
}

function getTargetsInArea(cast: Cast, world: CombatWorld): Array<Enemy | PlayerState> {
  const skill = SKILLS[cast.skillId];
  const targets: Array<Enemy | PlayerState> = [];
  const pos = cast.pos || cast.origin;

  if (cast.targetId) {
    const target = world.getEnemyById(cast.targetId);
    if (target?.isAlive) {
      targets.push(target);
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

function applyDamageToTarget(
  target: Enemy | PlayerState,
  damage: number,
  context: ImpactContext,
): void {
  const { caster, skill, outbound, world } = context;
  const incoming = absorbWithShield(target, damage);

  target.health = Math.max(0, target.health - incoming);

  if (isEnemy(target) && incoming > 0 && caster && target.isAlive) {
    target.targetId = caster.id;
    target.aiState = 'chasing';
  }

  applySkillEffects(target, skill);

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
  }
}

function applySkillEffects(target: Enemy | PlayerState, skill: SkillDef): void {
  target.statusEffects = target.statusEffects ?? [];

  for (const effect of skill.effects ?? []) {
    const durationMs = effect.durationMs ?? 0;
    if (!durationMs) {
      continue;
    }

    const statusEffect = {
      id: nanoid(),
      type: effect.type,
      value: effect.value,
      durationMs,
      startTimeTs: Date.now(),
      sourceSkill: skill.id,
    };

    const stacking = effect as SkillEffect & { stackable?: boolean; maxStacks?: number };
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
