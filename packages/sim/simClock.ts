/**
 * Discrete-event simulation clock — a virtual timeline you advance
 * explicitly instead of waiting on the wall clock. Schedule callbacks
 * at an absolute time (`at`), a relative delay (`after`), or on a
 * recurring interval (`every`); then `advanceBy` / `advanceTo` runs
 * every due event in time order (FIFO within one timestamp), letting a
 * whole fight / DoT / day-night cycle play out in microseconds and
 * deterministically.
 *
 * It owns no game state — callers schedule closures that mutate their
 * own world (a fight, a regen tick, an AI decision). Pair it with a
 * seeded RNG for fully reproducible runs (see the combat-balance
 * harness). No dependency on Date.now(), timers, or async.
 */
export type CancelHandle = () => void;

interface QueuedEvent {
  at: number;
  /** Insertion order — tiebreaks events sharing a timestamp (FIFO). */
  seq: number;
  fn: () => void;
}

export class SimClock {
  private t: number;
  private seqCounter = 0;
  /** Binary min-heap keyed by (at, seq). */
  private heap: QueuedEvent[] = [];

  constructor(startMs = 0) {
    this.t = startMs;
  }

  /** Current virtual time in ms. */
  now(): number {
    return this.t;
  }

  /** Number of events still queued (for assertions / debugging). */
  pending(): number {
    return this.heap.length;
  }

  /** Run `fn` at absolute virtual time `timeMs` (must be a finite time ≥ now). */
  at(timeMs: number, fn: () => void): void {
    if (!Number.isFinite(timeMs)) {
      throw new Error(`SimClock.at: time must be finite (got ${timeMs})`);
    }
    if (timeMs < this.t) {
      throw new Error(`SimClock.at: cannot schedule in the past (${timeMs} < ${this.t})`);
    }
    this.heapPush({ at: timeMs, seq: this.seqCounter++, fn });
  }

  /** Run `fn` after `delayMs` from now (negative delays clamp to now). */
  after(delayMs: number, fn: () => void): void {
    this.at(this.t + Math.max(0, delayMs), fn);
  }

  /**
   * Run `fn` every `intervalMs`, starting one interval from now, until
   * cancelled. Returns a cancel handle; cancelling stops further ticks
   * (a tick already in-flight for the current timestamp still runs).
   */
  every(intervalMs: number, fn: () => void): CancelHandle {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      throw new Error(`SimClock.every: interval must be a finite value > 0 (got ${intervalMs})`);
    }
    let active = true;
    // Schedule each tick relative to its own slot time, not `this.t`, so
    // the cadence can't drift regardless of how the clock is advanced.
    const schedule = (slot: number) => {
      this.at(slot, () => {
        if (!active) return;
        fn();
        if (active) schedule(slot + intervalMs);
      });
    };
    schedule(this.t + intervalMs);
    return () => { active = false; };
  }

  /** Advance the clock by `ms`, running every event that comes due. */
  advanceBy(ms: number): void {
    this.advanceTo(this.t + ms);
  }

  /**
   * Advance the clock to `target`, running every event with `at ≤
   * target` in (at, seq) order — including events scheduled by earlier
   * events within the same window. Time never moves backward.
   */
  advanceTo(target: number): void {
    if (!Number.isFinite(target)) {
      throw new Error(`SimClock.advanceTo: target must be finite (got ${target})`);
    }
    while (this.heap.length > 0 && this.heap[0].at <= target) {
      const ev = this.heapPop();
      this.t = ev.at;
      ev.fn();
    }
    this.t = Math.max(this.t, target);
  }

  /**
   * Run until the queue empties or `safetyCap` events have fired
   * (guards against runaway self-scheduling). Returns events fired.
   * Useful for "play this fight to completion" loops where the end
   * time isn't known up front — pair with a terminating condition
   * inside the scheduled events (e.g. stop scheduling on death).
   */
  drain(safetyCap = 1_000_000): number {
    let fired = 0;
    while (this.heap.length > 0) {
      if (fired >= safetyCap) {
        throw new Error(`SimClock.drain: exceeded safety cap of ${safetyCap} events`);
      }
      const ev = this.heapPop();
      this.t = ev.at;
      ev.fn();
      fired += 1;
    }
    return fired;
  }

  // ---- binary min-heap (ordered by at, then seq) ----

  private heapPush(ev: QueuedEvent): void {
    const h = this.heap;
    h.push(ev);
    let i = h.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.less(h[i], h[parent])) {
        const tmp = h[i]; h[i] = h[parent]; h[parent] = tmp;
        i = parent;
      } else break;
    }
  }

  private heapPop(): QueuedEvent {
    const h = this.heap;
    const top = h[0];
    const last = h.pop()!;
    if (h.length > 0) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < h.length && this.less(h[l], h[smallest])) smallest = l;
        if (r < h.length && this.less(h[r], h[smallest])) smallest = r;
        if (smallest === i) break;
        const tmp = h[i]; h[i] = h[smallest]; h[smallest] = tmp;
        i = smallest;
      }
    }
    return top;
  }

  private less(a: QueuedEvent, b: QueuedEvent): boolean {
    return a.at < b.at || (a.at === b.at && a.seq < b.seq);
  }
}
