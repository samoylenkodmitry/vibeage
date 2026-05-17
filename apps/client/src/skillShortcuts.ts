import { UNIVERSAL_SKILLS, type SkillId } from '../../../packages/content/skills';
import type { PlayerEntity } from './gameTypes';

export const SKILL_BAR_ROW_COUNT = 12;
export const SKILL_BAR_SECONDARY_ROW_COUNT = 12;
export const SKILL_BAR_SLOT_COUNT = SKILL_BAR_ROW_COUNT + SKILL_BAR_SECONDARY_ROW_COUNT;

// Primary row: F1..F12. Browser shortcuts (F1 help, F5 reload, F11
// fullscreen, F12 devtools) get preventDefault in the keydown handler
// but some browsers may still intercept F11/F12 — a trade-off the
// player asked for explicitly when picking this layout.
export const SKILL_BAR_HOTKEYS: readonly string[] = [
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6',
  'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
];
// Secondary row: Ctrl+F1..F12, slots 12..23.
export const SKILL_BAR_SECONDARY_HOTKEYS: readonly string[] = SKILL_BAR_HOTKEYS.map((k) => `Ctrl+${k}`);

export const BASIC_ATTACK_HOTKEY = 'A';
export const BASIC_ATTACK_SKILL_ID: SkillId = 'basicAttack';

export function getHotkeySkill(
  player: PlayerEntity | null,
  slotIndex: number,
): SkillId | null {
  // Filter universal skills out of the regular bar — they live on the
  // dedicated Attack button so they don't squat a numbered slot.
  const shortcuts = (player?.skillShortcuts ?? []).filter(
    (skill): skill is SkillId => Boolean(skill) && !isUniversalSkill(skill),
  );
  const fallback = (player?.unlockedSkills ?? []).filter((skill) => !isUniversalSkill(skill));
  return shortcuts[slotIndex] ?? fallback[slotIndex] ?? null;
}

function isUniversalSkill(skillId: string): boolean {
  return (UNIVERSAL_SKILLS as readonly string[]).includes(skillId);
}

/**
 * Map an event.code (and ctrl modifier) to a 0-based slot index.
 * F1..F12 → slots 0..11; Ctrl+F1..F12 → slots 12..23. Legacy
 * KeyQ / Digit1 binding stays for muscle memory (mapped to slot 0).
 * Returns null for any other key.
 */
export function getSkillSlotIndexForKeyboardCode(code: string, ctrlKey = false): number | null {
  if (!ctrlKey && (code === 'KeyQ' || code === 'Digit1')) return 0;
  const fMatch = /^F([1-9]|1[0-2])$/.exec(code);
  if (!fMatch) return null;
  const base = Number(fMatch[1]) - 1;
  return ctrlKey ? SKILL_BAR_ROW_COUNT + base : base;
}

export function isBasicAttackKeyboardCode(code: string): boolean {
  return code === 'KeyA';
}

export function getSkillSlotAriaHotkeys(slotIndex: number): string {
  if (slotIndex === 0) return 'F1 Q 1';
  if (slotIndex < SKILL_BAR_ROW_COUNT) return SKILL_BAR_HOTKEYS[slotIndex] ?? '';
  return SKILL_BAR_SECONDARY_HOTKEYS[slotIndex - SKILL_BAR_ROW_COUNT] ?? '';
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'));
}
