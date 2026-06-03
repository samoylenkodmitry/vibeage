import type { SkillDef } from '../../packages/content/skills.js';
import type { Cast } from './skillSystem.js';

export function resolveLegacyAreaCenter(cast: Cast, skill: SkillDef): Cast['origin'] {
  if (skill.projectile) {
    return cast.pos ?? cast.target ?? cast.origin;
  }
  if (skill.requiresTarget && cast.target) {
    return cast.target;
  }
  return cast.pos ?? cast.origin;
}
