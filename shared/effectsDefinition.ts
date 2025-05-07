import { rng } from './combatMath.js';

export type EffectId = 'burn' | 'bleed' | 'regen';

export interface EffectTick {
  value: number;      // Damage/healing amount
  type: 'damage' | 'healing' | 'mana' | 'stat'; // Effect type
}

export interface EffectDef {
  tickMs: number;     // How often the effect ticks
  durationMs: number; // Total duration
  maxStacks: number;  // Maximum number of stacks
  apply(o: {level: number; int: number; seed: number}): EffectTick;
}

export const EFFECTS: Record<EffectId, EffectDef> = {
  burn: {
    tickMs: 1000,     // Tick every second
    durationMs: 8000, // Last for 8 seconds
    maxStacks: 3,     // Max 3 stacks
    apply({ level, int, seed }): EffectTick {
      const random = rng(seed);
      const baseDamage = 8 + level * 2; // Base damage scales with level
      const variance = 0.2; // 20% variance
      const actualDamage = baseDamage * (1 + (random() * 2 - 1) * variance);
      
      return {
        value: Math.round(actualDamage * (1 + int * 0.05)), // Int increases damage by 5% per point
        type: 'damage'
      };
    }
  },
  
  bleed: {
    tickMs: 750,      // Ticks faster than burn
    durationMs: 6000, // Shorter duration
    maxStacks: 5,     // More stacks
    apply({ level, seed }): EffectTick {
      const random = rng(seed);
      const baseDamage = 5 + level * 1.5;
      const variance = 0.15;
      const actualDamage = baseDamage * (1 + (random() * 2 - 1) * variance);
      
      return {
        value: Math.round(actualDamage),
        type: 'damage'
      };
    }
  },
  
  regen: {
    tickMs: 1000,     // Every second
    durationMs: 10000, // 10 seconds
    maxStacks: 2,     // Max 2 stacks
    apply({ level, int, seed }): EffectTick {
      const random = rng(seed);
      const baseHeal = 5 + level * 1.8;
      const variance = 0.1;
      const actualHeal = baseHeal * (1 + (random() * 2 - 1) * variance);
      
      return {
        value: Math.round(actualHeal * (1 + int * 0.08)), // Int increases healing by 8% per point
        type: 'healing'
      };
    }
  }
};
