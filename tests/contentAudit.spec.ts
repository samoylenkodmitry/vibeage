import { describe, expect, it } from 'vitest';
import {
  findUnquestedBosses,
  findUnreachableSkills,
  findUnusedItems,
} from '../packages/content/obtainability';
import { ITEMS } from '../packages/content/items';
import { MINI_BOSSES } from '../packages/content/miniBosses';
import { SKILLS, UNIVERSAL_SKILLS } from '../packages/content/skills';
import { CLASS_SKILL_TREES } from '../packages/content/classes';
import { SPECIALIZATIONS } from '../packages/content/specializations';

// §49/M1+ — content audit queries. These are *soft* signals
// surfaced in docs/UNLINKED.md, not CI fails. The tests pin
// invariants the queries themselves should satisfy.

describe('findUnusedItems', () => {
  it('every returned id resolves to a real item', () => {
    for (const id of findUnusedItems()) {
      expect(ITEMS[id], `unused item ${id} should exist in ITEMS`).toBeDefined();
    }
  });

  it('none of the returned items are consumable / equippable / currency / recipe input', () => {
    const inputs = new Set<string>();
    for (const item of Object.values(ITEMS)) {
      if (item.recipe) for (const i of item.recipe.inputs) inputs.add(i.itemId);
    }
    for (const id of findUnusedItems()) {
      const item = ITEMS[id];
      expect(item.type, `${id} reported as unused but is consumable`).not.toBe('consumable');
      expect(item.type, `${id} reported as unused but is currency`).not.toBe('currency');
      expect(item.equip, `${id} reported as unused but is equippable`).toBeUndefined();
      expect(inputs.has(id), `${id} reported as unused but is a recipe input`).toBe(false);
    }
  });
});

describe('findUnreachableSkills', () => {
  it('every returned id resolves to a real skill', async () => {
    const ids = await findUnreachableSkills();
    for (const id of ids) {
      expect(SKILLS[id as keyof typeof SKILLS], `unreachable skill ${id} should exist in SKILLS`).toBeDefined();
    }
  });

  it('none of the returned skills are referenced anywhere', async () => {
    const ids = await findUnreachableSkills();
    const reachable = new Set<string>(UNIVERSAL_SKILLS);
    for (const tree of Object.values(CLASS_SKILL_TREES)) {
      for (const k of Object.keys(tree.skillProgression)) reachable.add(k);
    }
    for (const spec of Object.values(SPECIALIZATIONS)) {
      for (const k of spec.specSkills ?? []) reachable.add(k);
      for (const k of spec.proficiencySkills ?? []) reachable.add(k);
    }
    for (const id of ids) {
      expect(reachable.has(id), `${id} reported as unreachable but is in class/spec/universal`).toBe(false);
    }
  });
});

describe('findUnquestedBosses', () => {
  it('every returned id resolves to a real mini-boss', () => {
    for (const id of findUnquestedBosses()) {
      expect(MINI_BOSSES[id], `boss ${id} should exist in MINI_BOSSES`).toBeDefined();
    }
  });
});
