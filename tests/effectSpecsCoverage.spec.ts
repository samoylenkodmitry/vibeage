import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EFFECT_SPECS } from '../packages/content/effects';
import { SKILLS } from '../packages/content/skills';

describe('effect specs coverage', () => {
  it('every SkillEffectType referenced by SKILLS has an EFFECT_SPECS entry', () => {
    const referenced = new Set<string>();
    for (const skill of Object.values(SKILLS)) {
      for (const effect of skill.effects ?? []) {
        referenced.add(effect.type);
      }
    }
    for (const type of referenced) {
      expect(EFFECT_SPECS, `effect type "${type}" used in SKILLS catalog but missing from EFFECT_SPECS`).toHaveProperty(type);
    }
  });

  it('every EFFECT_SPECS entry has the required display fields', () => {
    for (const [type, spec] of Object.entries(EFFECT_SPECS)) {
      expect(spec.type, `${type}.type`).toBe(type);
      expect(spec.label.length, `${type}.label`).toBeGreaterThan(0);
      expect(spec.description.length, `${type}.description`).toBeGreaterThan(0);
      expect(['buff', 'debuff', 'damage', 'heal', 'utility']).toContain(spec.category);
      expect(spec.icon.startsWith('/game/effects/'), `${type}.icon`).toBe(true);
      expect(
        existsSync(join(process.cwd(), 'public', spec.icon)),
        `${type} icon file missing: ${spec.icon}`,
      ).toBe(true);
    }
  });

  it('includes runtime-only status effects surfaced by defensive mechanics', () => {
    expect(EFFECT_SPECS.invuln?.label).toBe('Invulnerable');
  });
});
