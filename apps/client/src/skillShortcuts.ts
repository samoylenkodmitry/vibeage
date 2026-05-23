import { isPassiveSkill, UNIVERSAL_SKILLS, type SkillId } from '../../../packages/content/skills';
import type { PlayerEntity } from './gameTypes';

export const SKILL_BAR_ROW_COUNT = 10;
export const SKILL_BAR_SECONDARY_ROW_COUNT = 10;

// Primary row: the keyboard's number row (1..0). Browser-safe — no
// reserved shortcuts collide. Replaces the F1..F12 layout that
// previously conflicted with browser help/reload/fullscreen/devtools.
export const SKILL_BAR_HOTKEYS: readonly string[] = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
];
// Secondary row: top QWERTY row (Q..P). Natural pinky-to-pinky reach
// for keyboard players; no modifier needed.
export const SKILL_BAR_SECONDARY_HOTKEYS: readonly string[] = [
  'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P',
];

const SECONDARY_KEY_CODES: readonly string[] = [
  'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP',
];

export const BASIC_ATTACK_HOTKEY = 'A';
export const BASIC_ATTACK_SKILL_ID: SkillId = 'basicAttack';

/**
 * Single source of truth for "what is bound to this skill-bar slot?".
 * Order of precedence, from most explicit to least:
 *   1. an EXPLICIT skill shortcut the player set                (kind: 'skill')
 *   2. an item shortcut the player bound via the bag tooltip   (kind: 'item')
 *   3. a fallback skill from the unlocked-skills list           (kind: 'skill')
 *
 * Pre-fix only steps 1 + 3 existed, so binding a potion to a slot
 * whose index was below `unlockedSkills.length` silently lost the
 * binding under the fallback skill. The hotkey-handler then cast
 * that skill instead of using the potion. `resolveSlotBinding` is
 * the one function both the skill bar rendering and the keydown
 * handler call, so the two can never disagree.
 */
export type SlotBinding =
  | { kind: 'skill'; id: SkillId }
  | { kind: 'item'; id: string }
  | null;

export function resolveSlotBinding(
  player: PlayerEntity | null,
  itemShortcuts: ReadonlyArray<string | null>,
  slotIndex: number,
): SlotBinding {
  const explicit = (player?.skillShortcuts ?? [])[slotIndex];
  if (explicit && !isUniversalSkill(explicit) && !isPassiveSkill(explicit)) {
    return { kind: 'skill', id: explicit };
  }
  const itemId = itemShortcuts[slotIndex];
  if (itemId) return { kind: 'item', id: itemId };
  const fallback = (player?.unlockedSkills ?? [])
    .filter((skill) => !isUniversalSkill(skill) && !isPassiveSkill(skill));
  const fallbackSkill = fallback[slotIndex];
  return fallbackSkill ? { kind: 'skill', id: fallbackSkill } : null;
}

/**
 * Back-compat wrapper: returns just the skill id for callers that
 * don't know about item shortcuts yet. Skill bar + hotkey handler
 * have moved to `resolveSlotBinding`; this stays for tests / older
 * call sites that haven't been migrated.
 */
export function getHotkeySkill(
  player: PlayerEntity | null,
  slotIndex: number,
): SkillId | null {
  const binding = resolveSlotBinding(player, [], slotIndex);
  return binding?.kind === 'skill' ? binding.id : null;
}

function isUniversalSkill(skillId: string): boolean {
  return (UNIVERSAL_SKILLS as readonly string[]).includes(skillId);
}

/**
 * Map an event.code to a 0-based slot index.
 *   Digit1..Digit9, Digit0 → 0..9 (primary number row)
 *   KeyQ..KeyP            → 10..19 (top QWERTY row)
 * Returns null for any other key. No modifier required — the two
 * rows are physically distinct keys on the keyboard.
 */
export function getSkillSlotIndexForKeyboardCode(code: string): number | null {
  const digitMatch = /^Digit([0-9])$/.exec(code);
  if (digitMatch) {
    const digit = Number(digitMatch[1]);
    return digit === 0 ? 9 : digit - 1;
  }
  const secondaryIndex = SECONDARY_KEY_CODES.indexOf(code);
  if (secondaryIndex !== -1) {
    return SKILL_BAR_ROW_COUNT + secondaryIndex;
  }
  return null;
}

export function isBasicAttackKeyboardCode(code: string): boolean {
  return code === 'KeyA';
}

export function getSkillSlotAriaHotkeys(slotIndex: number): string {
  if (slotIndex < SKILL_BAR_ROW_COUNT) return SKILL_BAR_HOTKEYS[slotIndex] ?? '';
  return SKILL_BAR_SECONDARY_HOTKEYS[slotIndex - SKILL_BAR_ROW_COUNT] ?? '';
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'));
}
