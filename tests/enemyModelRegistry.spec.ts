import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { CHARACTER_MODELS, enemyModel, enemyModelForType } from '../apps/client/src/characterModels';
import type { EnemyTemplate } from '../packages/content/enemies';

const FAMILIES: EnemyTemplate['family'][] = ['humanoid', 'undead', 'beast', 'elemental', 'dragon', 'aberration', 'fey', 'spirit', 'plant', 'construct'];

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

  it('per-type overrides resolve to registered models; unmapped types fall back to family', () => {
    // A few of the ENEMY_TYPE_MODEL overrides.
    for (const [type, family] of [['orc', 'humanoid'], ['skeleton', 'undead'], ['slime', 'aberration'], ['drake', 'dragon'], ['wolf', 'beast'], ['spider', 'beast']] as const) {
      expect(CHARACTER_MODELS[enemyModelForType(type, family)], `${type}`).toBeDefined();
    }
    // Unmapped type uses the family model.
    expect(enemyModelForType('meadow_sprite', 'fey')).toBe(enemyModel('fey'));
    expect(enemyModelForType('totally_unknown', 'spirit')).toBe(enemyModel('spirit'));
  });
});
