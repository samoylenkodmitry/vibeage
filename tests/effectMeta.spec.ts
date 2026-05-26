import { describe, expect, it } from 'vitest';
import {
  effectLabel,
  effectIsTimed,
  effectRemainingFraction,
  effectRemainingMs,
  isBeneficialEffect,
  totalShield,
  hasActiveEffect,
} from '../apps/client/src/hud/effectMeta';
import type { StatusEffect } from '../packages/protocol/messages';

const NOW = 1_000_000;

function eff(over: Partial<StatusEffect> & Pick<StatusEffect, 'type'>): StatusEffect {
  return { id: 'e', value: 0, ...over } as StatusEffect;
}

describe('effectMeta', () => {
  it('labels known effects and falls back to the raw type', () => {
    expect(effectLabel('shield')).toBe('Shield');
    expect(effectLabel('mystery')).toBe('mystery');
  });

  it('classifies buffs vs debuffs', () => {
    expect(isBeneficialEffect('shield')).toBe(true);
    expect(isBeneficialEffect('bless')).toBe(true);
    expect(isBeneficialEffect('evasion')).toBe(true);
    expect(isBeneficialEffect('poison')).toBe(false);
    expect(isBeneficialEffect('stun')).toBe(false);
  });

  it('treats only start+duration effects as timed', () => {
    expect(effectIsTimed(eff({ type: 'shield', startTimeTs: NOW, durationMs: 5000 }))).toBe(true);
    expect(effectIsTimed(eff({ type: 'shield' }))).toBe(false);
    expect(effectIsTimed(eff({ type: 'shield', startTimeTs: NOW, durationMs: 0 }))).toBe(false);
  });

  it('computes remaining ms and fraction, clamped to 0', () => {
    const timed = eff({ type: 'bless', startTimeTs: NOW, durationMs: 4000 });
    expect(effectRemainingMs(timed, NOW + 1000)).toBe(3000);
    expect(effectRemainingFraction(timed, NOW + 1000)).toBeCloseTo(0.75, 5);
    // Past expiry never goes negative.
    expect(effectRemainingMs(timed, NOW + 9999)).toBe(0);
    expect(effectRemainingFraction(timed, NOW + 9999)).toBe(0);
  });

  it('returns null remaining for untimed effects', () => {
    expect(effectRemainingMs(eff({ type: 'invisible' }), NOW)).toBeNull();
  });

  it('totalShield sums active shield pools and ignores other/expired effects', () => {
    const effects = [
      eff({ type: 'shield', value: 250, startTimeTs: NOW, durationMs: 8000 }),
      eff({ type: 'shield', value: 100, startTimeTs: NOW, durationMs: 6000 }),
      eff({ type: 'bless', value: 25, startTimeTs: NOW, durationMs: 5000 }),
      eff({ type: 'shield', value: 999, startTimeTs: NOW - 9000, durationMs: 1000 }), // expired
    ];
    expect(totalShield(effects, NOW + 1000)).toBe(350);
    expect(totalShield([], NOW)).toBe(0);
    expect(totalShield(undefined, NOW)).toBe(0);
  });
});

describe('hasActiveEffect', () => {
  it('detects an unexpired effect of a given type', () => {
    const effs = [eff({ type: 'reveal_loot', startTimeTs: NOW, durationMs: 30_000 })];
    expect(hasActiveEffect(effs, 'reveal_loot', NOW + 1000)).toBe(true);
    expect(hasActiveEffect(effs, 'reveal_loot', NOW + 40_000)).toBe(false); // expired
    expect(hasActiveEffect(effs, 'bless', NOW)).toBe(false);
    expect(hasActiveEffect([], 'reveal_loot', NOW)).toBe(false);
  });
});
