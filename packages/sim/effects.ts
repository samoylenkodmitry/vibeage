import { rng } from './combatMath.js';

export type EffectId = 'burn' | 'bleed' | 'regen';

export interface EffectTick {
  value: number; // Damage/healing amount
  type: 'damage' | 'healing' | 'mana' | 'stat';
}

export interface EffectDef {
  tickMs: number;
  durationMs: number;
  maxStacks: number;
  apply(o: { level: number; int: number; seed: number }): EffectTick;
}

export const EFFECTS: Record<EffectId, EffectDef> = {
  burn: {
    tickMs: 1000,
    durationMs: 8000,
    maxStacks: 3,
    apply({ level, int, seed }): EffectTick {
      const random = rng(seed);
      const baseDamage = 8 + level * 2;
      const variance = 0.2;
      const actualDamage = baseDamage * (1 + (random() * 2 - 1) * variance);

      return {
        value: Math.round(actualDamage * (1 + int * 0.05)),
        type: 'damage',
      };
    },
  },

  bleed: {
    tickMs: 750,
    durationMs: 6000,
    maxStacks: 5,
    apply({ level, seed }): EffectTick {
      const random = rng(seed);
      const baseDamage = 5 + level * 1.5;
      const variance = 0.15;
      const actualDamage = baseDamage * (1 + (random() * 2 - 1) * variance);

      return {
        value: Math.round(actualDamage),
        type: 'damage',
      };
    },
  },

  regen: {
    tickMs: 1000,
    durationMs: 10000,
    maxStacks: 2,
    apply({ level, int, seed }): EffectTick {
      const random = rng(seed);
      const baseHeal = 5 + level * 1.8;
      const variance = 0.1;
      const actualHeal = baseHeal * (1 + (random() * 2 - 1) * variance);

      return {
        value: Math.round(actualHeal * (1 + int * 0.08)),
        type: 'healing',
      };
    },
  },
};
