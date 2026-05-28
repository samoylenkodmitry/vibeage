import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ITEMS, itemIconPath } from '../packages/content/items';

describe('item icon assets', () => {
  it('assigns every item to a generated public icon', () => {
    const icons = new Set<string>();
    for (const [id, item] of Object.entries(ITEMS)) {
      expect(item.icon, `${id} icon path`).toBe(itemIconPath(id));
      expect(item.icon.startsWith('/game/items/'), `${id} icon should be public item asset`).toBe(true);
      expect(
        existsSync(join(process.cwd(), 'public', item.icon)),
        `${id} icon file missing: ${item.icon}`,
      ).toBe(true);
      icons.add(item.icon);
    }
    expect(icons.size, 'item icons should be unique per item id').toBe(Object.keys(ITEMS).length);
  });
});
