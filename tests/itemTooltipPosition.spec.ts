import { describe, expect, it } from 'vitest';
import { computeTooltipPos } from '../apps/client/src/hud/ItemTooltip';

/**
 * User report: clicking an item in the bag opens a tooltip that
 * lands on top of the slot, hiding the icon and stack count. The
 * `computeTooltipPos` helper places the tooltip OUTSIDE the
 * source slot's bounding rect — above by default, below when
 * there's no room above, side as a third fallback. These tests
 * pin each branch so the positioning logic can't silently drift.
 */
describe('computeTooltipPos', () => {
  const w = 200, h = 120, vw = 1280, vh = 720;

  it('prefers placing the tooltip above the anchor when room exists', () => {
    const anchor = { top: 500, bottom: 540, left: 600, right: 640 };
    const pos = computeTooltipPos({ width: w, height: h, vw, vh, anchor, cursorX: 620, cursorY: 520 });
    expect(pos.top).toBe(500 - 8 - h);
    expect(pos.top + h).toBeLessThan(anchor.top);
  });

  it('falls back to placing below the anchor when there is not enough room above', () => {
    const anchor = { top: 30, bottom: 70, left: 600, right: 640 };
    const pos = computeTooltipPos({ width: w, height: h, vw, vh, anchor, cursorX: 620, cursorY: 50 });
    expect(pos.top).toBe(70 + 8);
    expect(pos.top).toBeGreaterThanOrEqual(anchor.bottom);
  });

  it('falls back to the side when neither above nor below fits', () => {
    const tightVh = 160;
    const anchor = { top: 30, bottom: 130, left: 80, right: 120 };
    const pos = computeTooltipPos({ width: w, height: h, vw, vh: tightVh, anchor, cursorX: 100, cursorY: 80 });
    expect(pos.left).toBe(120 + 8);
  });

  it('clamps horizontally inside the viewport when the anchor is at the right edge', () => {
    const anchor = { top: 500, bottom: 540, left: 1240, right: 1280 };
    const pos = computeTooltipPos({ width: w, height: h, vw, vh, anchor, cursorX: 1260, cursorY: 520 });
    expect(pos.left + w).toBeLessThanOrEqual(vw - 8);
  });

  it('without an anchor (hover path) still anchors near the cursor', () => {
    const pos = computeTooltipPos({ width: w, height: h, vw, vh, anchor: null, cursorX: 600, cursorY: 300 });
    expect(pos.top).toBe(300 - h - 12);
    expect(pos.left).toBe(600);
  });
});
