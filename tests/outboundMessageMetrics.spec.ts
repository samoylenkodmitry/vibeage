import { describe, expect, it, beforeEach, vi } from 'vitest';
import { runtimeMetrics } from '../server/observability/runtimeMetrics';
import {
  emitBatchUpdate,
  emitEnemyUpdated,
  emitPlayerUpdated,
  emitServerMessage,
  emitServerMessageToClient,
  type OutboundEventSink,
} from '../server/transport/outboundEvents';

/**
 * §52 #12 — every emit helper increments per-message-type counters.
 * The in-process load test (`scripts/load-test-inprocess.ts`) uses a
 * no-op sink, so we count what game code *tried* to emit at the helper
 * boundary instead of at the sink. BatchUpdate also counts each nested
 * message in `outbound.batched.*` so the snapshot phase doesn't
 * undercount its real outbound work.
 */

function noopSink(): OutboundEventSink {
  return { publish: () => undefined };
}

describe('outbound message metrics (§52 #12)', () => {
  beforeEach(() => {
    runtimeMetrics.resetForTests();
  });

  it('counts a single serverMessage emit by its type', () => {
    emitServerMessage(noopSink(), { type: 'EnemyAttack', enemyId: 'e1', targetId: 't1', damage: 5 });
    const counters = runtimeMetrics.snapshot().counters;
    expect(counters['outbound.serverMessage.EnemyAttack']).toBe(1);
    expect(counters['outbound.serverMessage.total']).toBe(1);
    expect(counters['outbound.total']).toBe(1);
  });

  it('counts BatchUpdate + every nested message in outbound.batched.*', () => {
    emitBatchUpdate(noopSink(), [
      { type: 'EnemyAttack', enemyId: 'e1', targetId: 't1', damage: 5 },
      { type: 'EnemyAttack', enemyId: 'e2', targetId: 't1', damage: 3 },
      { type: 'CombatLog', castId: 'c1', skillId: 'fireball', casterId: 'p1', targets: ['e1'], damages: [12] },
    ]);
    const counters = runtimeMetrics.snapshot().counters;
    expect(counters['outbound.serverMessage.BatchUpdate']).toBe(1);
    expect(counters['outbound.batched.EnemyAttack']).toBe(2);
    expect(counters['outbound.batched.CombatLog']).toBe(1);
    expect(counters['outbound.batched.total']).toBe(3);
  });

  it('skips emit entirely (and increments nothing) for an empty BatchUpdate', () => {
    emitBatchUpdate(noopSink(), []);
    const counters = runtimeMetrics.snapshot().counters;
    expect(counters['outbound.serverMessage.BatchUpdate']).toBeUndefined();
    expect(counters['outbound.total']).toBeUndefined();
  });

  it('counts playerUpdated and enemyUpdated under their own keys (no per-type tagging)', () => {
    emitPlayerUpdated(noopSink(), { id: 'p1', health: 50 });
    emitEnemyUpdated(noopSink(), { id: 'e1', isAlive: false });
    const counters = runtimeMetrics.snapshot().counters;
    expect(counters['outbound.playerUpdated']).toBe(1);
    expect(counters['outbound.enemyUpdated']).toBe(1);
    expect(counters['outbound.total']).toBe(2);
  });

  it('directServerMessage counts under both the per-type counter and a directServerMessage tag', () => {
    emitServerMessageToClient(noopSink(), 'socket-x', { type: 'EnemyAttack', enemyId: 'e1', targetId: 't1', damage: 5 });
    const counters = runtimeMetrics.snapshot().counters;
    expect(counters['outbound.serverMessage.EnemyAttack']).toBe(1);
    expect(counters['outbound.directServerMessage']).toBe(1);
    expect(counters['outbound.total']).toBe(1);
  });

  it('passes the event through to the underlying sink (no behavior change)', () => {
    const publish = vi.fn();
    emitPlayerUpdated({ publish }, { id: 'p1' });
    expect(publish).toHaveBeenCalledWith({ type: 'playerUpdated', update: { id: 'p1' } });
  });
});
