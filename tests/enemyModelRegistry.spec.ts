import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { CHARACTER_MODELS, enemyModel } from '../apps/client/src/characterModels';

// Mirrors the EnemyFamily union in packages/content/enemies.ts.
const FAMILIES = ['humanoid', 'undead', 'beast', 'elemental', 'dragon', 'aberration', 'fey', 'spirit', 'plant', 'construct'];

describe('enemy model registry', () => {
  it('maps every enemy family to a model present in the registry', () => {
    for (const fam of FAMILIES) {
      const id = enemyModel(fam);
      expect(CHARACTER_MODELS[id], `${fam} → ${id}`).toBeDefined();
    }
  });

  it('falls back to a real model for an unknown family (never a bare box)', () => {
    expect(CHARACTER_MODELS[enemyModel('mystery')]).toBeDefined();
  });

  it('every registered model GLB exists on disk', () => {
    for (const def of Object.values(CHARACTER_MODELS)) {
      expect(existsSync(`public${def.path}`), def.path).toBe(true);
    }
  });

  it('monster clips reference the prefixed Quaternius clip names', () => {
    expect(CHARACTER_MODELS['q-dino'].clips.run).toBe('CharacterArmature|Run');
    expect(CHARACTER_MODELS['q-dragon'].clips.idle).toBe('CharacterArmature|Flying_Idle');
  });
});
