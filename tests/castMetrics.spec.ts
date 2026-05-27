import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { CastReq, VecXZ } from '../packages/protocol/messages';
import { handleCastReq } from '../server/combat/castHandler';
import { createActiveCastStore, type ActiveCastStore } from '../server/combat/skillSystem';
import { runtimeMetrics } from '../server/observability/runtimeMetrics';
import { sendCommandRejected } from '../server/transport/commandRejected';
import type { DirectMessageSink, OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

/**
 * §52 #5 — operational counters that would have caught the PR #338
 * cast regression within minutes. `castReq.received` ticks for every
 * accepted-by-schema CastReq the handler sees; `castReq.accepted`
 * ticks on the happy path. A sudden drop in accept-rate is the
 * cheapest alarm signal.
 *
 * `commandRejected.<commandType>.<reason>` counters ride the shared
 * `sendCommandRejected` helper so every rejection path contributes
 * to a single per-command rejection rate graph.
 */
const makePlayer = (): PlayerState => ({
  id: 'player1',
  socketId: 'socket1',
  name: 'CastMetricsTester',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  health: 100,
  maxHealth: 100,
  mana: 100,
  maxMana: 100,
  className: 'mage',
  unlockedSkills: ['fireball'],

  availableSkillPoints: 0,
  skillCooldownEndTs: {},
  statusEffects: [],
  level: 1,
  experience: 0,
  experienceToNextLevel: 100,
  castingSkill: null,
  castingProgressMs: 0,
  isAlive: true,
  maxInventorySlots: 20,
});

function makeWorld() {
  return {
    getEnemyById: vi.fn(() => null),
    getPlayerById: vi.fn(() => null),
    getEntitiesInCircle: vi.fn(() => []),
    onTargetDied: vi.fn(),
  };
}

describe('cast metrics (§52 #5)', () => {
  let player: PlayerState;
  let socket: { id: string };
  let direct: DirectMessageSink;
  let outbound: OutboundEventSink;
  let activeCasts: ActiveCastStore;

  beforeEach(() => {
    runtimeMetrics.resetForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-21T00:00:00.000Z'));
    player = makePlayer();
    socket = { id: 'socket1' };
    direct = { send: vi.fn() };
    outbound = { publish: vi.fn() };
    activeCasts = createActiveCastStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function castFireball(targetPos?: VecXZ): void {
    const msg: CastReq = {
      type: 'CastReq',
      id: player.id,
      skillId: 'fireball',
      clientTs: Date.now(),
      clientSeq: 1,
      ...(targetPos ? { targetPos } : {}),
    };
    handleCastReq(socket, player, msg, { direct, outbound }, makeWorld(), { activeCasts, now: Date.now() });
  }

  test('increments castReq.received on every entry to handleCastReq', () => {
    castFireball({ x: 10, z: 0 });
    expect(runtimeMetrics.snapshot().counters['castReq.received']).toBe(1);
  });

  test('increments castReq.accepted only on the happy path (in-range, has mana)', () => {
    castFireball({ x: 10, z: 0 });
    expect(runtimeMetrics.snapshot().counters['castReq.accepted']).toBe(1);
  });

  test('castReq.accepted stays 0 when the cast is rejected (missing target)', () => {
    castFireball(); // fireball requires a target; no targetPos = invalid
    const counters = runtimeMetrics.snapshot().counters;
    expect(counters['castReq.received']).toBe(1);
    expect(counters['castReq.accepted']).toBeUndefined();
  });

  test('socket mismatch increments castReq.rejected.socketMismatch', () => {
    // Pretend a different socket is impersonating the player.
    const msg: CastReq = {
      type: 'CastReq', id: player.id, skillId: 'fireball',
      clientTs: Date.now(), clientSeq: 2, targetPos: { x: 10, z: 0 },
    };
    handleCastReq({ id: 'wrong-socket' }, player, msg, { direct, outbound }, makeWorld(), { activeCasts, now: Date.now() });
    expect(runtimeMetrics.snapshot().counters['castReq.rejected.socketMismatch']).toBe(1);
    expect(runtimeMetrics.snapshot().counters['castReq.accepted']).toBeUndefined();
  });
});

describe('commandRejected metrics (§52 #5)', () => {
  beforeEach(() => {
    runtimeMetrics.resetForTests();
  });

  test('sendCommandRejected ticks per-command + per-reason + total counters', () => {
    const direct: DirectMessageSink = { send: vi.fn() };
    sendCommandRejected(direct, 'EquipItem', 'levelTooLow', 7);
    sendCommandRejected(direct, 'EquipItem', 'levelTooLow', 8);
    sendCommandRejected(direct, 'EquipItem', 'slotConflict', 9);
    sendCommandRejected(direct, 'CastReq', 'outofrange', 10);

    const counters = runtimeMetrics.snapshot().counters;
    expect(counters['commandRejected.EquipItem.levelTooLow']).toBe(2);
    expect(counters['commandRejected.EquipItem.slotConflict']).toBe(1);
    expect(counters['commandRejected.EquipItem.total']).toBe(3);
    expect(counters['commandRejected.CastReq.outofrange']).toBe(1);
    expect(counters['commandRejected.CastReq.total']).toBe(1);
    expect(counters['commandRejected.total']).toBe(4);
  });
});
