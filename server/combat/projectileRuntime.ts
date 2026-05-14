import { SKILLS } from '../../packages/content/skills.js';
import { CastState, type VecXZ } from '../../packages/protocol/messages.js';
import { sweptCircleHit } from '../../packages/sim/collision.js';
import type { OutboundEventSink } from '../transport/outboundEvents.js';
import type { Cast } from './skillSystem.js';
import { emitCastSnapshot } from './castSnapshots.js';
import { resolveCastImpact } from './impactResolver.js';
import type { CombatWorld } from './worldContract.js';

export function updateTravelingCast(
  cast: Cast,
  dtSeconds: number,
  now: number,
  broadcastRateMs: number,
  outbound: OutboundEventSink,
  world: CombatWorld,
): void {
  if (!cast.pos || !cast.dir || !cast.speed) {
    return;
  }

  updateTrackedTarget(cast, world);

  const oldPos = { ...cast.pos };
  cast.pos.x += cast.dir.x * cast.speed * dtSeconds;
  cast.pos.z += cast.dir.z * cast.speed * dtSeconds;

  if (!cast.lastBroadcast || now - cast.lastBroadcast > broadcastRateMs) {
    emitCastSnapshot(outbound, cast);
    cast.lastBroadcast = now;
  }

  if (shouldImpact(cast, oldPos, world)) {
    cast.state = CastState.Impact;
    emitCastSnapshot(outbound, cast);
    resolveCastImpact(cast, outbound, world);
  }
}

function updateTrackedTarget(cast: Cast, world: CombatWorld): void {
  if (!cast.targetId || !cast.pos) {
    return;
  }

  const target = world.getEnemyById(cast.targetId);
  if (!target) {
    return;
  }

  cast.targetPos = { x: target.position.x, z: target.position.z };
  cast.dir = direction(cast.pos, cast.targetPos);
}

function shouldImpact(cast: Cast, oldPos: VecXZ, world: CombatWorld): boolean {
  const skill = SKILLS[cast.skillId];
  const maxRange = skill.range || 50;

  return reachedTarget(cast)
    || distance(cast.origin, cast.pos ?? cast.origin) > maxRange
    || hasProjectileHitTarget(cast, oldPos, world);
}

function hasProjectileHitTarget(cast: Cast, oldPos: VecXZ, world: CombatWorld): boolean {
  const skill = SKILLS[cast.skillId];
  const hitRadius = skill.projectile?.hitRadius || 0.5;

  for (const entity of world.getEntitiesInCircle(cast.pos ?? cast.origin, hitRadius * 2)) {
    if (entity.id === cast.casterId || !entity.isAlive || !world.getEnemyById(entity.id)) {
      continue;
    }

    const entityPos = { x: entity.position.x, z: entity.position.z };
    if (sweptCircleHit(oldPos, cast.pos ?? oldPos, entityPos, hitRadius)) {
      return true;
    }
  }

  return false;
}

export function reachedTarget(cast: Cast): boolean {
  if (!cast.pos || !cast.targetPos) {
    return false;
  }

  return distance(cast.pos, cast.targetPos) < 0.5;
}

function direction(from: VecXZ, to: VecXZ): VecXZ {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist === 0) {
    return { x: 0, z: 0 };
  }

  return { x: dx / dist, z: dz / dist };
}

function distance(a: VecXZ, b: VecXZ): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}
