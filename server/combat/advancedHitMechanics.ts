import type { SkillDef } from '../../packages/content/skills.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import { applyResolvedDamageToTarget } from './damageResolution.js';
import type { CombatWorld } from './worldContract.js';
import { emitCombatantUpdated } from './combatantUpdateEmitter.js';
import type { OutboundEventSink } from '../transport/outboundEvents.js';

type Combatant = Enemy | PlayerState;

type ProjectileCaptureInput = {
  target: Combatant;
  caster: Combatant | null;
  skill: SkillDef;
  damage: number;
  world: CombatWorld;
  outbound: OutboundEventSink;
  now: number;
};

export function tryProjectileCapture(input: ProjectileCaptureInput): boolean {
  const { target, caster, skill, damage, world, outbound, now } = input;
  if (!skill.projectile || damage <= 0) return false;
  const effect = activeEffect(target, 'projectileCapture', now);
  if (!effect) return false;
  target.statusEffects = (target.statusEffects ?? []).filter((candidate) => candidate.id !== effect.id);
  if (caster?.isAlive) {
    applyResolvedDamageToTarget(caster, damage * 0.6, now, {
      kind: 'none',
      source: target,
      skipReflection: true,
      skipSoulLink: true,
      world,
    });
    if (caster.health <= 0 && caster.isAlive) world.onTargetDied(target, caster, now);
    emitCombatantUpdated(outbound, caster);
  }
  emitCombatantUpdated(outbound, target);
  return true;
}

function activeEffect(target: Combatant, type: string, now: number) {
  return (target.statusEffects ?? []).find((effect) => (
    effect.type === type && effect.startTimeTs + effect.durationMs > now
  )) ?? null;
}
