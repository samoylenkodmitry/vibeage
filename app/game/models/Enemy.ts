import { StatusEffect } from '../systems/gameStore';

// Configuration object for experience and other game settings
export const GameConfig = {
  experience: {
    baseMultiplier: 2.5,
    levelScaling: 0.25,
    donationBoost: 0.0,
    bonusEvents: {
      active: false,
      multiplier: 1.0
    }
  }
};

export interface Enemy {
  id: string;
  type: string;
  name: string;
  level: number;
  position: { x: number; y: number; z: number };
  spawnPosition: { x: number; y: number; z: number }; // Track original spawn position
  rotation: { x: number; y: number; z: number };
  health: number;
  maxHealth: number;
  isAlive: boolean;
  attackDamage: number;
  attackRange: number;
  baseExperienceValue: number; // Store the base value without multipliers
  experienceValue: number; // Store the final calculated value with multipliers
  statusEffects: StatusEffect[]; // Active status effects (made non-optional)
  targetId?: string | null; // Which player the enemy is targeting
  markedForRemoval?: boolean; // Flag for client-side cleanup
  deathTimeTs?: number; // Timestamp when the enemy died
  attackCooldown?: boolean; // Whether the enemy is in attack cooldown
}
