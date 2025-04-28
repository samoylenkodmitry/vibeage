// Temporary adapter to maintain compatibility with old skill definition structure
import { SKILLS, SkillId } from '../shared/skillsDefinition.js';
import { SkillType, SkillDefinition } from './types.js';

// Legacy adapter for the old skill structure
export const SKILLS_LEGACY: Record<SkillType, SkillDefinition> = {
    fireball: {
        manaCost: SKILLS.fireball.manaCost,
        cooldownMs: SKILLS.fireball.cooldownMs,
        castTimeMs: SKILLS.fireball.castMs,
        damage: SKILLS.fireball.dmg || 0,
        range: SKILLS.fireball.range || 0,
        statusEffect: {
            type: 'burn',
            value: 5,
            durationMs: 5000,
        }
    },
    iceBolt: {
        manaCost: SKILLS.iceBolt.manaCost,
        cooldownMs: SKILLS.iceBolt.cooldownMs, 
        castTimeMs: SKILLS.iceBolt.castMs,
        damage: SKILLS.iceBolt.dmg || 0,
        range: SKILLS.iceBolt.range || 0,
        statusEffect: {
            type: 'slow',
            value: 0.5,
            durationMs: 3000,
        }
    },
    waterSplash: {
        manaCost: SKILLS.waterSplash.manaCost,
        cooldownMs: SKILLS.waterSplash.cooldownMs,
        castTimeMs: SKILLS.waterSplash.castMs,
        damage: SKILLS.waterSplash.dmg || 0,
        range: SKILLS.waterSplash.range || 0,
        areaOfEffect: SKILLS.waterSplash.area,
        statusEffect: {
            type: 'waterWeakness',
            value: 1.5,
            durationMs: 10000,
        }
    },
    petrify: {
        manaCost: SKILLS.petrify.manaCost,
        cooldownMs: SKILLS.petrify.cooldownMs,
        castTimeMs: SKILLS.petrify.castMs,
        damage: SKILLS.petrify.dmg || 0,
        range: SKILLS.petrify.range || 0,
        statusEffect: {
            type: 'stun',
            value: 1,
            durationMs: 2000,
        }
    }
};

// Add an alias for 'water' skill ID to match 'waterSplash'
(SKILLS_LEGACY as any)['water'] = SKILLS_LEGACY['waterSplash'];
