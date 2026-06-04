import { nanoid } from 'nanoid';
import type { Enemy, PlayerState, StatusEffect } from '../../packages/sim/entities.js';
import type { VecXZ } from '../../packages/protocol/messages.js';
import type { Cast } from './skillSystem.js';
import type { CombatWorld } from './worldContract.js';
import { applyResolvedDamageToTarget } from './damageResolution.js';
import { emitCombatantUpdated } from './combatantUpdateEmitter.js';
import { emitServerMessage, type OutboundEventSink } from '../transport/outboundEvents.js';

export type Combatant = Enemy | PlayerState;

export type LinkedStatusEffect = StatusEffect & { linkedTargetId?: string };

export type StatusInput = {
  target: Combatant;
  type: string;
  value: number;
  durationMs: number;
  sourceSkill: string;
  now: number;
  sourceCasterId?: string;
  linkedTargetId?: string;
};

export type CustomDamageInput = {
  caster: Combatant;
  target: Combatant;
  rawDamage: number;
  cast: Cast;
  world: CombatWorld;
  now: number;
  outbound?: OutboundEventSink;
};

export function resolveCaster(cast: Cast, world: CombatWorld): Combatant | null {
  return world.getPlayerById(cast.casterId) ?? world.getEnemyById(cast.casterId);
}

export function targetOf(cast: Cast, world: CombatWorld): Combatant | null {
  return cast.targetId ? (world.getEnemyById(cast.targetId) ?? world.getPlayerById(cast.targetId)) : null;
}

export function impactCenter(cast: Cast, world: CombatWorld): VecXZ | null {
  const target = targetOf(cast, world);
  if (cast.target) return cast.target;
  if (cast.targetPos) return cast.targetPos;
  if (target) return { x: target.position.x, z: target.position.z };
  return cast.pos ?? cast.origin ?? null;
}

export function hostileEntities(caster: Combatant, world: CombatWorld, center: VecXZ, radius: number): Combatant[] {
  const casterIsEnemy = isEnemy(caster);
  return world.getEntitiesInCircle(center, radius).filter((entity) => (
    entity.id !== caster.id && entity.isAlive && isEnemy(entity) !== casterIsEnemy
  ));
}

export function alliedPlayers(world: CombatWorld, center: VecXZ, radius: number): PlayerState[] {
  return world.getEntitiesInCircle(center, radius)
    .filter((entity): entity is PlayerState => !isEnemy(entity) && entity.isAlive);
}

export function nearestHostile(
  caster: Combatant,
  world: CombatWorld,
  center: VecXZ,
  radius: number,
  excludeId?: string,
): Combatant | null {
  let nearest: Combatant | null = null;
  let bestDistSq = Infinity;
  for (const entity of hostileEntities(caster, world, center, radius)) {
    if (entity.id === excludeId) continue;
    const dx = entity.position.x - center.x;
    const dz = entity.position.z - center.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < bestDistSq) {
      nearest = entity;
      bestDistSq = distSq;
    }
  }
  return nearest;
}

export function addStatus(input: StatusInput): LinkedStatusEffect {
  const { target, type, value, durationMs, sourceSkill, now, sourceCasterId, linkedTargetId } = input;
  const fresh: LinkedStatusEffect = { id: nanoid(), type, value, durationMs, startTimeTs: now, sourceSkill };
  if (sourceCasterId) fresh.sourceCasterId = sourceCasterId;
  if (linkedTargetId) fresh.linkedTargetId = linkedTargetId;
  target.statusEffects = [...(target.statusEffects ?? []).filter((effect) => effect.type !== type), fresh];
  return fresh;
}

export function healCombatant(target: Combatant, amount: number): number {
  const before = target.health;
  target.health = Math.min(target.maxHealth, target.health + amount);
  return target.health - before;
}

export function moveCombatant(entity: Combatant, nextPos: Combatant['position'], world: CombatWorld): void {
  const oldPos = { x: entity.position.x, z: entity.position.z };
  entity.position = nextPos;
  entity.velocity = { x: 0, z: 0 };
  if (!isEnemy(entity)) entity.movement = undefined;
  entity.dirtySnap = true;
  world.moveEntity?.(entity.id, oldPos, { x: nextPos.x, z: nextPos.z });
}

export function swapCombatants(a: Combatant, b: Combatant, world: CombatWorld): void {
  const aPos = { ...a.position };
  moveCombatant(a, { ...b.position, y: a.position.y }, world);
  moveCombatant(b, { ...aPos, y: b.position.y }, world);
}

export function pullToward(entity: Combatant, center: VecXZ, maxDistance: number, world: CombatWorld): void {
  const dx = center.x - entity.position.x;
  const dz = center.z - entity.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= 0.01) return;
  const amount = Math.min(maxDistance, dist * 0.65);
  moveCombatant(entity, {
    x: entity.position.x + (dx / dist) * amount,
    y: entity.position.y,
    z: entity.position.z + (dz / dist) * amount,
  }, world);
}

export function pullIntoRange(
  entity: Combatant,
  center: VecXZ,
  keepDistance: number,
  maxDistance: number,
  world: CombatWorld,
): void {
  const dx = entity.position.x - center.x;
  const dz = entity.position.z - center.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= keepDistance || dist <= 0.01) return;
  const nextDist = Math.max(keepDistance, dist - maxDistance);
  moveCombatant(entity, {
    x: center.x + (dx / dist) * nextDist,
    y: entity.position.y,
    z: center.z + (dz / dist) * nextDist,
  }, world);
}

export function knockAway(entity: Combatant, origin: VecXZ, distance: number, world: CombatWorld): void {
  const dx = entity.position.x - origin.x;
  const dz = entity.position.z - origin.z;
  const len = Math.hypot(dx, dz);
  if (len <= 0.01) return;
  moveCombatant(entity, {
    x: entity.position.x + (dx / len) * distance,
    y: entity.position.y,
    z: entity.position.z + (dz / len) * distance,
  }, world);
}

export function blinkPast(caster: Combatant, target: Combatant, offset: number, world: CombatWorld): void {
  const dx = target.position.x - caster.position.x;
  const dz = target.position.z - caster.position.z;
  const dist = Math.hypot(dx, dz) || 1;
  moveCombatant(caster, {
    x: target.position.x + (dx / dist) * offset,
    y: caster.position.y,
    z: target.position.z + (dz / dist) * offset,
  }, world);
}

export function forceEnemyChase(target: Combatant, caster: Combatant, now: number): void {
  if (!isEnemy(target) || isEnemy(caster)) return;
  target.targetId = caster.id;
  target.aiState = 'chasing';
  target.chaseStartedAt = now;
  target.patrolTarget = undefined;
}

export function suppressEnemyAggro(target: Combatant, now: number, durationMs: number): void {
  if (!isEnemy(target)) return;
  target.targetId = null;
  target.aiState = 'idle';
  target.aggroSuppressedUntilTs = now + durationMs;
}

export function applyCustomDamage(input: CustomDamageInput): void {
  const { caster, target, rawDamage, cast, world, now, outbound } = input;
  const applied = applyResolvedDamageToTarget(target, rawDamage, now, { kind: 'none', source: caster, world });
  if (target.health <= 0 && target.isAlive) world.onTargetDied(caster, target, now);
  if (outbound) {
    emitServerMessage(outbound, {
      type: 'CombatLog',
      castId: cast.castId,
      skillId: cast.skillId,
      casterId: cast.casterId,
      targets: [target.id],
      damages: [applied],
      crits: [false],
      misses: [false],
      heals: [0],
    });
    emitCombatantUpdated(outbound, target);
  }
}

export function emitMaybe(outbound: OutboundEventSink | undefined, entity: Combatant): void {
  if (outbound) emitCombatantUpdated(outbound, entity);
}

export function isEnemy(entity: Combatant): entity is Enemy {
  return 'type' in entity;
}
