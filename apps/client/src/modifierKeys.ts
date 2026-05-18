/**
 * PR X — track whether a force-cast modifier (Ctrl) is currently
 * pressed, so the cast path can read it without threading event
 * objects through every callback. A single module-scoped boolean
 * updated on document-level key events; one listener for the whole
 * client.
 *
 * Ctrl held while clicking a skill / hotkey fires the cast with
 * `force: true`, bypassing the friendly-fire gate so the player can
 * deliberately heal an enemy / attack an ally if they really want.
 */
let ctrlHeld = false;

if (typeof window !== 'undefined') {
  const update = (event: KeyboardEvent | MouseEvent) => {
    ctrlHeld = Boolean(event.ctrlKey || event.metaKey);
  };
  window.addEventListener('keydown', update, true);
  window.addEventListener('keyup', update, true);
  window.addEventListener('mousedown', update, true);
  window.addEventListener('mouseup', update, true);
  window.addEventListener('blur', () => { ctrlHeld = false; });
}

export function isForceCastHeld(): boolean {
  return ctrlHeld;
}
