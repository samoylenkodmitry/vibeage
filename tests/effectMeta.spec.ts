import { describe, expect, it } from 'vitest';
import {
  effectLabel,
  effectIsTimed,
  effectRemainingFraction,
  effectRemainingMs,
  isBeneficialEffect,
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
});
