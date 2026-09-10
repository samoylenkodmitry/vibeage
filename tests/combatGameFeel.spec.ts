import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { claimDamageNumberLane, resetDamageNumberLanes } from '../apps/client/src/damageNumberLanes';
import { sampleNumberMotion } from '../apps/client/src/damageNumberMotion';
import { formatDamageAmount } from '../apps/client/src/damageNumberTexture';
import { createCameraKick, sampleCameraKick, isCameraHitStopped } from '../apps/client/src/cameraRig';
import { dangerHeartbeatMs, dangerLevel, dangerOpacity, screenAngleFromWorldDirection } from '../apps/client/src/combatFeelScreen';
import { emitCombatImpact, resetCombatImpacts, severityFromDamage, subscribeCombatImpacts, type CombatImpact } from '../apps/client/src/combatFeel';

describe('damage number lanes', () => {
  beforeEach(resetDamageNumberLanes);

  it('stacks a flurry into distinct lanes instead of one blob', () => {
    const lanes = [0, 20, 40, 60].map((offset) => claimDamageNumberLane(1_000 + offset));
    const positions = lanes.map((lane) => `${lane.offsetX}:${lane.offsetY}`);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('staggers each lane in time so the fan unrolls', () => {
    claimDamageNumberLane(1_000);
    const second = claimDamageNumberLane(1_020);
    expect(second.delay).toBeGreaterThan(0);
  });

  it('resets to the centre lane once numbers stop overlapping', () => {
    claimDamageNumberLane(1_000);
    const far = claimDamageNumberLane(9_000);
    expect(far.offsetX).toBe(0);
    expect(far.offsetY).toBe(0);
    expect(far.delay).toBe(0);
  });
});

describe('damage number read', () => {
  it('sigils separate taken / dealt / gained without relying on colour', () => {
    expect(formatDamageAmount(12, 'outgoing')).toBe('12');
    expect(formatDamageAmount(12, 'incoming')).toBe('-12');
    expect(formatDamageAmount(12, 'heal')).toBe('+12');
    expect(formatDamageAmount(12, 'crit')).toBe('12!');
  });

  it('gives crits a bigger punch and a longer hold than a plain hit', () => {
    const crit = sampleNumberMotion('crit', 0.02, 1);
    const plain = sampleNumberMotion('outgoing', 0.02, 1);
    expect(crit.scale).toBeGreaterThan(plain.scale);
    // Mid-life the crit is still fully opaque while an ordinary number is fading.
    expect(sampleNumberMotion('crit', 0.5, 1).opacity).toBeGreaterThan(sampleNumberMotion('outgoing', 0.5, 1).opacity);
  });

  it('drops every jump but keeps the read when motion is off', () => {
    const still = sampleNumberMotion('crit', 0.02, 0);
    expect(still.scale).toBe(1);
    expect(Math.abs(still.rotation)).toBe(0);
    expect(still.offsetX).toBe(0);
    // Still rises and still fades — a frozen number is unreadable, not calm.
    expect(sampleNumberMotion('crit', 0.9, 0).offsetY).toBeGreaterThan(0);
    expect(sampleNumberMotion('crit', 1, 0).opacity).toBeLessThan(0.05);
  });
});

describe('camera kick', () => {
  const out = new THREE.Vector3();

  it('is at full amplitude on the very first frame, then decays away', () => {
    const kick = createCameraKick({ kind: 'crit', severity: 1, dirX: 1, dirZ: 0 }, 1, 0);
    expect(kick).not.toBeNull();
    sampleCameraKick(kick, 0, out);
    const first = out.length();
    sampleCameraKick(kick, 150, out);
    expect(out.length()).toBeLessThan(first);
    expect(sampleCameraKick(kick, 10_000, out)).toBe(false);
  });

  it('lands a normal trade far softer than a crit', () => {
    const plain = createCameraKick({ kind: 'outgoing', severity: 1, dirX: 1, dirZ: 0 }, 1, 0);
    const crit = createCameraKick({ kind: 'crit', severity: 1, dirX: 1, dirZ: 0 }, 1, 0);
    expect(plain!.amplitude).toBeLessThan(crit!.amplitude * 0.5);
  });

  it('produces nothing at all under prefers-reduced-motion', () => {
    expect(createCameraKick({ kind: 'crit', severity: 1, dirX: 1, dirZ: 0 }, 0, 0)).toBeNull();
  });

  it('hit-stops on a crit but never on an ordinary hit', () => {
    const crit = createCameraKick({ kind: 'crit', severity: 1, dirX: 0, dirZ: 1 }, 1, 0);
    const plain = createCameraKick({ kind: 'outgoing', severity: 1, dirX: 0, dirZ: 1 }, 1, 0);
    expect(isCameraHitStopped(crit, 10)).toBe(true);
    expect(isCameraHitStopped(crit, 500)).toBe(false);
    expect(isCameraHitStopped(plain, 10)).toBe(false);
  });
});

describe('danger state', () => {
  it('stays clear until the health bar is genuinely low, then ramps', () => {
    expect(dangerLevel(100, 100, true)).toBe(0);
    expect(dangerLevel(50, 100, true)).toBe(0);
    expect(dangerLevel(20, 100, true)).toBeGreaterThan(0);
    expect(dangerLevel(1, 100, true)).toBeGreaterThan(dangerLevel(20, 100, true));
  });

  it('eases back off as the player heals', () => {
    expect(dangerOpacity(dangerLevel(30, 100, true))).toBeLessThan(dangerOpacity(dangerLevel(10, 100, true)));
  });

  it('never covers the screen, and clears on death', () => {
    expect(dangerOpacity(dangerLevel(0, 100, true))).toBeLessThan(0.8);
    expect(dangerLevel(0, 100, false)).toBe(0);
  });

  it('only starts beating when death is close, and beats faster the closer it gets', () => {
    expect(dangerHeartbeatMs(dangerLevel(30, 100, true))).toBeNull();
    const nearDeath = dangerHeartbeatMs(dangerLevel(2, 100, true));
    const wounded = dangerHeartbeatMs(dangerLevel(15, 100, true));
    expect(nearDeath).not.toBeNull();
    expect(nearDeath!).toBeLessThan(wounded ?? Infinity);
  });
});

describe('impact direction', () => {
  it('flashes the edge the blow came from, following the camera orbit', () => {
    // Camera looking down +Z: a blow travelling +Z runs away from the eye, so
    // its bright end sits at the bottom of the screen (gradient points up).
    expect(screenAngleFromWorldDirection(0, 1, 0)).toBe(0);
    // Same blow with the camera swung 180° reads from the opposite edge.
    expect(screenAngleFromWorldDirection(0, 1, Math.PI)).toBe(180);
  });

  it('falls back to a bearing-less flash when the attacker is unknown', () => {
    expect(screenAngleFromWorldDirection(0, 0, 1.2)).toBe(0);
  });
});

describe('impact bus', () => {
  beforeEach(resetCombatImpacts);

  it('coalesces an AoE volley into its heaviest hit', () => {
    const seen: CombatImpact[] = [];
    const stop = subscribeCombatImpacts((impact) => seen.push(impact));
    emitCombatImpact({ kind: 'outgoing', severity: 0.3, dirX: 0, dirZ: 1, at: 1_000 });
    emitCombatImpact({ kind: 'outgoing', severity: 0.2, dirX: 0, dirZ: 1, at: 1_010 });
    emitCombatImpact({ kind: 'outgoing', severity: 0.9, dirX: 0, dirZ: 1, at: 1_020 });
    stop();
    expect(seen.map((impact) => impact.severity)).toEqual([0.3, 0.9]);
  });

  it('scales severity by the share of the pool the hit removed', () => {
    expect(severityFromDamage(300, 1_000)).toBeGreaterThan(severityFromDamage(50, 1_000));
    expect(severityFromDamage(1, 1_000)).toBeGreaterThan(0);
    expect(severityFromDamage(5_000, 1_000)).toBe(1);
  });
});
