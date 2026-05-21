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

  // §52 #5 — generic histograms for snapshot/batch size, DB write
  // latency, and anything else that wants a percentile distribution
  // beyond the tick-Ms timing.
  test('records named histograms with avg/max/percentile summaries', () => {
    for (let n = 1; n <= 100; n++) {
      runtimeMetrics.recordHistogram('snapshot.batchSize', n);
    }
    const summary = runtimeMetrics.snapshot().histograms['snapshot.batchSize'];
    expect(summary.samples).toBe(100);
    expect(summary.max).toBe(100);
    expect(summary.p50).toBe(50);
    expect(summary.p95).toBe(95);
    expect(summary.p99).toBe(99);
    expect(summary.avg).toBe(50.5);
  });

  test('histograms cap their rolling sample window so memory stays bounded', () => {
    // Window cap is 256; recording 300 samples should retain the
    // most recent 256 (values 45..300).
    for (let n = 1; n <= 300; n++) {
      runtimeMetrics.recordHistogram('jitter.test', n);
    }
    const summary = runtimeMetrics.snapshot().histograms['jitter.test'];
    expect(summary.samples).toBe(256);
    expect(summary.max).toBe(300);
    // Lowest retained sample is 300 - 256 + 1 = 45.
    expect(summary.p50).toBe(45 + Math.ceil(0.5 * 256) - 1);
  });

  test('histograms map is empty when nothing has been recorded', () => {
    expect(runtimeMetrics.snapshot().histograms).toEqual({});
  });

  test('resetForTests clears histograms alongside counters', () => {
    runtimeMetrics.recordHistogram('one.shot', 7);
    runtimeMetrics.resetForTests();
    expect(runtimeMetrics.snapshot().histograms).toEqual({});
  });
});
