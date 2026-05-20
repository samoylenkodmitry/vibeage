import { describe, expect, it } from 'vitest';
import {
  CLASS_DIFFICULTY,
  CLASS_SKILL_TREES,
  getStarterSkillForClass,
  type CharacterClass,
} from '../packages/content/classes';

/**
 * §49/M2 — character-create helpers. These power the lobby's
 * "Starter: Fireball · Difficulty: Medium" line, so a regression
 * that returns null or skips a class breaks the create screen
 * silently.
 */
describe('getStarterSkillForClass', () => {
  const classes = Object.keys(CLASS_SKILL_TREES) as CharacterClass[];
  it('returns a non-passive level-1 skill for every class', () => {
    for (const c of classes) {
      const starter = getStarterSkillForClass(c);
      expect(starter, `no starter skill for ${c}`).not.toBeNull();
      expect(starter?.startsWith('passive_')).toBe(false);
    }
  });
  it('matches the known starter for the mage (sanity-check the picker)', () => {
    expect(getStarterSkillForClass('mage')).toBe('fireball');
  });
});

describe('CLASS_DIFFICULTY', () => {
  it('covers every defined class', () => {
    for (const c of Object.keys(CLASS_SKILL_TREES) as CharacterClass[]) {
      expect(CLASS_DIFFICULTY[c], `no difficulty for ${c}`).toBeDefined();
    }
  });
});
