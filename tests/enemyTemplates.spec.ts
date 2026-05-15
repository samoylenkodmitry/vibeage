import { describe, expect, test } from 'vitest';
import { ENEMY_TEMPLATES, getEnemyTemplate } from '../packages/content/enemies';
import { GAME_ZONES } from '../packages/content/zones';

describe('enemy templates', () => {
  test('every zone mob type has a template', () => {
    const missing: string[] = [];
    for (const zone of GAME_ZONES) {
      for (const mob of zone.mobs) {
        if (!ENEMY_TEMPLATES[mob.type]) {
          missing.push(`${zone.id}:${mob.type}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  test('default template applies neutral multipliers for unknown types', () => {
    const template = getEnemyTemplate('does_not_exist');
    expect(template.stats.health).toBe(1);
    expect(template.stats.damage).toBe(1);
  });

  test('templates produce distinct visuals across families', () => {
    const colors = new Set(Object.values(ENEMY_TEMPLATES).map((spec) => spec.visual.color));
    expect(colors.size).toBeGreaterThan(20);
  });
});
