import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_SLOT_HINT,
  barActionRefusal,
  skillSlotRefusal,
} from '../apps/client/src/hud/actionRefusal';
import {
  publishLocalActionFeedback,
  resetLocalActionFeedback,
  subscribeLocalActionFeedback,
} from '../apps/client/src/hud/localActionFeedback';

/**
 * "An action that silently does nothing is the worst bug class in this
 * project." These specs pin the copy for every refusal the ACTION BAR makes on
 * its own — the taps that never reach the server, so no CommandRejected can
 * explain them.
 */
describe('skillSlotRefusal', () => {
  const ready = {
    skillId: 'basicAttack' as const,
    boundUnknownSkill: false,
    isAlive: true,
    cooldownRemainingMs: 0,
  };

  it('lets a ready skill through', () => {
    expect(skillSlotRefusal(ready)).toBeNull();
  });

  it('teaches how to fill an empty slot instead of swallowing the tap', () => {
    expect(skillSlotRefusal({ ...ready, skillId: null })).toBe(EMPTY_SLOT_HINT);
    expect(EMPTY_SLOT_HINT).toMatch(/Skills/);
    expect(EMPTY_SLOT_HINT).toMatch(/Bag/);
  });

  it('distinguishes an unlearned skill from an empty slot', () => {
    const refusal = skillSlotRefusal({ ...ready, skillId: null, boundUnknownSkill: true });
    expect(refusal).toMatch(/haven't learned/i);
    expect(refusal).not.toBe(EMPTY_SLOT_HINT);
  });

  it('explains death before cooldown', () => {
    expect(skillSlotRefusal({ ...ready, isAlive: false, cooldownRemainingMs: 5_000 }))
      .toMatch(/defeated/i);
  });

  it('names the skill and the wait left on cooldown', () => {
    expect(skillSlotRefusal({ ...ready, cooldownRemainingMs: 2_400 })).toMatch(/2\.4s left/);
    // Above 10s the tenths are noise — round up to whole seconds.
    expect(skillSlotRefusal({ ...ready, cooldownRemainingMs: 12_100 })).toMatch(/13s left/);
  });
});

describe('barActionRefusal', () => {
  const base = { isAlive: true, hasSelectedTarget: false, hasNavigationMarker: false, lootCount: 0 };

  it('lets Move through with either a target or a map pin', () => {
    expect(barActionRefusal('move', { ...base, hasSelectedTarget: true })).toBeNull();
    expect(barActionRefusal('move', { ...base, hasNavigationMarker: true })).toBeNull();
  });

  it('points at the two ways to give Move a destination', () => {
    const refusal = barActionRefusal('move', base);
    expect(refusal).toMatch(/target/i);
    expect(refusal).toMatch(/Map/);
  });

  it('says why Pickup is dead when there is no loot', () => {
    expect(barActionRefusal('pickup', base)).toMatch(/No loot nearby/i);
    expect(barActionRefusal('pickup', { ...base, lootCount: 2 })).toBeNull();
  });

  it('death outranks every other reason', () => {
    expect(barActionRefusal('pickup', { ...base, isAlive: false, lootCount: 2 })).toMatch(/defeated/i);
  });
});

describe('localActionFeedback bus', () => {
  afterEach(() => {
    resetLocalActionFeedback();
    vi.useRealTimers();
  });

  it('delivers to every subscriber', () => {
    const seen: string[] = [];
    subscribeLocalActionFeedback((f) => seen.push(f.text));
    subscribeLocalActionFeedback((f) => seen.push(`2:${f.text}`));
    publishLocalActionFeedback('nope');
    expect(seen).toEqual(['nope', '2:nope']);
  });

  it('unsubscribes cleanly', () => {
    const seen: string[] = [];
    const off = subscribeLocalActionFeedback((f) => seen.push(f.text));
    off();
    publishLocalActionFeedback('nope');
    expect(seen).toEqual([]);
  });

  it('re-flashes an identical refusal — the flash keys off a rising `at`', () => {
    // Frozen clock: two taps inside one millisecond must still produce two
    // distinct keys, or the second tap looks ignored.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000));
    const first = publishLocalActionFeedback('on cooldown');
    const second = publishLocalActionFeedback('on cooldown');
    expect(second.at).toBeGreaterThan(first.at);
  });
});
