import type { CharacterClass } from '../../packages/content/classes.js';
import { SKILLS, type SkillId } from '../../packages/content/skills.js';

export const SKILL_SHORTCUT_SLOTS = 9;
export const DEFAULT_AVAILABLE_SKILL_POINTS = 1;

/**
 * Per-class starter skill so every fresh character begins with a skill that
 * actually belongs to their tree. Anyone missing from the map (e.g. an
 * unknown class string) falls back to `fireball` for backwards compatibility.
 */
export const STARTER_SKILL_BY_CLASS: Record<CharacterClass, SkillId> = {
  mage: 'fireball',
  warrior: 'slash',
  healer: 'holyLight',
  ranger: 'arrowShot',
  knight: 'slash',
  paladin: 'slash',
  rogue: 'evade',
};

export const DEFAULT_UNLOCKED_SKILLS: SkillId[] = [STARTER_SKILL_BY_CLASS.mage];

export function starterSkillsFor(className: CharacterClass | string | undefined): SkillId[] {
  const key = className as CharacterClass;
  return [STARTER_SKILL_BY_CLASS[key] ?? STARTER_SKILL_BY_CLASS.mage];
}

export function numberOrFallback(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizePlayerLevel(value: unknown): number {
  return Math.max(1, Math.floor(numberOrFallback(value, 1)));
}

export function getMaxHealthForLevel(level: number): number {
  return 100 + (level - 1) * 20;
}

export function getMaxManaForLevel(level: number): number {
  return 100 + (level - 1) * 10;
}

export function getExperienceToNextLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}

function isSkillId(value: unknown): value is SkillId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SKILLS, value);
}

export function normalizeUnlockedSkills(rawSkills: unknown): SkillId[] {
  const skills = arrayInput(rawSkills);
  const normalized: SkillId[] = [];

  for (const skill of skills) {
    if (isSkillId(skill) && !normalized.includes(skill)) {
      normalized.push(skill);
    }
  }

  for (const defaultSkill of DEFAULT_UNLOCKED_SKILLS) {
    if (!normalized.includes(defaultSkill)) {
      normalized.push(defaultSkill);
    }
  }

  return normalized;
}

export function normalizeSkillShortcuts(
  rawShortcuts: unknown,
  unlockedSkills: readonly SkillId[],
): (SkillId | null)[] {
  const unlocked = new Set(unlockedSkills);
  const shortcuts: (SkillId | null)[] = Array(SKILL_SHORTCUT_SLOTS).fill(null);
  const rawShortcutValues = arrayInput(rawShortcuts);

  if (rawShortcutValues.length > 0) {
    for (let index = 0; index < SKILL_SHORTCUT_SLOTS; index += 1) {
      const skill = rawShortcutValues[index];
      shortcuts[index] = isSkillId(skill) && unlocked.has(skill) ? skill : null;
    }
  }

  if (shortcuts.some(Boolean)) {
    return shortcuts;
  }

  for (let index = 0; index < Math.min(unlockedSkills.length, SKILL_SHORTCUT_SLOTS); index += 1) {
    shortcuts[index] = unlockedSkills[index];
  }

  return shortcuts;
}

function arrayInput(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function normalizeAvailableSkillPoints(rawPoints: unknown): number {
  if (rawPoints === null || rawPoints === undefined) {
    return DEFAULT_AVAILABLE_SKILL_POINTS;
  }

  const points = typeof rawPoints === 'number' ? rawPoints : Number(rawPoints);

  if (!Number.isFinite(points) || points < 0) {
    return DEFAULT_AVAILABLE_SKILL_POINTS;
  }

  return Math.floor(points);
}
