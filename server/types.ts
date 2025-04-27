import { SkillId } from '../shared/messages';

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

export type SkillType = SkillId;

export const SKILLS: Record<SkillType, SkillDefinition> = {
    fireball: {
        manaCost: 20,
        cooldownMs: 5000, // 5 seconds
        castTimeMs: 1000, // 1 second
        damage: 50,
        range: 15,
        statusEffect: {
            type: 'burn',
            value: 5, // 5 damage per tick
            durationMs: 5000, // 5 seconds
        }
    },
    iceBolt: {
        manaCost: 15,
        cooldownMs: 3000,
        castTimeMs: 500,
        damage: 30,
        range: 15,
        statusEffect: {
            type: 'slow',
            value: 0.5, // 50% slow
            durationMs: 3000,
        }
    },
    waterSplash: {
        manaCost: 25,
        cooldownMs: 8000,
        castTimeMs: 1500,
        damage: 20,
        range: 5,
        areaOfEffect: 3, // 3 unit radius splash
        statusEffect: {
            type: 'waterWeakness',
            value: 1.5, // 50% increased fire damage
            durationMs: 10000,
        }
    },
    petrify: {
        manaCost: 40,
        cooldownMs: 15000,
        castTimeMs: 2000,
        damage: 10,
        range: 10,
        statusEffect: {
            type: 'stun',
            value: 1,
            durationMs: 2000,
        }
    }
};

// Add an alias for 'water' skill ID to match 'waterSplash'
SKILLS['water'] = SKILLS['waterSplash'];
