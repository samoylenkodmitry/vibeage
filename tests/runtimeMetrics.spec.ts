import { describe, expect, test, beforeEach } from 'vitest';
import { runtimeMetrics } from '../server/observability/runtimeMetrics';

describe('runtime metrics', () => {
  beforeEach(() => {
    runtimeMetrics.resetForTests();
  });

  test('records counters gauges and bounded tick timing', () => {
    runtimeMetrics.increment('room.joins');
    runtimeMetrics.increment('room.joins', 2);
    runtimeMetrics.setGauge('players.active', 3);
    runtimeMetrics.recordTickMs(4.444);
    runtimeMetrics.recordTickMs(8.111);

    expect(runtimeMetrics.snapshot()).toMatchObject({
      counters: { 'room.joins': 3 },
      gauges: { 'players.active': 3 },
      tickMs: {
        last: 8.11,
        average: 6.28,
        max: 8.11,
        samples: 2,
      },
    });
  });

  test('reports p50/p95/p99 over the tick sample window', () => {
    // Record 100 evenly-spaced samples 1..100ms. p50 falls near 50,
    // p95 near 95, p99 near 99. Nearest-rank picks exact integer values.
    for (let ms = 1; ms <= 100; ms++) {
      runtimeMetrics.recordTickMs(ms);
    }
    const tick = runtimeMetrics.snapshot().tickMs;
    expect(tick.samples).toBe(100);
    expect(tick.p50).toBe(50);
    expect(tick.p95).toBe(95);
    expect(tick.p99).toBe(99);
    expect(tick.max).toBe(100);
  });

  test('percentile fields are 0 when no ticks have been recorded', () => {
    const tick = runtimeMetrics.snapshot().tickMs;
    expect(tick.p50).toBe(0);
    expect(tick.p95).toBe(0);
    expect(tick.p99).toBe(0);
    expect(tick.samples).toBe(0);
  });
});
