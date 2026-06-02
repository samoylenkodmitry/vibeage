import { SKILLS } from '../../../../packages/content/skills';

export const DEFAULT_CAST_VISIBLE_MS = 3_000;
export const TIME_FIELD_FADE_MS = 700;

export function getCastEffectRadius(skillId: string): number {
  const skill = getSkill(skillId);
  if (!skill) {
    return 1.4;
  }

  const shape = skill.shape;
  if (shape?.kind === 'circle') {
    return shape.radius;
  }
  if (shape?.kind === 'donut') {
    return shape.outerRadius;
  }
  if (shape?.kind === 'cone') {
    return shape.length;
  }

  return skill.projectile?.splashRadius ?? skill.area ?? 1.4;
}

export function getTimeStopDurationMs(skillId: string): number {
  const skill = getSkill(skillId);
  const effect = skill?.effects.find((candidate) => candidate.type === 'timeStop');
  return effect?.durationMs ?? 0;
}

export function getCastVisibleMs(skillId: string): number {
  const timeStopDurationMs = getTimeStopDurationMs(skillId);
  if (timeStopDurationMs > 0) {
    return timeStopDurationMs + TIME_FIELD_FADE_MS;
  }
  return DEFAULT_CAST_VISIBLE_MS;
}

function getSkill(skillId: string): (typeof SKILLS)[keyof typeof SKILLS] | null {
  return Object.prototype.hasOwnProperty.call(SKILLS, skillId)
    ? SKILLS[skillId as keyof typeof SKILLS]
    : null;
}
