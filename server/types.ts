import { SkillId, SKILLS } from '../shared/skillsDefinition.js';

export interface SkillEffect {
    id?: string;
    type: string;
    value: number;
    durationMs: number;
    startTimeTs?: number;
    sourceSkill?: string;
}

export interface SkillDefinition {
    manaCost: number;
    cooldownMs: number;
    castTimeMs: number;
    damage: number;
    statusEffect: SkillEffect;
    range: number;
    areaOfEffect?: number;
}

export type SkillType = SkillId;   // export for compatibility

// Add an alias for 'water' skill ID to match 'waterSplash'
(SKILLS as any)['water'] = SKILLS['waterSplash'];
