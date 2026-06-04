import type { CharacterClass } from '../../packages/content/classes.js';
import { CLASS_AUTO_PASSIVE_SKILL } from '../../packages/content/classPassives.js';
import { SKILLS, UNIVERSAL_SKILLS, type SkillId } from '../../packages/content/skills.js';

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

const DEFAULT_UNLOCKED_SKILLS: SkillId[] = [STARTER_SKILL_BY_CLASS.mage];

export function starterSkillsFor(className: CharacterClass | string | undefined): SkillId[] {
  const key = className as CharacterClass;
  const starter = STARTER_SKILL_BY_CLASS[key] ?? STARTER_SKILL_BY_CLASS.mage;
  // PR PP — auto-granted class passive goes in unlockedSkills the
  // moment the character spawns. The Contribution registry walks
  // unlockedSkills to apply class HP/MP/dmg/speed deltas, so this
  // is what makes a warrior tankier than a mage.
  const autoPassive = CLASS_AUTO_PASSIVE_SKILL[key];
  // Class starter goes first so the client's default action-bar seed
  // (activeSkillsFor) puts it in the first slot. Universal skills (Basic
  // Attack) follow; passives are filtered out of the bar seed entirely.
  const out: SkillId[] = [starter, ...UNIVERSAL_SKILLS];
  if (autoPassive) out.push(autoPassive);
  return out;
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

export const BASE_XP_TO_NEXT_LEVEL = 100;
export const XP_TO_NEXT_LEVEL_LINEAR_STEP = 60;
export const XP_TO_NEXT_LEVEL_QUADRATIC_START = 10;
export const XP_TO_NEXT_LEVEL_QUADRATIC_STEP = 15;

export function getExperienceToNextLevel(level: number): number {
  const normalizedLevel = normalizePlayerLevel(level);
  const levelOffset = normalizedLevel - 1;
  const rampOffset = Math.max(0, normalizedLevel - XP_TO_NEXT_LEVEL_QUADRATIC_START);
  return Math.floor(
    BASE_XP_TO_NEXT_LEVEL
    + (levelOffset * XP_TO_NEXT_LEVEL_LINEAR_STEP)
    + (rampOffset * rampOffset * XP_TO_NEXT_LEVEL_QUADRATIC_STEP),
  );
}

function isSkillId(value: unknown): value is SkillId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SKILLS, value);
}

export function normalizeUnlockedSkills(
  rawSkills: unknown,
  className?: CharacterClass | string,
): SkillId[] {
  const skills = arrayInput(rawSkills);
  const normalized: SkillId[] = [];

  for (const skill of skills) {
    if (isSkillId(skill) && !normalized.includes(skill)) {
      normalized.push(skill);
    }
  }

  // Guarantee at least one starter skill so the bar isn't empty. When the
  // caller knows the class, use that class's starter; otherwise fall back to
  // the legacy DEFAULT_UNLOCKED_SKILLS (mage).
  const starters = className ? starterSkillsFor(className) : DEFAULT_UNLOCKED_SKILLS;
  if (!starters.some((starter) => normalized.includes(starter))) {
    for (const starter of starters) {
      if (!normalized.includes(starter)) {
        normalized.push(starter);
      }
    }
  }

  // Universal skills (Basic Attack) are unconditionally restored on
  // every hydrate — older saves predate the universal-skills concept
  // and would otherwise come back without their Attack button.
  for (const universal of UNIVERSAL_SKILLS) {
    if (!normalized.includes(universal)) {
      normalized.push(universal);
    }
  }

  return normalized;
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
