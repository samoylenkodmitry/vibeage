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
}

export type SkillType = 'fireball' | 'iceBolt' | 'waterSplash' | 'petrify';

export const SKILLS: Record<SkillType, SkillDefinition> = {
    fireball: {
        manaCost: 20,
        cooldownMs: 5000, // 5 seconds
        castTimeMs: 1000, // 1 second
        damage: 50,
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
        statusEffect: {
            type: 'stun',
            value: 1,
            durationMs: 2000,
        }
    }
};
