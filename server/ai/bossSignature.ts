import {
  getMiniBossById,
  mechanicInnerRadius,
  mechanicOuterRadius,
  type MiniBossMechanic,
} from '../../packages/content/miniBosses.js';
import type { Enemy } from '../../packages/sim/entities.js';
import { killPlayer } from '../players/playerLifecycle.js';
import type { EnemyAIContext, EnemyAIProgress } from './enemyStateMachine.js';

/**
 * PR N + archwork #6 — uniform enrage / phase-shift progression
 * applied to every mini-boss spawn. Lives on the boss tick so the
 * encounter visibly escalates as it goes long or low-HP.
 */
export function tickBossProgression(enemy: Enemy, now: number, progress: EnemyAIProgress): void {
  const cfg = enemy.bossConfig;
  if (!cfg) return;
  const inCombat = enemy.aiState === 'chasing' || enemy.aiState === 'attacking';
  if (inCombat && enemy.combatStartedTs === undefined) {
    enemy.combatStartedTs = now;
  }
  if (!enemy.enraged && enemy.combatStartedTs !== undefined && now - enemy.combatStartedTs >= cfg.enrageAfterMs) {
    enemy.enraged = true;
    enemy.attackDamage = (enemy.baseAttackDamage ?? enemy.attackDamage) * effectiveDamageMul(enemy);
    progress.events.push({ type: 'log', message: `[BOSS] ${enemy.name} enrages — damage now ${enemy.attackDamage.toFixed(1)}` });
    progress.shouldBroadcastEnemyUpdate = true;
  }
  if (!enemy.phaseShifted && enemy.health < enemy.maxHealth * cfg.phaseTwoHpFraction) {
    enemy.phaseShifted = true;
    enemy.attackDamage = (enemy.baseAttackDamage ?? enemy.attackDamage) * effectiveDamageMul(enemy);
    enemy.movementSpeed = (enemy.baseMovementSpeed ?? enemy.movementSpeed) * cfg.phaseTwoSpeedMul;
    progress.events.push({ type: 'log', message: `[BOSS] ${enemy.name} phase 2 — speed ${enemy.movementSpeed.toFixed(1)}, damage ${enemy.attackDamage.toFixed(1)}` });
    progress.shouldBroadcastEnemyUpdate = true;
  }
}

function effectiveDamageMul(enemy: Enemy): number {
  const cfg = enemy.bossConfig;
  if (!cfg) return 1;
  let mul = 1;
  if (enemy.enraged) mul *= cfg.enragedDamageMul;
  if (enemy.phaseShifted) mul *= cfg.phaseTwoDamageMul;
  return mul;
}

export function resetBossProgression(enemy: Enemy): void {
  enemy.combatStartedTs = undefined;
  enemy.enraged = false;
  enemy.phaseShifted = false;
  enemy.signatureCastingUntilTs = undefined;
  enemy.signatureCastTargetX = undefined;
  enemy.signatureCastTargetZ = undefined;
  enemy.signatureCastRadius = undefined;
  enemy.signatureCastDirRad = undefined;
  enemy.signatureCastTargetPlayerId = undefined;
  enemy.nextSignatureReadyTs = undefined;
  if (enemy.baseAttackDamage !== undefined) enemy.attackDamage = enemy.baseAttackDamage;
  if (enemy.baseMovementSpeed !== undefined) enemy.movementSpeed = enemy.baseMovementSpeed;
}

/**
 * PR Q + archwork #6 — mini-boss telegraphed signature. One cast
 * per cooldown window when in attacking/chasing state. Wind-up
 * begins on entry; the visual telegraph is emitted on cast start
 * (client renders a growing ring / wedge); impact applies via the
 * standard enemyAttack channel so existing combat-log / damage-
 * number paths reuse. Mechanic kind controls the impact shape:
 * 'circle', 'donut', 'cone', or 'summonPack'.
 */
export function tickBossSignature(enemy: Enemy, context: EnemyAIContext, progress: EnemyAIProgress): void {
  if (!enemy.bossId) return;
  const spec = getMiniBossById(enemy.bossId);
  const mech = spec?.signatureAbility.mechanic;
  if (!spec || !mech) return;
  const outer = mechanicOuterRadius(mech);
  const inner = mechanicInnerRadius(mech);

  // Active cast → check for impact.
  if (enemy.signatureCastingUntilTs !== undefined) {
    if (context.now >= enemy.signatureCastingUntilTs) {
      resolveBossSignatureImpact(enemy, mech, spec.name, context, progress);
      enemy.signatureCastingUntilTs = undefined;
      enemy.signatureCastTargetX = undefined;
      enemy.signatureCastTargetZ = undefined;
      enemy.signatureCastRadius = undefined;
      enemy.signatureCastDirRad = undefined;
      enemy.signatureCastTargetPlayerId = undefined;
      enemy.nextSignatureReadyTs = context.now + mech.cooldownMs;
    }
    return;
  }

  // Idle / patrolling / returning: signature only fires in active combat.
  if (enemy.aiState !== 'attacking' && enemy.aiState !== 'chasing') return;

  // First sight of combat seeds the cooldown so the boss doesn't open
  // with the signature the very first tick.
  if (enemy.nextSignatureReadyTs === undefined) {
    enemy.nextSignatureReadyTs = context.now + Math.min(mech.cooldownMs, 4_000);
    return;
  }
  if (context.now < enemy.nextSignatureReadyTs) return;

  // Aim at the current target's position; if no target, skip.
  const target = enemy.targetId ? context.players[enemy.targetId] : null;
  if (!target?.isAlive) return;

  // Cone mechanics anchor the vertex at the BOSS's position at
  // cast start (the dragon's maw at the moment of channel).
  // Circle / donut mechanics anchor at the target's position.
  // Direction is locked toward the target at cast start; both
  // vertex and direction stay frozen through wind-up.
  const isCone = mech.kind === 'cone';
  const castX = isCone ? enemy.position.x : target.position.x;
  const castZ = isCone ? enemy.position.z : target.position.z;
  const dirRad = isCone
    ? Math.atan2(target.position.z - enemy.position.z, target.position.x - enemy.position.x)
    : undefined;

  enemy.signatureCastingUntilTs = context.now + mech.windUpMs;
  enemy.signatureCastTargetX = castX;
  enemy.signatureCastTargetZ = castZ;
  enemy.signatureCastRadius = outer;
  enemy.signatureCastDirRad = dirRad;
  // Blink mechanic also locks the target's id so the boss
  // reappears behind whoever was marked, not behind a later
  // aggro target.
  enemy.signatureCastTargetPlayerId = mech.kind === 'blink' ? target.id : undefined;
  progress.events.push({
    type: 'bossTelegraph',
    enemyId: enemy.id,
    bossName: spec.name,
    abilityName: spec.signatureAbility.name,
    x: castX,
    z: castZ,
    radius: outer,
    ...(inner > 0 ? { innerRadius: inner } : {}),
    ...(mech.kind === 'cone' ? { directionRad: dirRad, halfAngleDeg: mech.halfAngleDeg } : {}),
    windUpMs: mech.windUpMs,
    impactAt: context.now + mech.windUpMs,
  });
}

function resolveBossSignatureImpact(
  enemy: Enemy,
  mech: MiniBossMechanic,
  bossName: string,
  context: EnemyAIContext,
  progress: EnemyAIProgress,
): void {
  switch (mech.kind) {
    case 'summonPack':
      resolveSummonPackImpact(enemy, mech, bossName, progress);
      return;
    case 'blink':
      resolveBlinkImpact(enemy, mech, bossName, context, progress);
      return;
    case 'circle':
    case 'donut':
    case 'cone':
      resolveAreaImpact(enemy, mech, bossName, context, progress);
      return;
  }
}

function resolveSummonPackImpact(
  enemy: Enemy,
  mech: Extract<MiniBossMechanic, { kind: 'summonPack' }>,
  bossName: string,
  progress: EnemyAIProgress,
): void {
  // Non-damaging — emit the rally event for the enemyAI propagator.
  if (enemy.packId && enemy.targetId) {
    progress.events.push({
      type: 'summonPack',
      packId: enemy.packId,
      targetId: enemy.targetId,
      sourceEnemyId: enemy.id,
      radius: mech.summonRadius,
      bossName,
    });
  }
}

function resolveBlinkImpact(
  enemy: Enemy,
  mech: Extract<MiniBossMechanic, { kind: 'blink' }>,
  bossName: string,
  context: EnemyAIContext,
  progress: EnemyAIProgress,
): void {
  // Teleport behind the LOCKED target and apply single-target
  // backstab damage. "Behind" = far side of the target from the
  // boss's current position; degenerate cases (boss on top of
  // target) fall back to +X.
  const lockedId = enemy.signatureCastTargetPlayerId;
  const target = lockedId ? context.players[lockedId] : null;
  if (!target?.isAlive) return;
  const dx = target.position.x - enemy.position.x;
  const dz = target.position.z - enemy.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const ux = dist > 0.01 ? dx / dist : 1;
  const uz = dist > 0.01 ? dz / dist : 0;
  enemy.position = {
    x: target.position.x + ux * mech.teleportOffset,
    y: enemy.position.y,
    z: target.position.z + uz * mech.teleportOffset,
  };
  progress.shouldBroadcastEnemyUpdate = true;
  const damage = enemy.attackDamage * mech.damageMul;
  target.health -= damage;
  const killed = target.health <= 0 ? killPlayer(target, context.now) : false;
  progress.events.push({
    type: 'enemyAttack',
    enemyId: enemy.id,
    targetId: target.id,
    damage,
    targetHealth: target.health,
  });
  if (killed) {
    progress.events.push({
      type: 'playerKilled',
      message: `[BOSS] ${bossName}'s Veil Step killed ${target.id}`,
      update: pickPlayerKilledUpdate(target),
    });
  }
}

function resolveAreaImpact(
  enemy: Enemy,
  mech: Extract<MiniBossMechanic, { kind: 'circle' | 'donut' | 'cone' }>,
  bossName: string,
  context: EnemyAIContext,
  progress: EnemyAIProgress,
): void {
  // All area kinds anchor impact at the LOCKED cast-start position
  // (signatureCastTargetX/Z), so the server impact area lines up
  // with the client telegraph.
  const cx = enemy.signatureCastTargetX ?? enemy.position.x;
  const cz = enemy.signatureCastTargetZ ?? enemy.position.z;
  const outer = mechanicOuterRadius(mech);
  const inner = mechanicInnerRadius(mech);
  const dirRad = enemy.signatureCastDirRad;
  const halfAngleRad = mech.kind === 'cone' ? (mech.halfAngleDeg * Math.PI) / 180 : 0;
  const damage = enemy.attackDamage * mech.damageMul;
  for (const p of Object.values(context.players)) {
    if (!p.isAlive) continue;
    const dx = p.position.x - cx;
    const dz = p.position.z - cz;
    const distSq = dx * dx + dz * dz;
    if (distSq > outer * outer) continue;
    if (inner > 0 && distSq < inner * inner) continue;
    if (mech.kind === 'cone' && !insideConeWedge(dx, dz, dirRad, halfAngleRad)) continue;
    p.health -= damage;
    const killed = p.health <= 0 ? killPlayer(p, context.now) : false;
    progress.events.push({
      type: 'enemyAttack',
      enemyId: enemy.id,
      targetId: p.id,
      damage,
      targetHealth: p.health,
    });
    if (killed) {
      progress.events.push({
        type: 'playerKilled',
        message: `[BOSS] ${bossName}'s signature killed ${p.id}`,
        update: pickPlayerKilledUpdate(p),
      });
    }
  }
}

function insideConeWedge(dx: number, dz: number, dirRad: number | undefined, halfAngleRad: number): boolean {
  if (dirRad === undefined) return false;
  const playerAngle = Math.atan2(dz, dx);
  let delta = playerAngle - dirRad;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return Math.abs(delta) <= halfAngleRad;
}

function pickPlayerKilledUpdate(p: import('../../packages/sim/entities.js').PlayerState) {
  return {
    id: p.id,
    health: p.health,
    isAlive: p.isAlive,
    deathTimeTs: p.deathTimeTs,
    targetId: p.targetId,
    castingSkill: p.castingSkill,
    castingProgressMs: p.castingProgressMs,
  };
}
