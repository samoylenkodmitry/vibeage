import { SKILLS } from '../../packages/content/skills.js';
import { CastState, type VecXZ } from '../../packages/protocol/messages.js';
import { sweptCircleHit } from '../../packages/sim/collision.js';
import type { Enemy } from '../../packages/sim/entities.js';
import { getEffectiveSkillRange } from '../../packages/sim/skillUpgrades.js';
import type { OutboundEventSink } from '../transport/outboundEvents.js';
import { findPhysicsFreezeEntryPoint } from '../physics/areaPhysics.js';
import type { Cast } from './skillSystem.js';
import { emitCastSnapshot } from './castSnapshots.js';
import { applyProjectileHit, resolveCastImpact } from './impactResolver.js';
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
  const nextPos = {
    x: cast.pos.x + cast.dir.x * cast.speed * dtSeconds,
    z: cast.pos.z + cast.dir.z * cast.speed * dtSeconds,
  };
  const freezeEntryPoint = findPhysicsFreezeEntryPoint(oldPos, nextPos, world.getActivePhysicsFields?.(), now);
  if (freezeEntryPoint) {
    cast.pos = freezeEntryPoint;
    emitCastSnapshot(outbound, cast);
    cast.lastBroadcast = now;
    return;
  }

  cast.pos = nextPos;

  if (!cast.lastBroadcast || now - cast.lastBroadcast > broadcastRateMs) {
    emitCastSnapshot(outbound, cast);
    cast.lastBroadcast = now;
  }

  // §45.5 — apply per-hit damage for piercing projectiles, then
  // decide whether to keep traveling or end the cast. Non-piercing
  // projectiles still go through the existing single-hit-then-impact
  // path below.
  const newHits = collectProjectileHits(cast, oldPos, world);
  const skill = SKILLS[cast.skillId];
  if (newHits.length > 0 && skill.projectile?.pierce) {
    cast.pierceHits = cast.pierceHits ?? [];
    for (const target of newHits) {
      applyProjectileHit(cast, target, outbound, world, now);
      cast.pierceHits.push(target.id);
    }
  }

  if (shouldImpact(cast, oldPos, world, newHits)) {
    cast.state = CastState.Impact;
    emitCastSnapshot(outbound, cast);
    resolveCastImpact(cast, outbound, world, now);
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

function shouldImpact(cast: Cast, oldPos: VecXZ, world: CombatWorld, newHits: ReadonlyArray<Enemy>): boolean {
  const skill = SKILLS[cast.skillId];
  const caster = world.getPlayerById(cast.casterId);
  const maxRange = skill.projectile?.maxRange ?? getEffectiveSkillRange(cast.skillId, caster ?? undefined) ?? 50;
  const outOfRange = distance(cast.origin, cast.pos ?? cast.origin) > maxRange;
  if (reachedTarget(cast) || outOfRange) return true;

  // Non-piercing projectile: any new hit ends the cast (legacy
  // single-hit-then-impact behaviour).
  if (!skill.projectile?.pierce) return newHits.length > 0;

  // Piercing projectile: end once we've hit our cap. `pierceHits`
  // is already updated with this tick's hits by the caller.
  const maxHits = skill.projectile.maxPierceHits ?? Number.POSITIVE_INFINITY;
  return (cast.pierceHits?.length ?? 0) >= maxHits;
}

function collectProjectileHits(cast: Cast, oldPos: VecXZ, world: CombatWorld): Enemy[] {
  const skill = SKILLS[cast.skillId];
  const hitRadius = skill.projectile?.hitRadius || 0.5;
  const already = new Set(cast.pierceHits ?? []);
  const hits: Enemy[] = [];
  for (const entity of world.getEntitiesInCircle(cast.pos ?? cast.origin, hitRadius * 2)) {
    if (entity.id === cast.casterId) continue;
    if (already.has(entity.id)) continue;
    const enemy = world.getEnemyById(entity.id);
    if (!enemy || !enemy.isAlive) continue;
    const entityPos = { x: enemy.position.x, z: enemy.position.z };
    if (sweptCircleHit(oldPos, cast.pos ?? oldPos, entityPos, hitRadius)) {
      hits.push(enemy);
    }
  }
  return hits;
}

function reachedTarget(cast: Cast): boolean {
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
