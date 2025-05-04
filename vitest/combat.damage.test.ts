import { describe, it, expect } from 'vitest';
import { getDamage, hash, rng } from '../shared/combatMath';

describe('Combat Damage Calculation', () => {
  // Test for determinism: same seed returns identical results
  it('produces deterministic damage values given the same seed', () => {
    const seed = 'player1:enemy2';
    const opts = {
      caster: { dmgMult: 1.5, critChance: 0.2, critMult: 2 },
      skill: { base: 100, variance: 0.1 },
      seed
    };
    
    const result1 = getDamage(opts);
    const result2 = getDamage(opts);
    
    expect(result1.dmg).toBe(result2.dmg);
    expect(result1.crit).toBe(result2.crit);
  });
  
  // Test for variance-only behavior
  it('has no variance when variance is set to 0', () => {
    const seed = 'player2:enemy3';
    const baseDamage = 100;
    const dmgMult = 1.2;
    
    const opts = {
      caster: { dmgMult, critChance: 0 }, // No crits
      skill: { base: baseDamage, variance: 0 },
      seed
    };
    
    const result = getDamage(opts);
    
    // With variance=0, damage should be exactly base * multiplier (rounded)
    expect(result.dmg).toBe(Math.round(baseDamage * dmgMult));
  });
  
  // Test for crit frequency
  it('always crits when critChance=1', () => {
    const trials = 20;
    
    for (let i = 0; i < trials; i++) {
      const seed = `always-crit-${i}`;
      const result = getDamage({
        caster: { dmgMult: 1, critChance: 1, critMult: 2 },
        skill: { base: 50, variance: 0.1 },
        seed
      });
      
      expect(result.crit).toBe(true);
    }
  });
  
  it('never crits when critChance=0', () => {
    const trials = 20;
    
    for (let i = 0; i < trials; i++) {
      const seed = `never-crit-${i}`;
      const result = getDamage({
        caster: { dmgMult: 1, critChance: 0, critMult: 2 },
        skill: { base: 50, variance: 0.1 },
        seed
      });
      
      expect(result.crit).toBe(false);
    }
  });
  
  // Test for seed sensitivity
  it('changes damage output when seed changes by one character in ≥95% of trials', () => {
    const trials = 1000;
    let differentResults = 0;
    
    for (let i = 0; i < trials; i++) {
      const originalSeed = `test-seed-${i}`;
      const modifiedSeed = `test-seed-${i}X`; // Adding one character
      
      const result1 = getDamage({
        caster: { dmgMult: 1, critChance: 0.2 },
        skill: { base: 100, variance: 0.1 },
        seed: originalSeed
      });
      
      const result2 = getDamage({
        caster: { dmgMult: 1, critChance: 0.2 },
        skill: { base: 100, variance: 0.1 },
        seed: modifiedSeed
      });
      
      if (result1.dmg !== result2.dmg || result1.crit !== result2.crit) {
        differentResults++;
      }
    }
    
    const percentDifferent = (differentResults / trials) * 100;
    expect(percentDifferent).toBeGreaterThanOrEqual(95);
  });
  
  // Additional validation to check the hash function's distribution
  it('generates well-distributed hash values', () => {
    const trials = 1000;
    const buckets = Array(10).fill(0); // 10 buckets
    
    for (let i = 0; i < trials; i++) {
      const seed = `distribution-test-${i}`;
      const hashValue = hash(seed);
      const normalizedValue = hashValue / 0xFFFFFFFF; // Convert to 0-1 range
      const bucketIndex = Math.floor(normalizedValue * buckets.length);
      buckets[bucketIndex]++;
    }
    
    // Check that no bucket has more than 20% of values (basic distribution check)
    for (const count of buckets) {
      const percentage = (count / trials) * 100;
      expect(percentage).toBeLessThan(20);
    }
  });
});
