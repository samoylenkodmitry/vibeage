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

export function isStatusActive(effect: StatusEffect, now: number): boolean {
  return effect.durationMs <= 0 || effect.startTimeTs + effect.durationMs > now;
}

export function activeStatus(target: Combatant, type: string, now: number): LinkedStatusEffect | null {
  return (target.statusEffects ?? []).find((effect): effect is LinkedStatusEffect => (
    effect.type === type && isStatusActive(effect, now)
  )) ?? null;
}

export function consumeStatus(target: Combatant, type: string, now: number): LinkedStatusEffect | null {
  const effect = activeStatus(target, type, now);
  if (!effect) return null;
  target.statusEffects = (target.statusEffects ?? []).filter((candidate) => candidate.id !== effect.id);
  return effect;
}

export function removeStatusTypes(target: Combatant, types: readonly string[], now: number): number {
  const removable = new Set(types);
  let activeRemovedCount = 0;
  target.statusEffects = (target.statusEffects ?? []).filter((effect) => {
    if (!removable.has(effect.type)) return true;
    if (isStatusActive(effect, now)) activeRemovedCount += 1;
    return false;
  });
  return activeRemovedCount;
}

export function healthFraction(entity: Combatant): number {
  if (entity.maxHealth <= 0) return 0;
  return Math.max(0, Math.min(1, entity.health / entity.maxHealth));
}

export function injuredAllies(
  world: CombatWorld,
  center: VecXZ,
  radius: number,
  limit = Number.POSITIVE_INFINITY,
): PlayerState[] {
  return alliedPlayers(world, center, radius)
    .filter((ally) => ally.health < ally.maxHealth)
    .sort((a, b) => healthFraction(a) - healthFraction(b))
    .slice(0, limit);
}

export function applyStatusToMany(
  targets: readonly Combatant[],
  status: Omit<StatusInput, 'target'>,
  outbound?: OutboundEventSink,
): void {
  for (const target of targets) {
    addStatus({ ...status, target });
    emitMaybe(outbound, target);
  }
}

export function damageHostilesInRadius(input: {
  caster: Combatant;
  world: CombatWorld;
  center: VecXZ;
  radius: number;
  rawDamage: number | ((target: Combatant, index: number) => number);
  cast: Cast;
  now: number;
  outbound?: OutboundEventSink;
  excludeIds?: readonly string[];
}): Combatant[] {
  const exclude = new Set(input.excludeIds ?? []);
  const targets = hostileEntities(input.caster, input.world, input.center, input.radius)
    .filter((target) => !exclude.has(target.id));
  targets.forEach((target, index) => {
    const rawDamage = typeof input.rawDamage === 'function' ? input.rawDamage(target, index) : input.rawDamage;
    applyCustomDamage({
      caster: input.caster,
      target,
      rawDamage,
      cast: input.cast,
      world: input.world,
      now: input.now,
      outbound: input.outbound,
    });
  });
  return targets;
}

export function healAlliesInRadius(input: {
  world: CombatWorld;
  center: VecXZ;
  radius: number;
  amount: number | ((target: PlayerState, index: number) => number);
  outbound?: OutboundEventSink;
  limit?: number;
}): PlayerState[] {
  const allies = alliedPlayers(input.world, input.center, input.radius)
    .sort((a, b) => healthFraction(a) - healthFraction(b))
    .slice(0, input.limit ?? Number.POSITIVE_INFINITY);
  allies.forEach((ally, index) => {
    const amount = typeof input.amount === 'function' ? input.amount(ally, index) : input.amount;
    healCombatant(ally, amount);
    emitMaybe(input.outbound, ally);
  });
  return allies;
}

export function spawnDecoy(
  caster: Combatant,
  world: CombatWorld,
  now: number,
  options: {
    position?: Combatant['position'];
    namePrefix?: string;
    healthMultiplier?: number;
  } = {},
): void {
  world.spawnMinion?.('goblin', caster.level, options.position ?? caster.position, now, {
    namePrefix: options.namePrefix ?? 'Decoy',
    healthMultiplier: options.healthMultiplier ?? 0.16,
    damageMultiplier: 0,
    experienceMultiplier: 0,
    lootTableIdOverride: '',
  });
}

export function spawnIllusionsAround(input: {
  caster: Combatant;
  world: CombatWorld;
  now: number;
  center: VecXZ;
  count: number;
  radius: number;
  namePrefix?: string;
}): void {
  for (let index = 0; index < input.count; index += 1) {
    const angle = (Math.PI * 2 * index) / Math.max(1, input.count);
    spawnDecoy(input.caster, input.world, input.now, {
      position: {
        x: input.center.x + Math.cos(angle) * input.radius,
        y: input.caster.position.y,
        z: input.center.z + Math.sin(angle) * input.radius,
      },
      namePrefix: input.namePrefix ?? 'Illusion',
      healthMultiplier: 0.13,
    });
  }
}

export function applyReflectWard(input: {
  target: Combatant;
  value: number;
  durationMs: number;
  cast: Cast;
  now: number;
  outbound?: OutboundEventSink;
  linkedTargetId?: string;
}): void {
  addStatus({
    target: input.target,
    type: 'damageReflect',
    value: input.value,
    durationMs: input.durationMs,
    sourceSkill: input.cast.skillId,
    now: input.now,
    sourceCasterId: input.cast.casterId,
    linkedTargetId: input.linkedTargetId,
  });
  emitMaybe(input.outbound, input.target);
}

export function applyStatusField(input: {
  caster: Combatant;
  world: CombatWorld;
  center: VecXZ;
  radius: number;
  statuses: readonly Omit<StatusInput, 'target' | 'sourceCasterId' | 'sourceSkill' | 'now'>[];
  cast: Cast;
  now: number;
  outbound?: OutboundEventSink;
}): Combatant[] {
  const targets = hostileEntities(input.caster, input.world, input.center, input.radius);
  for (const target of targets) {
    for (const status of input.statuses) {
      addStatus({ ...status, target, sourceSkill: input.cast.skillId, now: input.now, sourceCasterId: input.caster.id });
    }
    emitMaybe(input.outbound, target);
  }
  return targets;
}

export function chainDamage(input: {
  caster: Combatant;
  world: CombatWorld;
  start: Combatant;
  radius: number;
  maxTargets: number;
  rawDamage: number;
  falloff: number;
  cast: Cast;
  now: number;
  outbound?: OutboundEventSink;
}): Combatant[] {
  const candidates = hostileEntities(input.caster, input.world, input.start.position, input.radius)
    .sort((a, b) => distanceSq(a.position, input.start.position) - distanceSq(b.position, input.start.position))
    .slice(0, input.maxTargets);
  candidates.forEach((target, index) => applyCustomDamage({
    caster: input.caster,
    target,
    rawDamage: Math.max(0, input.rawDamage * (input.falloff ** index)),
    cast: input.cast,
    world: input.world,
    now: input.now,
    outbound: input.outbound,
  }));
  return candidates;
}

export function shieldAlliesInRadius(input: {
  caster: Combatant;
  world: CombatWorld;
  center: VecXZ;
  radius: number;
  value: number | ((ally: PlayerState, index: number) => number);
  durationMs: number;
  cast: Cast;
  now: number;
  outbound?: OutboundEventSink;
}): PlayerState[] {
  const allies = alliedPlayers(input.world, input.center, input.radius);
  allies.forEach((ally, index) => {
    const value = typeof input.value === 'function' ? input.value(ally, index) : input.value;
    addStatus({ target: ally, type: 'shield', value, durationMs: input.durationMs, sourceSkill: input.cast.skillId, now: input.now, sourceCasterId: input.caster.id });
    emitMaybe(input.outbound, ally);
  });
  return allies;
}

export function tauntHostilesInRadius(input: {
  caster: Combatant;
  world: CombatWorld;
  center: VecXZ;
  radius: number;
  durationMs: number;
  cast: Cast;
  now: number;
  outbound?: OutboundEventSink;
}): Combatant[] {
  const targets = hostileEntities(input.caster, input.world, input.center, input.radius);
  for (const target of targets) {
    forceEnemyChase(target, input.caster, input.now);
    addStatus({ target, type: 'taunt', value: 1, durationMs: input.durationMs, sourceSkill: input.cast.skillId, now: input.now, sourceCasterId: input.caster.id });
    emitMaybe(input.outbound, target);
  }
  return targets;
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

function distanceSq(a: VecXZ, b: VecXZ): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}
