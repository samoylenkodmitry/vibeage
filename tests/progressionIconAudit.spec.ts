import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAME_ACTIONS, gameActionIconPath, type GameActionId } from '../packages/content/actions';
import { CLASS_SKILL_TREES, classIconPath, type CharacterClass } from '../packages/content/classes';
import {
  SPECIALIZATIONS,
  specializationIconPath,
  type SpecializationId,
} from '../packages/content/specializations';

function expectPublicAsset(path: string, message: string): void {
  expect(path.startsWith('/game/'), `${message} should be a public game asset`).toBe(true);
  expect(existsSync(join(process.cwd(), 'public', path)), `${message} missing: ${path}`).toBe(true);
}

describe('action and progression icon assets', () => {
  it('assigns every built-in action to a generated public icon', () => {
    const icons = new Set<string>();
    for (const [id, action] of Object.entries(GAME_ACTIONS) as Array<[GameActionId, (typeof GAME_ACTIONS)[GameActionId]]>) {
      expect(action.id).toBe(id);
      expect(action.icon, `${id} icon path`).toBe(gameActionIconPath(id));
      expectPublicAsset(action.icon, `${id} action icon`);
      icons.add(action.icon);
    }
    expect(icons.size).toBe(Object.keys(GAME_ACTIONS).length);
  });

  it('assigns every class tree to a generated public icon', () => {
    const icons = new Set<string>();
    for (const [id, tree] of Object.entries(CLASS_SKILL_TREES) as Array<[CharacterClass, (typeof CLASS_SKILL_TREES)[CharacterClass]]>) {
      expect(tree.icon, `${id} icon path`).toBe(classIconPath(id));
      expectPublicAsset(tree.icon, `${id} class icon`);
      icons.add(tree.icon);
    }
    expect(icons.size).toBe(Object.keys(CLASS_SKILL_TREES).length);
  });

  it('assigns every specialization to a generated public icon', () => {
    const icons = new Set<string>();
    for (const [id, spec] of Object.entries(SPECIALIZATIONS) as Array<[SpecializationId, (typeof SPECIALIZATIONS)[SpecializationId]]>) {
      expect(spec.icon, `${id} icon path`).toBe(specializationIconPath(id));
      expectPublicAsset(spec.icon, `${id} spec icon`);
      icons.add(spec.icon);
    }
    expect(icons.size).toBe(Object.keys(SPECIALIZATIONS).length);
  });
});
