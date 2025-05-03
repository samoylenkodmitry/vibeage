import { SKILLS as SHARED_SKILLS, SkillId, SkillEffect as SharedSkillEffect, SkillEffectType as SharedSkillEffectType } from '../../../shared/skillsDefinition';

// Client-side skill interface that extends the shared definition
// with additional client-specific properties
export interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string; // Path to icon image
  damage?: number;
  manaCost: number;
  cooldownMs: number; // time in milliseconds
  range: number;
  areaOfEffect?: number;
  levelRequired: number;
  effects: SkillEffect[];
  castTimeMs: number; // 0 for instant cast, in ms
  projectileSpeed?: number; // for projectile-based skills
  durationMs?: number; // for skills with duration effects, in ms
}

// Re-export shared types
export type { SkillId };
export type SkillEffectType = SharedSkillEffectType;

// Client-side skill effect interface - explicitly add client-side property
export interface SkillEffect extends SharedSkillEffect {
  clientRendered?: boolean;
}

// Map shared skills to client-side format
function mapSharedSkillToClient(skillId: SkillId): Skill {
  const sharedSkill = SHARED_SKILLS[skillId];
  
  return {
    id: sharedSkill.id,
    name: sharedSkill.name,
    description: sharedSkill.description,
    icon: sharedSkill.icon,
    damage: sharedSkill.dmg,
    manaCost: sharedSkill.manaCost,
    cooldownMs: sharedSkill.cooldownMs,
    range: sharedSkill.range || 10,
    areaOfEffect: sharedSkill.area,
    levelRequired: sharedSkill.levelRequired,
    castTimeMs: sharedSkill.castMs,
    projectileSpeed: sharedSkill.speed,
    effects: sharedSkill.effects
  };
}

// Generate client-side skills from shared definitions
export const SKILLS: Record<string, Skill> = Object.fromEntries(
  Object.keys(SHARED_SKILLS).map(skillId => [
    skillId, 
    mapSharedSkillToClient(skillId as SkillId)
  ])
);

// Special case handling for iceBolt/icebolt name mismatch
SKILLS['icebolt'] = SKILLS['iceBolt'];