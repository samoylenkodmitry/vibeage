import { useCallback, useEffect, useState } from 'react';
import type { SkillId } from '../../../../packages/content/skills';
import { SKILL_BAR_ROW_COUNT, SKILL_BAR_SECONDARY_ROW_COUNT } from '../skillShortcuts';

export const ACTION_BAR_SLOT_COUNT = SKILL_BAR_ROW_COUNT + SKILL_BAR_SECONDARY_ROW_COUNT;

/**
 * Unified action-bar slot reference. Everything the player can put on
 * the bar reduces to one of two kinds:
 *   - `skill`: a learned skill (basic Attack is just the `basicAttack`
 *     skill) — fired with castSkill.
 *   - `item`: an inventory item template id (gear and consumables alike)
 *     — activated by using/equipping the first owned stack.
 * There is deliberately no third "action"/"gear"/"fallback" tier.
 */
export type ActionRef =
  | { kind: 'skill'; id: SkillId }
  | { kind: 'item'; id: string }
  | { kind: 'action'; id: string };

const STORAGE_KEY = 'vibeage:actionBar:v1';
const LOCK_STORAGE_KEY = 'vibeage:actionBar:locked:v1';

function loadLocked(): boolean {
  try {
    // Default unlocked everywhere. Touch drag is long-press initiated, so a
    // quick tap still casts and a swipe still scrolls — accidental drags
    // aren't a concern, and locking-by-default would just hide the feature.
    return window.localStorage.getItem(LOCK_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Drag a skill out of the skill tree onto a bar slot. Payload: `{ skillId }`. */
export const SKILL_DRAG_MIME = 'application/x-vibeage-skill';
/** Drag a built-in action (Move/Pickup) onto a bar slot. Payload: `{ actionId }`. */
export const ACTION_DRAG_MIME = 'application/x-vibeage-action';
/** Reorder within the bar: drag one slot onto another. Payload: `{ fromSlot }`. */
export const ACTION_BAR_DRAG_MIME = 'application/x-vibeage-actionbar-slot';

function isActionRef(value: unknown): value is ActionRef {
  if (!value || typeof value !== 'object') return false;
  const ref = value as { kind?: unknown; id?: unknown };
  const kindOk = ref.kind === 'skill' || ref.kind === 'item' || ref.kind === 'action';
  return kindOk && typeof ref.id === 'string';
}

function loadFromStorage(): (ActionRef | null)[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return Array.from({ length: ACTION_BAR_SLOT_COUNT }, (_, i) =>
      isActionRef(parsed[i]) ? (parsed[i] as ActionRef) : null);
  } catch {
    return null;
  }
}

function saveToStorage(bar: (ActionRef | null)[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bar));
  } catch {
    // localStorage unavailable (private mode / quota) — ignore.
  }
}

/** Seed an empty bar from the player's default active skills (one per
 *  slot, in order) so a fresh player isn't staring at a blank bar. */
function seedFromSkills(defaultSkills: readonly SkillId[]): (ActionRef | null)[] {
  return Array.from({ length: ACTION_BAR_SLOT_COUNT }, (_, i) => {
    const skill = defaultSkills[i];
    return skill ? { kind: 'skill', id: skill } : null;
  });
}

/** First bag slot holding `itemId` with quantity > 0 (for use-routing). */
export function findBagSlotForItem(
  inventory: readonly { itemId: string; quantity: number; slotIndex?: number }[],
  itemId: string,
): number | null {
  for (const slot of inventory) {
    if (slot.itemId === itemId && slot.quantity > 0) {
      return slot.slotIndex ?? inventory.indexOf(slot);
    }
  }
  return null;
}

export function useActionBar(defaultSkills: readonly SkillId[]) {
  const [actionBar, setBar] = useState<(ActionRef | null)[]>(() => loadFromStorage() ?? seedFromSkills(defaultSkills));
  // First load with no stored bar seeds from the current skill set; once
  // the player customizes, the stored layout wins (no re-seed).
  const [seeded, setSeeded] = useState<boolean>(() => loadFromStorage() !== null);
  useEffect(() => {
    if (seeded) return;
    if (defaultSkills.length === 0) return;
    setBar((prev) => (prev.some(Boolean) ? prev : seedFromSkills(defaultSkills)));
    setSeeded(true);
  }, [seeded, defaultSkills]);

  useEffect(() => {
    if (seeded) saveToStorage(actionBar);
  }, [actionBar, seeded]);

  // Place a ref on a slot. Slots are independent shortcuts: the same
  // skill/item/action may sit in any number of slots (no dedup) — pressing
  // a slot just invokes whatever it holds.
  const setSlot = useCallback((slotIndex: number, ref: ActionRef | null) => {
    if (slotIndex < 0 || slotIndex >= ACTION_BAR_SLOT_COUNT) return;
    setSeeded(true);
    setBar((prev) => {
      const next = [...prev];
      next[slotIndex] = ref;
      return next;
    });
  }, []);

  const clearSlot = useCallback((slotIndex: number) => {
    setSeeded(true);
    setBar((prev) => {
      if (slotIndex < 0 || slotIndex >= ACTION_BAR_SLOT_COUNT || prev[slotIndex] === null) return prev;
      const next = [...prev];
      next[slotIndex] = null;
      return next;
    });
  }, []);

  const swapSlots = useCallback((from: number, to: number) => {
    if (from === to) return;
    setSeeded(true);
    setBar((prev) => {
      if (from < 0 || to < 0 || from >= ACTION_BAR_SLOT_COUNT || to >= ACTION_BAR_SLOT_COUNT) return prev;
      const next = [...prev];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }, []);

  // Lock = "freeze" the bar so taps only cast/use and nothing can be
  // dragged onto, off, or within it. Mainly for touch, where an
  // accidental drag during combat is easy; persisted so it sticks.
  const [locked, setLocked] = useState<boolean>(() => loadLocked());
  const toggleLocked = useCallback(() => {
    setLocked((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(LOCK_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // localStorage unavailable — keep in-memory only.
      }
      return next;
    });
  }, []);

  return { actionBar, setSlot, clearSlot, swapSlots, locked, toggleLocked };
}
