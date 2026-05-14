import type { SkillId } from '../../../packages/content/skills';
import type { PlayerEntity } from './gameTypes';

export const SKILL_BAR_SLOT_COUNT = 4;
export const SKILL_BAR_HOTKEYS = ['Q', '2', '3', '4'] as const;

export function getHotkeySkill(
  player: PlayerEntity | null,
  slotIndex: number,
): SkillId | null {
  return player?.skillShortcuts?.[slotIndex] ?? player?.unlockedSkills?.[slotIndex] ?? null;
}

export function getSkillSlotIndexForKeyboardCode(code: string): number | null {
  if (code === 'KeyQ' || code === 'Digit1') {
    return 0;
  }

  if (code === 'Digit2') {
    return 1;
  }

  if (code === 'Digit3') {
    return 2;
  }

  if (code === 'Digit4') {
    return 3;
  }

  return null;
}

export function getSkillSlotAriaHotkeys(slotIndex: number): string {
  return slotIndex === 0 ? 'Q 1' : SKILL_BAR_HOTKEYS[slotIndex] ?? '';
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'));
}
