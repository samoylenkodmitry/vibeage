import { SKILLS, type SkillId } from '../../packages/content/skills.js';

export const SKILL_SHORTCUT_SLOTS = 9;
export const DEFAULT_UNLOCKED_SKILLS: SkillId[] = ['fireball'];
export const DEFAULT_AVAILABLE_SKILL_POINTS = 1;

function isSkillId(value: unknown): value is SkillId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SKILLS, value);
}

export function normalizeUnlockedSkills(rawSkills: unknown): SkillId[] {
  const skills = Array.isArray(rawSkills) ? rawSkills : [];
  const normalized: SkillId[] = [];

  for (const skill of skills) {
    if (isSkillId(skill) && !normalized.includes(skill)) {
      normalized.push(skill);
    }
  }

  return normalized.length > 0 ? normalized : [...DEFAULT_UNLOCKED_SKILLS];
}

export function normalizeSkillShortcuts(
  rawShortcuts: unknown,
  unlockedSkills: readonly SkillId[],
): (SkillId | null)[] {
  const unlocked = new Set(unlockedSkills);
  const shortcuts: (SkillId | null)[] = Array(SKILL_SHORTCUT_SLOTS).fill(null);

  if (Array.isArray(rawShortcuts)) {
    for (let index = 0; index < SKILL_SHORTCUT_SLOTS; index += 1) {
      const skill = rawShortcuts[index];
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

export function serializeUnlockedSkills(rawSkills: unknown): string {
  return JSON.stringify(normalizeUnlockedSkills(rawSkills));
}

export function serializeSkillShortcuts(
  rawShortcuts: unknown,
  unlockedSkills: readonly SkillId[],
): string {
  return JSON.stringify(normalizeSkillShortcuts(rawShortcuts, unlockedSkills));
}
