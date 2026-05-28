import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SKILLS } from '../packages/content/skills';
import { GAME_ACTIONS } from '../packages/content/actions';
import { SPECIALIZATIONS } from '../packages/content/specializations';
import { CLASS_SKILL_TREES } from '../packages/content/classes';
import { EFFECT_SPECS } from '../packages/content/effects';

/**
 * Every icon a registry hands the client must resolve to a real file
 * under public/ — a generated-icon drop that misses a slug ships a 404
 * (blank tile in the action bar / wiki). Items have their own audit
 * (itemIconAudit.spec.ts); this covers the rest.
 */
const publicPath = (icon: string) => join(process.cwd(), 'public', icon);

function expectIconExists(label: string, icon: string) {
  expect(icon.startsWith('/game/'), `${label} icon should be a public asset: ${icon}`).toBe(true);
  expect(existsSync(publicPath(icon)), `${label} icon file missing: ${icon}`).toBe(true);
}

describe('icon assets exist for every referenced content icon', () => {
  it('every skill icon resolves to a file', () => {
    for (const [id, skill] of Object.entries(SKILLS)) expectIconExists(`skill ${id}`, skill.icon);
  });

  it('every game action icon resolves to a file', () => {
    for (const action of Object.values(GAME_ACTIONS)) expectIconExists(`action ${action.id}`, action.icon);
  });

  it('every specialization icon resolves to a file', () => {
    for (const [id, spec] of Object.entries(SPECIALIZATIONS)) expectIconExists(`spec ${id}`, spec.icon);
  });

  it('every class icon resolves to a file', () => {
    for (const [cls, tree] of Object.entries(CLASS_SKILL_TREES)) expectIconExists(`class ${cls}`, tree.icon);
  });

  it('every status-effect icon resolves to a file', () => {
    for (const [type, spec] of Object.entries(EFFECT_SPECS)) expectIconExists(`effect ${type}`, spec.icon);
  });
});
