import { beforeEach, describe, expect, it } from 'vitest';
import { claimVoice, duckFor, rateLimit, resetVoiceWindow } from '../apps/client/src/audio/mix';
import { advanceStride, effortFor, newStrideState, strideFor } from '../apps/client/src/audio/footsteps';

/**
 * The mix rules that keep a busy fight from turning into a wall of noise, and a
 * position stream from turning footsteps into a machine gun. Both are pure, so
 * the behaviour that actually matters is testable without Web Audio.
 */

describe('flurry ducking', () => {
  beforeEach(() => resetVoiceWindow());

  it('leaves a normal rotation completely alone', () => {
    expect(duckFor(0)).toBe(1);
  });

  it('pulls each extra voice in the window further down', () => {
    expect(duckFor(1)).toBeLessThan(duckFor(0));
    expect(duckFor(4)).toBeLessThan(duckFor(1));
  });

  it('ducks rather than gates — a flurry stays audible', () => {
    expect(duckFor(8)).toBeGreaterThan(0.3);
  });

  it('drops voices outright once the window is saturated', () => {
    expect(duckFor(12)).toBe(0);
    expect(duckFor(40)).toBe(0);
  });

  it('claimVoice accumulates and then refuses, so the graph stops growing', () => {
    const gains: number[] = [];
    for (let i = 0; i < 20; i += 1) gains.push(claimVoice(1_000));
    expect(gains[0]).toBe(1);
    expect(gains[1]).toBeLessThan(1);
    expect(gains.at(-1)).toBe(0);
  });

  it('forgets the flurry once the window has passed', () => {
    for (let i = 0; i < 20; i += 1) claimVoice(1_000);
    expect(claimVoice(1_000)).toBe(0);
    expect(claimVoice(2_000)).toBe(1);
  });
});

describe('rateLimit', () => {
  it('lets the first through and holds the rest until the interval elapses', () => {
    const key = `t-${Math.random()}`;
    expect(rateLimit(key, 200, 0)).toBe(true);
    expect(rateLimit(key, 200, 100)).toBe(false);
    expect(rateLimit(key, 200, 250)).toBe(true);
  });

  it('keys are independent', () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    expect(rateLimit(a, 500, 0)).toBe(true);
    expect(rateLimit(b, 500, 0)).toBe(true);
  });
});

describe('footstep cadence', () => {
  it('shortens the stride as you speed up', () => {
    expect(strideFor(8)).toBeLessThan(strideFor(2));
    expect(effortFor(8)).toBeGreaterThan(effortFor(2));
  });

  it('stays silent while idling and drains any banked distance', () => {
    const state = { accum: 2, lastStepAt: 0, index: 0 };
    const out = advanceStride(state, 0.01, 0.1, 1_000);
    expect(out.step).toBe(false);
    expect(out.state.accum).toBeLessThan(state.accum);
  });

  it('lands a foot once a stride of ground is covered', () => {
    let s = newStrideState();
    let steps = 0;
    // 5 m/s for 3 seconds at the bridge's ~12Hz poll.
    for (let i = 1; i <= 36; i += 1) {
      const out = advanceStride(s, 5 / 12, 5, i * 83);
      s = out.state;
      if (out.step) steps += 1;
    }
    expect(steps).toBeGreaterThan(5);
    expect(steps).toBeLessThan(12); // a jog, not a drum roll
  });

  it('never machine-guns even if the position stream bursts', () => {
    let s = newStrideState();
    let steps = 0;
    for (let i = 0; i < 50; i += 1) {
      const out = advanceStride(s, 3, 9, 100); // same timestamp, huge deltas
      s = out.state;
      if (out.step) steps += 1;
    }
    expect(steps).toBeLessThanOrEqual(1);
  });

  it('treats a respawn/rubber-band snap as travel you never walked', () => {
    const out = advanceStride(newStrideState(), 400, 900, 5_000);
    expect(out.step).toBe(false);
    expect(out.state.accum).toBe(0);
  });
});
