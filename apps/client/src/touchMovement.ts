export const TOUCH_MOVE_THROTTLE_MS = 120;

export function shouldEmitDragMove(
  now: number,
  lastSentMs: number,
  throttleMs: number = TOUCH_MOVE_THROTTLE_MS,
): boolean {
  return now - lastSentMs >= throttleMs;
}

export function shouldStartDragMove(
  pointer: { button: number; pointerType?: string },
  activeTouchCount: number,
): boolean {
  if (pointer.button !== 0) {
    return false;
  }
  if (pointer.pointerType === 'touch' && activeTouchCount >= 2) {
    return false;
  }
  return true;
}

export function shouldContinueDragMove(activeTouchCount: number, isTouchPointer: boolean): boolean {
  if (!isTouchPointer) {
    return true;
  }
  return activeTouchCount < 2;
}
