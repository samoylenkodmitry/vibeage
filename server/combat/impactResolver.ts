import type { Server } from 'socket.io';
import { nanoid } from 'nanoid';
import type { SkillDef, SkillEffect } from '../../packages/content/skills.js';
import { SKILLS } from '../../packages/content/skills.js';
import { getDamage } from '../../packages/sim/combatMath.js';
import type { Enemy, PlayerState } from '../../shared/types.js';
import type { Cast } from './skillSystem.js';
import type { CombatWorld } from './worldContract.js';

type ImpactContext = {
  caster: PlayerState | null;
  skill: SkillDef;
  io: Server;
  world: CombatWorld;
};

export function resolveCastImpact(cast: Cast, io: Server, world: CombatWorld): void {
  const skill = SKILLS[cast.skillId];
  const targets = getTargetsInArea(cast, world);
  const caster = world.getPlayerById(cast.casterId);
  const damages = targets.map((target) => calculateDamage(skill, caster, cast.castId, target.id));
  const context = { caster, skill, io, world };

  targets.forEach((target, index) => {
    applyDamageToTarget(target, damages[index], context);
  });

  io.emit('msg', {
    type: 'CombatLog',
    castId: cast.castId,
    skillId: cast.skillId,
    casterId: cast.casterId,
    targets: targets.map((target) => target.id),
    damages,
  });
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
  const { caster, skill, io, world } = context;

  target.health = Math.max(0, target.health - damage);

  if (isEnemy(target) && damage > 0 && caster && target.isAlive) {
    target.targetId = caster.id;
    target.aiState = 'chasing';
  }

  applySkillEffects(target, skill);

  if (target.health <= 0 && target.isAlive && caster) {
    target.deathTimeTs = Date.now();
    world.onTargetDied(caster, target);
  }

  io.emit('msg', {
    type: 'EffectSnapshot',
    targetId: target.id,
    effects: target.statusEffects,
  });

  if (isEnemy(target)) {
    io.emit('enemyUpdated', target);
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

function isEnemy(target: Enemy | PlayerState): target is Enemy {
  return 'type' in target;
}
