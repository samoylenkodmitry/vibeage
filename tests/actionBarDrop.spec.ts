import { describe, expect, it } from 'vitest';
import { resolveBarDrop } from '../apps/client/src/hud/actionBarDrag';

describe('resolveBarDrop — touch drag-and-drop resolution', () => {
  it('drops a skill onto a slot → set that slot to the skill', () => {
    expect(resolveBarDrop({ kind: 'skill', id: 'fireball' }, 3)).toEqual({
      type: 'set',
      slot: 3,
      ref: { kind: 'skill', id: 'fireball' },
    });
  });

  it('drops an item onto a slot → set that slot to the item', () => {
    expect(resolveBarDrop({ kind: 'item', id: 'health_potion' }, 0)).toEqual({
      type: 'set',
      slot: 0,
      ref: { kind: 'item', id: 'health_potion' },
    });
  });

  it('drags a slot onto a different slot → swap', () => {
    expect(resolveBarDrop({ kind: 'reorder', fromSlot: 2 }, 5)).toEqual({
      type: 'swap',
      from: 2,
      to: 5,
    });
  });

  it('drags a slot onto itself → no-op', () => {
    expect(resolveBarDrop({ kind: 'reorder', fromSlot: 4 }, 4)).toEqual({ type: 'none' });
  });

  it('drags a slot off the bar → clear that slot (remove)', () => {
    expect(resolveBarDrop({ kind: 'reorder', fromSlot: 7 }, null)).toEqual({ type: 'clear', slot: 7 });
  });

  it('drops a skill off the bar → no-op (skills are not removed by dropping into the void)', () => {
    expect(resolveBarDrop({ kind: 'skill', id: 'fireball' }, null)).toEqual({ type: 'none' });
  });

  it('drops an item off the bar → no-op', () => {
    expect(resolveBarDrop({ kind: 'item', id: 'health_potion' }, null)).toEqual({ type: 'none' });
  });
});
