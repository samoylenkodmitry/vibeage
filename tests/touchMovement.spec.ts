import { describe, expect, test } from 'vitest';
import {
  shouldContinueDragMove,
  shouldEmitDragMove,
  shouldStartDragMove,
  TOUCH_MOVE_THROTTLE_MS,
} from '../apps/client/src/touchMovement';

describe('shouldStartDragMove', () => {
  test('rejects right and middle mouse buttons so camera drag and context menus stay free', () => {
    expect(shouldStartDragMove({ button: 1, pointerType: 'mouse' }, 0)).toBe(false);
    expect(shouldStartDragMove({ button: 2, pointerType: 'mouse' }, 0)).toBe(false);
  });

  test('accepts left mouse without touching the touch counter', () => {
    expect(shouldStartDragMove({ button: 0, pointerType: 'mouse' }, 0)).toBe(true);
    expect(shouldStartDragMove({ button: 0, pointerType: 'mouse' }, 5)).toBe(true);
  });

  test('accepts a single-finger touch but yields to the two-finger camera gesture', () => {
    expect(shouldStartDragMove({ button: 0, pointerType: 'touch' }, 1)).toBe(true);
    expect(shouldStartDragMove({ button: 0, pointerType: 'touch' }, 2)).toBe(false);
    expect(shouldStartDragMove({ button: 0, pointerType: 'touch' }, 3)).toBe(false);
  });
});

describe('shouldContinueDragMove', () => {
  test('keeps mouse drag alive regardless of phantom touch counts', () => {
    expect(shouldContinueDragMove(2, false)).toBe(true);
  });

  test('cancels touch drag the moment a second finger lands so the camera takes over', () => {
    expect(shouldContinueDragMove(0, true)).toBe(true);
    expect(shouldContinueDragMove(1, true)).toBe(true);
    expect(shouldContinueDragMove(2, true)).toBe(false);
  });
});

describe('shouldEmitDragMove', () => {
  test('throttles updates so we do not flood the server with MoveIntents', () => {
    expect(shouldEmitDragMove(1_000, 1_000, 100)).toBe(false);
    expect(shouldEmitDragMove(1_099, 1_000, 100)).toBe(false);
    expect(shouldEmitDragMove(1_100, 1_000, 100)).toBe(true);
    expect(shouldEmitDragMove(2_000, 1_000, 100)).toBe(true);
  });

  test('uses the standard throttle constant by default', () => {
    expect(shouldEmitDragMove(TOUCH_MOVE_THROTTLE_MS, 0)).toBe(true);
    expect(shouldEmitDragMove(TOUCH_MOVE_THROTTLE_MS - 1, 0)).toBe(false);
  });
});
