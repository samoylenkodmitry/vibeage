import type { SkillDef } from '../../packages/content/skills.js';
import type { VecXZ } from '../../packages/protocol/messages.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import { shapeOrigin, shapeOuterRadius } from '../combat/abilityShapes.js';
import type { Cast } from '../combat/skillSystem.js';
import type { CombatWorld } from '../combat/worldContract.js';

export type AreaPhysicsFieldKind = 'timeStop';

export type AreaPhysicsField = {
  id: string;
  kind: AreaPhysicsFieldKind;
  sourceSkill: string;
  casterId: string;
  origin: VecXZ;
  radius: number;
  startTimeTs: number;
  durationMs: number;
  excludedEntityIds?: string[];
};

export type AreaPhysicsFieldStore = Record<string, AreaPhysicsField>;

type PhysicsEntity = Enemy | PlayerState;

export function createTimeStopFieldFromCast(
  cast: Cast,
  skill: SkillDef,
  world: CombatWorld,
  now: number,
): AreaPhysicsField | null {
  const effect = skill.effects?.find((candidate) => candidate.type === 'timeStop' && (candidate.durationMs ?? 0) > 0);
  if (!effect?.durationMs) {
    return null;
  }

  const radius = physicsRadius(skill);
  if (radius <= 0) {
    return null;
  }

  return {
    id: `${cast.castId}:timeStop`,
    kind: 'timeStop',
    sourceSkill: skill.id,
    casterId: cast.casterId,
    origin: physicsOrigin(cast, skill, world),
    radius,
    startTimeTs: now,
    durationMs: effect.durationMs,
    excludedEntityIds: [cast.casterId],
  };
}

export function addTimeStopFieldFromCast(cast: Cast, skill: SkillDef, world: CombatWorld, now: number): void {
  if (!world.addPhysicsField) {
    return;
  }
  const field = createTimeStopFieldFromCast(cast, skill, world, now);
  if (field) {
    world.addPhysicsField(field);
  }
}

export function activeAreaPhysicsFields(
  fields: AreaPhysicsFieldStore | readonly AreaPhysicsField[] | undefined,
  now: number,
): AreaPhysicsField[] {
  return areaPhysicsFieldValues(fields).filter((field) => isAreaPhysicsFieldActive(field, now));
}

export function pruneExpiredAreaPhysicsFields(fields: AreaPhysicsFieldStore | undefined, now: number): boolean {
  if (!fields) {
    return false;
  }

  let pruned = false;
  for (const [id, field] of Object.entries(fields)) {
    if (isAreaPhysicsFieldActive(field, now)) {
      continue;
    }
    delete fields[id];
    pruned = true;
  }
  return pruned;
}

export function isEntityPhysicsFrozen(
  entity: PhysicsEntity,
  fields: AreaPhysicsFieldStore | readonly AreaPhysicsField[] | undefined,
  now: number,
): boolean {
  return Boolean(getFreezingFieldAt(entity.position, fields, now, entity.id));
}

export function isPointPhysicsFrozen(
  pos: VecXZ,
  fields: AreaPhysicsFieldStore | readonly AreaPhysicsField[] | undefined,
  now: number,
  entityId?: string,
): boolean {
  return Boolean(getFreezingFieldAt(pos, fields, now, entityId));
}

export function isCastPhysicsFrozen(cast: Cast, world: CombatWorld, now: number): boolean {
  const fields = world.getActivePhysicsFields?.();
  if (!fields?.length) {
    return false;
  }

  const caster = world.getPlayerById(cast.casterId) ?? world.getEnemyById(cast.casterId);
  const castPos = cast.pos ?? (caster ? { x: caster.position.x, z: caster.position.z } : cast.origin);
  for (const field of activeAreaPhysicsFields(fields, now)) {
    if (isExcluded(field, cast.casterId)) {
      continue;
    }
    if (isWithinField(field, castPos)) {
      return true;
    }
    if (caster && isWithinField(field, caster.position)) {
      return true;
    }
  }
  return false;
}

export function freezeEntityPhysics(entity: PhysicsEntity, now: number): boolean {
  const hadVelocity = (entity.velocity?.x ?? 0) !== 0 || (entity.velocity?.z ?? 0) !== 0;
  if (hadVelocity) {
    entity.velocity = { x: 0, z: 0 };
    entity.dirtySnap = true;
  }
  if ('movement' in entity && entity.movement) {
    entity.movement.lastUpdateTime = now;
  }
  return hadVelocity;
}

function areaPhysicsFieldValues(fields: AreaPhysicsFieldStore | readonly AreaPhysicsField[] | undefined): AreaPhysicsField[] {
  if (!fields) {
    return [];
  }
  return Array.isArray(fields) ? [...fields] : Object.values(fields);
}

function getFreezingFieldAt(
  pos: VecXZ | { x: number; z: number },
  fields: AreaPhysicsFieldStore | readonly AreaPhysicsField[] | undefined,
  now: number,
  entityId?: string,
): AreaPhysicsField | null {
  for (const field of activeAreaPhysicsFields(fields, now)) {
    if (entityId && isExcluded(field, entityId)) {
      continue;
    }
    if (isWithinField(field, pos)) {
      return field;
    }
  }
  return null;
}

function isAreaPhysicsFieldActive(field: AreaPhysicsField, now: number): boolean {
  return field.startTimeTs + field.durationMs > now;
}

function isWithinField(field: AreaPhysicsField, pos: VecXZ | { x: number; z: number }): boolean {
  const dx = pos.x - field.origin.x;
  const dz = pos.z - field.origin.z;
  return dx * dx + dz * dz <= field.radius * field.radius;
}

function isExcluded(field: AreaPhysicsField, entityId: string): boolean {
  return field.excludedEntityIds?.includes(entityId) ?? false;
}

function physicsRadius(skill: SkillDef): number {
  if (skill.shape && skill.shape.kind !== 'single') {
    return shapeOuterRadius(skill.shape);
  }
  return skill.area ?? 0;
}

function physicsOrigin(cast: Cast, skill: SkillDef, world: CombatWorld): VecXZ {
  if (skill.shape && skill.shape.kind !== 'single') {
    return shapeOrigin(cast, skill.shape, world);
  }
  return cast.target ?? cast.targetPos ?? cast.pos ?? cast.origin;
}
