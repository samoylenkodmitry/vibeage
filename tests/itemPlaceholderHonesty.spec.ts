import { describe, expect, it } from 'vitest';
import { ITEMS } from '../packages/content/items';

// §45.6 — items that look like consumables (potion / elixir /
// draught / scroll) but are stored as type='material' are
// placeholders for systems that don't exist yet (no buff engine,
// no scroll handler). Their descriptions must say so explicitly
// so the wiki + tooltip don't promise a feature the engine drops.
//
// Once the buff system ships, the placeholder gets `type:
// 'consumable'` + a real description and this test stops matching
// it.

const CONSUMABLE_NAME_HINT = /\b(potion|elixir|draught|scroll)\b/i;

describe('item placeholder honesty', () => {
  it('items named like consumables but stored as material disclose they are unimplemented', () => {
    const offenders: string[] = [];
    for (const item of Object.values(ITEMS)) {
      if (item.type !== 'material') continue;
      if (!CONSUMABLE_NAME_HINT.test(item.name)) continue;
      if (/not yet implemented/i.test(item.description)) continue;
      offenders.push(`${item.id} ("${item.name}"): description does not say "not yet implemented"`);
    }
    expect(
      offenders,
      `Material-typed items with consumable-sounding names are placeholders for ` +
      `the buff / scroll system. Their descriptions must include "not yet ` +
      `implemented" so players + the wiki don't promise behavior the engine ` +
      `drops. Offenders:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
