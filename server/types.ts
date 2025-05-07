import { SkillId, SKILLS, SkillDef, SkillEffect as SharedSkillEffect } from '../shared/skillsDefinition.js';
import { VecXZ } from '../shared/messages.js';
import { CharacterClass } from '../shared/classSystem.js';
import { SkillType } from '../shared/skillsDefinition.js';

// Server-side representation of a skill effect
export interface SkillEffect extends SharedSkillEffect {
    id?: string;
    startTimeTs?: number;
    sourceSkill?: string;
}

// Re-export SkillDef for server
export type { SkillDef };

export interface Projectile {
    id: string;
    casterId: string;
    skillId: SkillId;
    pos: VecXZ;
    dir: VecXZ;
    speed: number;
    spawnTs: number;
    targetId?: string;  // Optional for homing projectiles
    hitTargets: string[];  // Track entities that have been hit by this projectile
    hitCount: number;  // Track number of hits for piercing projectiles
}

export type { SkillType }

// Add an alias for 'water' skill ID to match 'waterSplash'
(SKILLS as any)['water'] = SKILLS['waterSplash'];

// Player class data - stores class and unlocked skills
export interface PlayerClassData {
    className: CharacterClass;
    unlockedSkills: SkillId[];
    activeSkills: SkillId[]; // Skills currently equipped (limited by slots)
    availableSkillPoints: number;
}
