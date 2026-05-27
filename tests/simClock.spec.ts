import { describe, expect, it } from 'vitest';
import { SimClock } from '../packages/sim/simClock';

describe('SimClock', () => {
  it('runs events in time order as the clock advances', () => {
    const clock = new SimClock();
    const log: string[] = [];
    clock.at(300, () => log.push('c@300'));
    clock.at(100, () => log.push('a@100'));
    clock.at(200, () => log.push('b@200'));

    clock.advanceTo(150);
    expect(log).toEqual(['a@100']);
    expect(clock.now()).toBe(150);

    clock.advanceTo(300);
    expect(log).toEqual(['a@100', 'b@200', 'c@300']);
    expect(clock.now()).toBe(300);
  });

  it('preserves FIFO order within the same timestamp', () => {
    const clock = new SimClock();
    const log: number[] = [];
    clock.at(100, () => log.push(1));
    clock.at(100, () => log.push(2));
    clock.at(100, () => log.push(3));
    clock.advanceBy(100);
    expect(log).toEqual([1, 2, 3]);
  });

  it('after() schedules relative to now', () => {
    const clock = new SimClock(1000);
    let firedAt = -1;
    clock.after(250, () => { firedAt = clock.now(); });
    clock.advanceBy(250);
    expect(firedAt).toBe(1250);
  });

  it('runs events scheduled by earlier events within the same advance', () => {
    const clock = new SimClock();
    const log: number[] = [];
    clock.at(100, () => {
      log.push(100);
      clock.at(150, () => log.push(150)); // scheduled mid-advance
    });
    clock.advanceTo(200);
    expect(log).toEqual([100, 150]);
  });

  it('every() repeats until cancelled', () => {
    const clock = new SimClock();
    const hits: number[] = [];
    const cancel = clock.every(100, () => hits.push(clock.now()));
    clock.advanceTo(350);
    expect(hits).toEqual([100, 200, 300]);
    cancel();
    clock.advanceTo(1000);
    expect(hits).toEqual([100, 200, 300]); // no more after cancel
  });

  it('does not move time backward and refuses past scheduling', () => {
    const clock = new SimClock();
    clock.advanceTo(500);
    expect(() => clock.at(400, () => {})).toThrow(/past/);
    clock.advanceTo(300); // earlier target is a no-op for `now`
    expect(clock.now()).toBe(500);
  });

  it('drain() runs everything to completion with a safety cap', () => {
    const clock = new SimClock();
    let n = 0;
    // self-limiting recurring work: stop scheduling after 5 ticks
    const cancel = clock.every(10, () => {
      n += 1;
      if (n >= 5) cancel();
    });
    const fired = clock.drain();
    expect(n).toBe(5);
    expect(fired).toBeGreaterThanOrEqual(5);
    expect(clock.pending()).toBe(0);
  });

  it('every() rejects a non-positive interval', () => {
    const clock = new SimClock();
    expect(() => clock.every(0, () => {})).toThrow();
  });
});
