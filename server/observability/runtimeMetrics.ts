type MetricMap = Record<string, number>;

export type RuntimeMetricsSnapshot = {
  counters: MetricMap;
  gauges: MetricMap;
  tickMs: {
    last: number;
    average: number;
    max: number;
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

    return {
      counters: { ...this.counters },
      gauges: { ...this.gauges },
      tickMs: {
        last: roundMetric(this.lastTickMs),
        average: roundMetric(average),
        max: roundMetric(this.maxTickMs),
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

export const runtimeMetrics = new RuntimeMetrics();
