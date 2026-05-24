import { describe, expect, it, beforeEach } from 'vitest';
import { getVolume, isMuted, setMuted, setVolume } from '../apps/client/src/sfx';

/**
 * PR 609 — pure-function contract for SFX master volume + mute.
 * Doesn't exercise the AudioContext (vitest runs without a DOM
 * audio backend); covers the parts the slider depends on:
 *   - setVolume clamps to [0, 1]
 *   - setVolume preserves a finite in-range value
 *   - setMuted / isMuted are symmetric
 * Pins the slider's contract so a future refactor of sfx.ts
 * doesn't silently break persistence or the gain envelope.
 */

describe('sfx volume / mute', () => {
  beforeEach(() => {
    setVolume(1);
    setMuted(false);
  });

  it('clamps negative volume to 0', () => {
    setVolume(-0.5);
    expect(getVolume()).toBe(0);
  });

  it('clamps over-1 volume to 1', () => {
    setVolume(7);
    expect(getVolume()).toBe(1);
  });

  it('preserves an in-range value', () => {
    setVolume(0.35);
    expect(getVolume()).toBe(0.35);
  });

  it('accepts 0 (silent) and 1 (full)', () => {
    setVolume(0);
    expect(getVolume()).toBe(0);
    setVolume(1);
    expect(getVolume()).toBe(1);
  });

  it('round-trips mute state', () => {
    expect(isMuted()).toBe(false);
    setMuted(true);
    expect(isMuted()).toBe(true);
    setMuted(false);
    expect(isMuted()).toBe(false);
  });
});
