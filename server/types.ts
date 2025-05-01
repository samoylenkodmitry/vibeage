import { SkillId, SKILLS } from '../shared/skillsDefinition.js';
import { VecXZ } from '../shared/messages.js';

export interface SkillEffect {
    id?: string;
    type: string;
    value: number;
    durationMs: number;
    startTimeTs?: number;
    sourceSkill?: string;
}

export interface SkillDefinition {
    id: SkillId;
    cat: string;
    manaCost: number;
    cooldownMs: number;
    castMs: number;     // Changed from castTimeMs to match shared definition
    dmg?: number;       // Changed from damage to match shared definition
    range: number;
    area?: number;      // Changed from areaOfEffect to match shared definition
    speed?: number;     // Projectile speed
    status?: {type:string; value:number; durationMs:number}[]; // Changed from statusEffect to match shared definition
}

export interface Projectile {
    id: string;
    casterId: string;
    skillId: SkillId;
    pos: VecXZ;
    dir: VecXZ;
    speed: number;
    spawnTs: number;
    targetId?: string;  // Optional for homing projectiles
    hitTargets?: string[];  // Track entities that have been hit by this projectile
    hitCount?: number;  // Track number of hits for piercing projectiles
}

export type SkillType = SkillId;   // export for compatibility

// Add an alias for 'water' skill ID to match 'waterSplash'
(SKILLS as any)['water'] = SKILLS['waterSplash'];
