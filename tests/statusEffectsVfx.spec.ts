import { describe, expect, it } from 'vitest';
import { advanceStatusAuraLocalTime, selectStatusAuras } from '../apps/client/src/vfx/statusFx';
import type { StatusEffect } from '../packages/protocol/messages';

const NOW = 1_700_000_000_000;

function fx(type: string, overrides: Partial<StatusEffect> = {}): StatusEffect {
  return {
    id: `${type}-1`, type, value: 1, durationMs: 5000, startTimeTs: NOW,
    sourceSkill: 'test', ...overrides,
  } as StatusEffect;
}

describe('status-effect VFX selection', () => {
  it('maps debuffs + buffs to their archetype/colour', () => {
    const auras = selectStatusAuras([fx('burn'), fx('slow'), fx('timeStop'), fx('damageReflect')], NOW + 100);
    expect(auras.map((a) => a.archetype)).toEqual(['rising', 'ring', 'orbit', 'shell']);
    expect(auras[0].color).toBe('#ff6a1a'); // burn
    expect(auras[3].endsAt).toBe(NOW + 5000);
  });

  it('skips unvisualized + instant effects (damage/heal/dispel/teleport)', () => {
    const auras = selectStatusAuras([fx('damage'), fx('heal'), fx('dispel'), fx('teleport')], NOW);
    expect(auras).toEqual([]);
  });

  it('filters out effects whose duration has elapsed', () => {
    const active = fx('poison', { startTimeTs: NOW, durationMs: 5000 });
    const expired = fx('burn', { id: 'burn-old', startTimeTs: NOW - 9000, durationMs: 5000 });
    const auras = selectStatusAuras([active, expired], NOW);
    expect(auras.map((a) => a.id)).toEqual(['poison-1']);
  });

  it('can keep server-listed timed auras visible while the target is time-frozen', () => {
    const aura = fx('timeStop', { startTimeTs: NOW - 9000, durationMs: 5000 });
    expect(selectStatusAuras([aura], NOW)).toEqual([]);
    expect(selectStatusAuras([aura], NOW, { includeExpiredTimed: true }).map((a) => a.id)).toEqual(['timeStop-1']);
  });

  it('caps the number of simultaneous auras', () => {
    const many = ['burn', 'poison', 'bless', 'slow', 'stun', 'shield', 'freeze'].map((t) => fx(t, { id: t }));
    expect(selectStatusAuras(many, NOW)).toHaveLength(5);
  });

  it('does not advance aura animation time while frozen', () => {
    expect(advanceStatusAuraLocalTime(1.25, 0.5, true)).toBe(1.25);
    expect(advanceStatusAuraLocalTime(1.25, 0.5, false)).toBe(1.75);
  });
});
