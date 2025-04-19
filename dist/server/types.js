"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SKILLS = void 0;
exports.SKILLS = {
    fireball: {
        manaCost: 20,
        cooldown: 5000, // 5 seconds
        castTime: 1000, // 1 second
        damage: 50,
        statusEffect: {
            type: 'burn',
            value: 5, // 5 damage per tick
            duration: 5000, // 5 seconds
        }
    },
    iceBolt: {
        manaCost: 15,
        cooldown: 3000,
        castTime: 500,
        damage: 30,
        statusEffect: {
            type: 'slow',
            value: 0.5, // 50% slow
            duration: 3000,
        }
    },
    waterSplash: {
        manaCost: 25,
        cooldown: 8000,
        castTime: 1500,
        damage: 20,
        statusEffect: {
            type: 'waterWeakness',
            value: 1.5, // 50% increased fire damage
            duration: 10000,
        }
    },
    petrify: {
        manaCost: 40,
        cooldown: 15000,
        castTime: 2000,
        damage: 10,
        statusEffect: {
            type: 'stun',
            value: 1,
            duration: 2000,
        }
    }
};
