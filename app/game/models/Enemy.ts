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
}

// Configuration object for experience and other game settings
// This makes it easy to adjust values in one place
export const GameConfig = {
  experience: {
    baseMultiplier: 2.5, // Increased from 1.0 to 2.5 for more XP
    levelScaling: 0.25,  // Increased from 0.2 to 0.25
    donationBoost: 0.0,  // Additional XP multiplier for donations, starts at 0
    bonusEvents: {
      active: false,     // Whether a bonus XP event is active
      multiplier: 1.0    // Bonus XP event multiplier
    }
  },
  // Can add other game configuration sections here in the future
};

// Calculate the final experience value with all multipliers applied
export const calculateExperienceValue = (baseExp: number, level: number): number => {
  const { baseMultiplier, levelScaling, donationBoost, bonusEvents } = GameConfig.experience;
  // TODO this should involve current player level
  
  // Apply base multiplier
  let expValue = baseExp * baseMultiplier;
  
  // Apply level scaling
  expValue *= (1 + (level - 1) * levelScaling);
  
  // Apply donation boost if any
  expValue *= (1 + donationBoost);
  
  // Apply bonus event multiplier if active
  if (bonusEvents.active) {
    expValue *= bonusEvents.multiplier;
  }
  
  return Math.floor(expValue);
};

// Update donation boost multiplier
export const setDonationBoost = (boostMultiplier: number): void => {
  GameConfig.experience.donationBoost = boostMultiplier;
};

// Toggle bonus XP event
export const toggleBonusEvent = (active: boolean, multiplier = 1.5): void => {
  GameConfig.experience.bonusEvents.active = active;
  if (active) {
    GameConfig.experience.bonusEvents.multiplier = multiplier;
  }
};

export const createEnemy = (
  type: string, 
  level: number = 1,
  position = { x: 0, y: 0, z: 0 }
): Enemy => {
  // Different enemy types have different base stats
  const enemyTypes = {
    'goblin': { 
      health: 50, 
      damage: 5, 
      range: 1.5,
      expValue: 10
    },
    'wolf': { 
      health: 40, 
      damage: 7, 
      range: 2,
      expValue: 15
    },
    'skeleton': { 
      health: 60, 
      damage: 8, 
      range: 3,
      expValue: 20
    },
    'orc': {
      health: 75,
      damage: 10,
      range: 2,
      expValue: 25
    },
    'troll': {
      health: 100,
      damage: 15,
      range: 2.5,
      expValue: 35
    }
  };

  const typeData = enemyTypes[type as keyof typeof enemyTypes] || enemyTypes.goblin;
  const levelMultiplier = 1 + (level - 1) * 0.2;

  return {
    id: `enemy-${type}-${Math.random().toString(36).substring(2, 9)}`,
    type,
    name: `${type.charAt(0).toUpperCase() + type.slice(1)} Lvl ${level}`,
    level,
    position,
    spawnPosition: { ...position }, // Store initial spawn position
    rotation: { x: 0, y: 0, z: 0 },
    health: Math.floor(typeData.health * levelMultiplier),
    maxHealth: Math.floor(typeData.health * levelMultiplier),
    isAlive: true,
    attackDamage: Math.floor(typeData.damage * levelMultiplier),
    attackRange: typeData.range,
    baseExperienceValue: typeData.expValue, // Store the base value without multipliers
    experienceValue: calculateExperienceValue(typeData.expValue, level) // Store the final calculated value with multipliers
  };
};