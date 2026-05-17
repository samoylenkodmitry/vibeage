import { UNIVERSAL_SKILLS, type SkillId } from '../../../packages/content/skills';
import type { PlayerEntity } from './gameTypes';

export const SKILL_BAR_SLOT_COUNT = 4;
export const SKILL_BAR_HOTKEYS = ['Q', '2', '3', '4'] as const;
export const BASIC_ATTACK_HOTKEY = 'A';
export const BASIC_ATTACK_SKILL_ID: SkillId = 'basicAttack';

export function getHotkeySkill(
  player: PlayerEntity | null,
  slotIndex: number,
): SkillId | null {
  // Filter universal skills out of the regular bar — they live on the
  // dedicated Attack button so they don't squat one of the 4 slots.
  const shortcuts = (player?.skillShortcuts ?? []).filter(
    (skill): skill is SkillId => Boolean(skill) && !isUniversalSkill(skill),
  );
  const fallback = (player?.unlockedSkills ?? []).filter((skill) => !isUniversalSkill(skill));
  return shortcuts[slotIndex] ?? fallback[slotIndex] ?? null;
}

function isUniversalSkill(skillId: string): boolean {
  return (UNIVERSAL_SKILLS as readonly string[]).includes(skillId);
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

export function isBasicAttackKeyboardCode(code: string): boolean {
  return code === 'KeyA';
}

export function getSkillSlotAriaHotkeys(slotIndex: number): string {
  return slotIndex === 0 ? 'Q 1' : SKILL_BAR_HOTKEYS[slotIndex] ?? '';
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'));
}
