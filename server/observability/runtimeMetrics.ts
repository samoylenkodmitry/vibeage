type MetricMap = Record<string, number>;

export type RuntimeMetricsSnapshot = {
  counters: MetricMap;
  gauges: MetricMap;
  tickMs: {
    last: number;
    average: number;
    max: number;
    /** Percentile-style buckets over the recent tick window. p50 is a
     * better health signal than `average` (long-tail-resistant), and p95
     * / p99 surface the lag spikes that average smooths away. */
    p50: number;
    p95: number;
    p99: number;
    samples: number;
  };
  uptimeSec: number;
};

const MAX_TICK_SAMPLES = 128;

class RuntimeMetrics {
  private readonly counters: MetricMap = {};
  private readonly gauges: MetricMap = {};
  private readonly tickSamples: number[] = [];
  private lastTickMs = 0;
  private maxTickMs = 0;
  private readonly startedAt = Date.now();

  increment(name: string, amount = 1): void {
    this.counters[name] = (this.counters[name] ?? 0) + amount;
  }

  setGauge(name: string, value: number): void {
    this.gauges[name] = value;
  }

  recordTickMs(durationMs: number): void {
    this.lastTickMs = durationMs;
    this.maxTickMs = Math.max(this.maxTickMs, durationMs);
    this.tickSamples.push(durationMs);
    if (this.tickSamples.length > MAX_TICK_SAMPLES) {
      this.tickSamples.shift();
    }
  }

  snapshot(): RuntimeMetricsSnapshot {
    const average = this.tickSamples.length === 0
      ? 0
      : this.tickSamples.reduce((sum, value) => sum + value, 0) / this.tickSamples.length;
    const sorted = this.tickSamples.length === 0 ? [] : [...this.tickSamples].sort((a, b) => a - b);

    return {
      counters: { ...this.counters },
      gauges: { ...this.gauges },
      tickMs: {
        last: roundMetric(this.lastTickMs),
        average: roundMetric(average),
        max: roundMetric(this.maxTickMs),
        p50: roundMetric(percentile(sorted, 0.50)),
        p95: roundMetric(percentile(sorted, 0.95)),
        p99: roundMetric(percentile(sorted, 0.99)),
        samples: this.tickSamples.length,
      },
      uptimeSec: roundMetric((Date.now() - this.startedAt) / 1000),
    };
  }

  resetForTests(): void {
    for (const key of Object.keys(this.counters)) {
      delete this.counters[key];
    }
    for (const key of Object.keys(this.gauges)) {
      delete this.gauges[key];
    }
    this.tickSamples.length = 0;
    this.lastTickMs = 0;
    this.maxTickMs = 0;
  }
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Returns the value at the given percentile of a pre-sorted (ascending)
 * sample. `q` is in [0, 1]. Uses nearest-rank — good enough for the
 * smallish (≤128) tick window the metrics collector keeps. Empty input
 * returns 0.
 */
function percentile(sortedAsc: readonly number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(q * sortedAsc.length) - 1));
  return sortedAsc[idx];
}

export const runtimeMetrics = new RuntimeMetrics();
