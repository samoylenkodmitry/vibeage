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
});
