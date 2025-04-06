'use client';

import { create } from 'zustand';
import { Character, createCharacter } from '../models/Character';
import { Enemy, createEnemy, setDonationBoost, toggleBonusEvent, GameConfig, calculateExperienceValue } from '../models/Enemy';
import { SKILLS, Skill, SkillEffect } from '../models/Skill';
import { zoneManager, GAME_ZONES } from './zoneSystem';

// StatusEffect interface for tracking active effects
export interface StatusEffect {
  id: string;
  type: string;
  value: number;
  duration: number;
  startTime: number;
  sourceSkill: string;
}

interface GameState {
  // Player state
  player: Character;
  experience: number;
  experienceToNextLevel: number;
  selectedTargetId: string | null;
  
  // Game world state
  enemies: Enemy[];
  activeProjectiles: any[];
  activeEffects: any[];
  
  // Status effect tracking
  playerStatusEffects: StatusEffect[];
  enemyStatusEffects: Record<string, StatusEffect[]>;
  
  // Skill system
  skillCooldowns: Record<string, number>;
  castingSkill: string | null;
  castingProgress: number;
  
  // Game actions
  initializePlayer: (name: string) => void;
  movePlayer: (x: number, y: number, z: number) => void;
  rotatePlayer: (y: number) => void;
  levelUp: () => void;
  selectTarget: (targetId: string | null) => void;
  castSkill: (skillId: string) => void;
  updateCastingProgress: (delta: number) => void;
  cancelCasting: () => void;
  takeDamage: (amount: number) => void;
  spendMana: (amount: number) => void;
  regenerateMana: (delta: number) => void;
  applySkillEffect: (targetId: string, effects: SkillEffect[]) => void;
  updateSkillCooldowns: (delta: number) => void;
  
  // Enemy management
  spawnEnemy: (type: string, level: number, position: {x: number, y: number, z: number}, zoneId?: string) => void;
  updateEnemies: (delta: number) => void;
  damageEnemy: (enemyId: string, damage: number) => void;
  respawnDeadEnemies: (delta: number) => void;

  // New XP boost properties
  donationXpBoost: number;
  bonusXpEventActive: boolean;
  bonusXpMultiplier: number;
  
  // New actions for XP boost management
  applyDonationBoost: (boostAmount: number, durationInMinutes?: number) => void;
  clearDonationBoost: () => void;
  toggleXpEvent: (active: boolean, multiplier?: number) => void;
  getXpMultiplierInfo: () => { total: number, base: number, donation: number, event: number };

  // Status effect actions
  applyStatusEffect: (targetId: string | 'player', effect: StatusEffect) => void;
  removeStatusEffect: (targetId: string | 'player', effectId: string) => void;
  updateStatusEffects: (delta: number) => void;
  getStatusEffects: (targetId: string | 'player') => StatusEffect[];

  // New function to get entities within a radius
  getEntitiesWithinRadius: (position: {x: number, y: number, z: number}, radius: number) => Enemy[];

  // Add new zone-related state
  currentZoneId: string | null;
  
  // Update existing actions
  updatePlayerZone: () => void;

  // New properties
  playerSkills: string[];
  selectedSkill: string | null;
  handleSkillCast: (skillId: string) => void;
  setSelectedSkill: (skillId: string | null) => void;
}

// Helper function to calculate XP needed for next level
const calculateExperienceForLevel = (level: number) => {
  return Math.floor(100 * Math.pow(1.5, level - 1));
};

export const useGameStore = create<GameState>((set, get) => ({
  // Initial state
  player: createCharacter('Player'),
  experience: 0,
  experienceToNextLevel: 100,
  selectedTargetId: null,
  enemies: [],
  activeProjectiles: [],
  activeEffects: [],
  skillCooldowns: {},
  castingSkill: null,
  castingProgress: 0,
  playerSkills: ['fireball'], // Start with fireball as the basic skill
  selectedSkill: null,
  
  // New XP boost initial state
  donationXpBoost: 0,
  bonusXpEventActive: false,
  bonusXpMultiplier: 1.0,

  // Status effect initial state
  playerStatusEffects: [],
  enemyStatusEffects: {},

  currentZoneId: null,
  
  // Actions
  initializePlayer: (name: string) => {
    set({ 
      player: createCharacter(name),
      experienceToNextLevel: calculateExperienceForLevel(1)
    });
  },
  
  movePlayer: (x: number, y: number, z: number) => {
    set(state => ({
      player: {
        ...state.player,
        position: { x, y, z }
      }
    }));
  },
  
  rotatePlayer: (y: number) => {
    set(state => ({
      player: {
        ...state.player,
        rotation: {
          ...state.player.rotation,
          y
        }
      }
    }));
  },
  
  levelUp: () => {
    set(state => {
      const newLevel = state.player.level + 1;
      const newSkills = [...state.player.skills];
      // Make sure skill IDs match exactly the ones defined in Skill.ts
      if (newLevel === 2 && !newSkills.includes('water')) {
        newSkills.push('water'); // This is correct - matches the ID in Skill.ts
      } else if (newLevel === 3 && !newSkills.includes('icebolt')) {
        newSkills.push('icebolt');
      } else if (newLevel === 4 && !newSkills.includes('petrify')) {
        newSkills.push('petrify');
      }

      return {
        player: {
          ...state.player,
          level: newLevel,
          maxHealth: state.player.maxHealth + 10,
          maxMana: state.player.maxMana + 5,
          skills: newSkills,
        },
        experience: 0,
        experienceToNextLevel: calculateExperienceForLevel(newLevel)
      };
    });
  },
  
  selectTarget: (targetId: string | null) => {
    set({ selectedTargetId: targetId });
  },
  
  castSkill: (skillId: string) => {
    const state = get();
    const skill = SKILLS[skillId];
    
    if (!skill) {
      console.log(`Skill ${skillId} not found`);
      return;
    }
    
    console.log(`Attempting to cast skill: ${skillId}, cooldown: ${state.skillCooldowns[skillId]}`);
    
    // Check if player has the skill
    if (!state.player.skills.includes(skillId)) {
      console.log("Player doesn't have this skill");
      return;
    }
    
    // Check if skill is on cooldown
    if (state.skillCooldowns[skillId] > 0) {
      console.log(`Skill ${skillId} is on cooldown: ${state.skillCooldowns[skillId].toFixed(1)}s remaining`);
      return;
    }
    
    // Check if player is already casting something
    if (state.castingSkill) {
      console.log(`Already casting ${state.castingSkill}`);
      return;
    }
    
    // Check if player has enough mana
    if (state.player.mana < skill.manaCost) {
      console.log("Not enough mana");
      return;
    }
    
    // Check if player is high enough level
    if (state.player.level < skill.levelRequired) {
      console.log("Player level too low");
      return;
    }
    
    console.log(`Starting cast of ${skillId}, castTime: ${skill.castTime}`);
    
    // Start casting
    if (skill.castTime > 0) {
      set({
        castingSkill: skillId,
        castingProgress: 0
      });
    } else {
      // Instant cast
      set(state => ({
        player: {
          ...state.player,
          mana: state.player.mana - skill.manaCost
        },
        skillCooldowns: {
          ...state.skillCooldowns,
          [skillId]: skill.cooldown
        }
      }));
      
      // Execute skill effect
      if (state.selectedTargetId) {
        get().applySkillEffect(state.selectedTargetId, skill.effects);
      }
    }
  },
  
  updateCastingProgress: (delta: number) => {
    set(state => {
      if (!state.castingSkill) return state;
      
      const skill = SKILLS[state.castingSkill];
      const newProgress = state.castingProgress + delta;
      
      // Skill cast completed
      if (newProgress >= skill.castTime) {
        console.log(`Cast completed: ${state.castingSkill}`);
        
        // Apply mana cost and set cooldown
        const newMana = state.player.mana - skill.manaCost;
        const newCooldowns = {
          ...state.skillCooldowns,
          [state.castingSkill]: skill.cooldown
        };
        
        // todo: check if skill is on area and apply to all enemies in area
        // Apply skill effect if there's a target
        if (state.selectedTargetId) {
          get().applySkillEffect(state.selectedTargetId, skill.effects);
        }
        
        return {
          player: {
            ...state.player,
            mana: newMana
          },
          castingSkill: null,
          castingProgress: 0,
          skillCooldowns: newCooldowns
        };
      }
      
      // Still casting
      return {
        castingProgress: newProgress
      };
    });
  },
  
  cancelCasting: () => {
    set({
      castingSkill: null,
      castingProgress: 0
    });
  },
  
  updateSkillCooldowns: (delta: number) => {
    set(state => {
      // If there are no cooldowns to update, return the current state without changes
      if (Object.keys(state.skillCooldowns).length === 0) {
        return state;
      }
      
      const updatedCooldowns: Record<string, number> = {};
      let hasUpdates = false;
      
      // Update all cooldowns
      for (const [skillId, cooldown] of Object.entries(state.skillCooldowns)) {
        if (cooldown > 0) {
          const newCooldown = Math.max(0, cooldown - delta);
          updatedCooldowns[skillId] = newCooldown;
          
          // Only mark as updated if the value actually changed
          if (newCooldown !== cooldown) {
            hasUpdates = true;
          }
        }
      }
      
      // Only update state if there are actual changes
      if (hasUpdates) {
        return {
          skillCooldowns: {
            ...state.skillCooldowns,
            ...updatedCooldowns
          }
        };
      }
      
      return state;
    });
  },
  
  regenerateMana: (delta: number) => {
    set(state => {
      // Don't update if already at max mana
      if (state.player.mana >= state.player.maxMana) {
        return state;
      }
      
      // Increased mana regen rate from 2% to 5% of max mana per second
      const manaRegenRate = state.player.maxMana * 0.05;
      // Add level-based bonus: +1% per level
      const levelBonus = state.player.level * 0.01;
      const totalRegenRate = manaRegenRate * (1 + levelBonus);
      const manaRegen = totalRegenRate * delta;
      
      const newMana = Math.min(
        state.player.mana + manaRegen,
        state.player.maxMana
      );
      
      // Only update if mana actually changed
      if (newMana === state.player.mana) {
        return state;
      }
      
      return {
        player: {
          ...state.player,
          mana: newMana
        }
      };
    });
  },
  
  takeDamage: (amount: number) => {
    set(state => {
      const newHealth = Math.max(0, state.player.health - amount);
      
      return {
        player: {
          ...state.player,
          health: newHealth
        }
      };
    });
  },
  
  spendMana: (amount: number) => {
    set(state => {
      const newMana = Math.max(0, state.player.mana - amount);
      
      return {
        player: {
          ...state.player,
          mana: newMana
        }
      };
    });
  },
  
  applySkillEffect: (targetId: string, effects: SkillEffect[]) => {
    const state = get();
    const targetEnemy = state.enemies.find(enemy => enemy.id === targetId);
    
    if (!targetEnemy) return;

    // Get the current skill being cast
    const skill = state.castingSkill ? SKILLS[state.castingSkill] : null;
    
    // Get the enemies to affect - either just the target or all within AoE
    let enemiesInRange = [targetEnemy];
    if (skill?.areaOfEffect) {
      // Get all enemies within the AoE radius of the target
      enemiesInRange = get().getEntitiesWithinRadius(targetEnemy.position, skill.areaOfEffect);
      console.log(`AoE skill affecting ${enemiesInRange.length} enemies within ${skill.areaOfEffect} units`);
    }

    // Apply effects to all affected enemies
    enemiesInRange.forEach(enemy => {
      effects.forEach(effect => {
        if (effect.type === 'damage') {
          // Scale damage based on player level and skill level
          const levelRequirement = skill?.levelRequired || 1;
          
          // Each level above requirement adds 20% more damage
          const levelDifference = state.player.level - levelRequirement;
          const levelMultiplier = 1 + (Math.max(0, levelDifference) * 0.2); 
          
          // Higher level skills get an additional bonus
          // Each level of the skill itself adds 25% base damage
          const skillLevelBonus = 1 + ((levelRequirement - 1) * 0.25);
          
          // Calculate final damage with both bonuses
          const scaledDamage = Math.floor(effect.value * levelMultiplier * skillLevelBonus);
          
          console.log(`Applying ${scaledDamage} damage to ${enemy.name} (base: ${effect.value}, player level bonus: ${levelMultiplier.toFixed(1)}x, skill level bonus: ${skillLevelBonus.toFixed(1)}x)`);
          get().damageEnemy(enemy.id, scaledDamage);
        } else if (effect.type === 'burn' || effect.type === 'poison' || effect.type === 'slow' || 
                  effect.type === 'freeze' || effect.type === 'transform' || effect.type === 'stun' ||
                  effect.type === 'waterWeakness') {
          // Duration effects also scale with level
          const levelRequirement = skill?.levelRequired || 1;
          const levelDifference = state.player.level - levelRequirement;
          
          // Each player level above requirement adds 10% more effect duration
          const durationMultiplier = 1 + (Math.max(0, levelDifference) * 0.1);
          const scaledDuration = effect.duration ? effect.duration * durationMultiplier : 0;
          
          console.log(`Applying ${effect.type} effect to ${enemy.name} with duration: ${scaledDuration.toFixed(1)}s (base: ${effect.duration}s, multiplier: ${durationMultiplier.toFixed(1)}x)`);
          
          // Create a status effect
          const statusEffect: StatusEffect = {
            id: `${effect.type}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            type: effect.type,
            value: effect.value,
            duration: scaledDuration,
            startTime: Date.now(),
            sourceSkill: state.castingSkill || 'unknown',
          };
          
          // Apply the status effect to the target
          get().applyStatusEffect(enemy.id, statusEffect);
          
          // Apply DOT effects immediately for the first tick
          if (effect.type === 'burn' || effect.type === 'poison') {
            const dotDamage = Math.floor(enemy.maxHealth * (effect.value / 100));
            console.log(`Applying ${effect.type} DOT to ${enemy.name}: ${dotDamage} damage (${effect.value}% of max health)`);
            get().damageEnemy(enemy.id, dotDamage);
          }
        }
      });
    });
  },
  
  spawnEnemy: (type: string, level: number, position: {x: number, y: number, z: number}, zoneId?: string) => {
    set(state => {
      const enemy = createEnemy(type, level, position);
      // Update both gameStore and zoneManager
      const newState = {
        enemies: [...state.enemies, enemy]
      };
      
      if (zoneId) {
        const zoneEnemies = state.enemies.filter(e => {
          const enemyZone = zoneManager.getZoneAtPosition(e.position);
          return enemyZone?.id === zoneId;
        });
        zoneManager.updateZoneMobs(zoneId, [...zoneEnemies, enemy].map(e => ({
          id: e.id,
          type: e.type,
          level: e.level,
          position: e.position
        })));
      }
      
      return newState;
    });
  },
  
  updateEnemies: (delta: number) => {
    // TODO: Update enemy behavior, movement, etc.
  },
  
  damageEnemy: (enemyId: string, damage: number) => {
    const state = get();
    const updatedEnemies = state.enemies.map(enemy => {
      if (enemy.id !== enemyId) return enemy;
      
      const newHealth = Math.max(0, enemy.health - damage);
      const isAlive = newHealth > 0;
      
      // If enemy died and was previously alive
      if (!isAlive && enemy.isAlive) {
        // Recalculate experience value with current boosts when enemy is defeated
        const recalculatedXP = calculateExperienceValue(enemy.baseExperienceValue, enemy.level);
        
        // Calculate new experience total
        const currentExp = state.experience + recalculatedXP;
        
        // Log XP gain with multiplier information
        const xpInfo = get().getXpMultiplierInfo();
        console.log(
          `Gained ${recalculatedXP} XP from ${enemy.name} ` +
          `(Base: ${enemy.baseExperienceValue}, ` +
          `Multipliers: Base ${xpInfo.base}x, ` +
          `${xpInfo.donation > 0 ? `Donation ${xpInfo.donation}x, ` : ''}` +
          `${xpInfo.event > 1 ? `Event ${xpInfo.event}x` : ''})`
        );
        
        // Check for level up and update state accordingly
        if (currentExp >= state.experienceToNextLevel) {
          console.log(`Level up triggered! Current XP: ${currentExp}, needed: ${state.experienceToNextLevel}`);
          // First update experience, then call levelUp - this ensures the XP is not lost
          set({ experience: currentExp });
          // Call levelUp which will reset experience to 0 and handle all level-up logic
          // TODO: part of exp should be kept for next level
          setTimeout(() => get().levelUp(), 0);
        } else {
          // Just update experience if no level up
          set({ experience: currentExp });
        }
      }
      
      return {
        ...enemy,
        health: newHealth,
        isAlive
      };
    });

    set({ enemies: updatedEnemies });
  },
  
  respawnDeadEnemies: (delta: number) => {
    set(state => {
      // Quick check - if no dead enemies, return state without changes
      if (!state.enemies.some(enemy => !enemy.isAlive)) {
        return state;
      }

      // Group dead enemies strictly by their original zones
      const deadEnemiesByZone = new Map<string, typeof state.enemies>();
      state.enemies.filter(e => !e.isAlive).forEach(enemy => {
        const zone = zoneManager.getZoneAtPosition(enemy.spawnPosition || enemy.position);
        if (zone) {
          const zoneEnemies = deadEnemiesByZone.get(zone.id) || [];
          deadEnemiesByZone.set(zone.id, [...zoneEnemies, enemy]);
        }
      });

      // Process respawns by zone
      const respawnChance = delta * 0.5;
      let hasRespawned = false;
      const updatedEnemies = [...state.enemies];

      deadEnemiesByZone.forEach((deadEnemies, zoneId) => {
        // Get the zone configuration
        const zoneConfig = GAME_ZONES.find(z => z.id === zoneId);
        if (!zoneConfig) return;

        // For each mob type in the zone config
        zoneConfig.mobs.forEach(mobConfig => {
          // Count current alive mobs of this type in the zone
          const aliveMobsCount = updatedEnemies.filter(e => 
            e.isAlive && 
            e.type === mobConfig.type &&
            zoneManager.getZoneAtPosition(e.position)?.id === zoneId
          ).length;

          // Calculate how many we need to spawn to reach minimum
          const neededSpawns = Math.max(0, mobConfig.minCount - aliveMobsCount);

          // Try to respawn needed mobs
          for (let i = 0; i < neededSpawns; i++) {
            if (Math.random() < respawnChance) {
              // Find a dead enemy of the same type in this zone to replace
              const deadEnemyIndex = updatedEnemies.findIndex(e => 
                !e.isAlive && 
                zoneManager.getZoneAtPosition(e.spawnPosition || e.position)?.id === zoneId &&
                (!mobConfig.type || e.type === mobConfig.type)
              );

              if (deadEnemyIndex >= 0) {
                // Get random position within zone
                const newPos = zoneManager.getRandomPositionInZone(zoneId);
                if (newPos) {
                  // Get appropriate level for this zone
                  const level = Math.floor(
                    zoneConfig.minLevel + 
                    Math.random() * (zoneConfig.maxLevel - zoneConfig.minLevel + 1)
                  );

                  // Create new enemy with correct type and level
                  const newEnemy = createEnemy(mobConfig.type, level, newPos);
                  // Store original spawn position for zone tracking
                  newEnemy.spawnPosition = { ...newPos };
                  
                  updatedEnemies[deadEnemyIndex] = newEnemy;
                  hasRespawned = true;
                }
              }
            }
          }
        });
      });

      // Only update state if at least one enemy was respawned
      if (hasRespawned) {
        // Update zone mob counts
        zoneManager.getAllZones().forEach(zone => {
          const zoneEnemies = updatedEnemies.filter(e => {
            const enemyZone = zoneManager.getZoneAtPosition(e.position);
            return enemyZone?.id === zone.id;
          });
          zoneManager.updateZoneMobs(zone.id, zoneEnemies.map(e => ({
            id: e.id,
            type: e.type,
            level: e.level,
            position: e.position
          })));
        });

        return { enemies: updatedEnemies };
      }

      return state;
    });
  },

  // New actions for XP boost management
  applyDonationBoost: (boostAmount: number, durationInMinutes = 60) => {
    // Apply the boost multiplier to the game configuration
    setDonationBoost(boostAmount);
    
    // Update the store state
    set({ donationXpBoost: boostAmount });
    
    // Optional: Set a timer to clear the boost after the specified duration
    if (durationInMinutes > 0) {
      setTimeout(() => {
        get().clearDonationBoost();
      }, durationInMinutes * 60 * 1000);
    }
    
    console.log(`XP boost of ${boostAmount * 100}% applied for ${durationInMinutes} minutes`);
  },
  
  clearDonationBoost: () => {
    // Reset the donation boost in the game configuration
    setDonationBoost(0);
    
    // Reset the store state
    set({ donationXpBoost: 0 });
    
    console.log('XP boost has been cleared');
  },
  
  toggleXpEvent: (active: boolean, multiplier = 1.5) => {
    // Toggle the XP event in the game configuration
    toggleBonusEvent(active, multiplier);
    
    // Update the store state
    set({ 
      bonusXpEventActive: active,
      bonusXpMultiplier: active ? multiplier : 1.0
    });
    
    console.log(`XP event ${active ? 'activated' : 'deactivated'}${active ? ` with ${multiplier}x multiplier` : ''}`);
  },
  
  getXpMultiplierInfo: () => {
    const config = GameConfig.experience;
    return {
      base: config.baseMultiplier,
      donation: config.donationBoost,
      event: config.bonusEvents.active ? config.bonusEvents.multiplier : 1,
      total: config.baseMultiplier * (1 + config.donationBoost) * (config.bonusEvents.active ? config.bonusEvents.multiplier : 1)
    };
  },

  // Status effect actions
  applyStatusEffect: (targetId: string | 'player', effect: StatusEffect) => {
    set(state => {
      if (targetId === 'player') {
        return {
          playerStatusEffects: [...state.playerStatusEffects, effect]
        };
      } else {
        const targetEffects = state.enemyStatusEffects[targetId] || [];
        return {
          enemyStatusEffects: {
            ...state.enemyStatusEffects,
            [targetId]: [...targetEffects, effect]
          }
        };
      }
    });
  },
  
  removeStatusEffect: (targetId: string | 'player', effectId: string) => {
    set(state => {
      if (targetId === 'player') {
        return {
          playerStatusEffects: state.playerStatusEffects.filter(effect => effect.id !== effectId)
        };
      } else {
        const targetEffects = state.enemyStatusEffects[targetId] || [];
        return {
          enemyStatusEffects: {
            ...state.enemyStatusEffects,
            [targetId]: targetEffects.filter(effect => effect.id !== effectId)
          }
        };
      }
    });
  },
  
  updateStatusEffects: (delta: number) => {
    const state = get();
    const currentTime = Date.now();
    
    // TODO: each npc/player should have its own life, where all updates are applied
    // Process enemy status effects
    Object.entries(state.enemyStatusEffects).forEach(([enemyId, effects]) => {
      // Only process effects for enemies that exist and are alive
      const enemy = state.enemies.find(e => e.id === enemyId && e.isAlive);
      if (!enemy) return;
      
      effects.forEach(effect => {
        const elapsedTime = (currentTime - effect.startTime) / 1000;
        const remainingTime = effect.duration - elapsedTime;
        
        if (remainingTime <= 0) {
          // Effect expired, remove it
          get().removeStatusEffect(enemyId, effect.id);
          return;
        }
        
        // Process damage over time effects every second
        if ((effect.type === 'burn' || effect.type === 'poison') && 
            Math.floor(elapsedTime) > Math.floor(elapsedTime - delta)) {
          // Calculate damage as a percentage of max health
          const dotDamage = Math.floor(enemy.maxHealth * (effect.value / 100));
          console.log(`${effect.type} tick: ${dotDamage} damage to ${enemy.name}`);
          get().damageEnemy(enemyId, dotDamage);
        }
      });
    });
    
    // TODO: player should be a part of Actors, with just id == player id, all lifecycle should be identincal
    // Process player status effects
    state.playerStatusEffects.forEach(effect => {
      const elapsedTime = (currentTime - effect.startTime) / 1000;
      const remainingTime = effect.duration - elapsedTime;
      
      if (remainingTime <= 0) {
        // Effect expired, remove it
        get().removeStatusEffect('player', effect.id);
        return;
      }
      
      // Process effects on player (in a real game, would add logic for player debuffs)
    });
    
    // Clean up any expired effects
    set(state => {
      const updatedPlayerEffects = state.playerStatusEffects.filter(effect => {
        const elapsedTime = (currentTime - effect.startTime) / 1000;
        return elapsedTime < effect.duration;
      });
      
      const updatedEnemyEffects: Record<string, StatusEffect[]> = {};
      // Only keep entries for enemies that still have effects
      Object.entries(state.enemyStatusEffects).forEach(([enemyId, effects]) => {
        const updatedEffects = effects.filter(effect => {
          const elapsedTime = (currentTime - effect.startTime) / 1000;
          return elapsedTime < effect.duration;
        });
        
        if (updatedEffects.length > 0) {
          updatedEnemyEffects[enemyId] = updatedEffects;
        }
      });
      
      return {
        playerStatusEffects: updatedPlayerEffects,
        enemyStatusEffects: updatedEnemyEffects
      };
    });
  },
  
  getStatusEffects: (targetId: string | 'player') => {
    const state = get();
    if (targetId === 'player') {
      return state.playerStatusEffects;
    } else {
      return state.enemyStatusEffects[targetId] || [];
    }
  },

  // enemies within a radius
  getEntitiesWithinRadius: (position, radius) => {
    const state = get();
    const radiusSquared = radius * radius;

    // Filter enemies within the radius
    return state.enemies.filter(enemy => {
      const dx = enemy.position.x - position.x;
      const dz = enemy.position.z - position.z;
      return dx * dx + dz * dz <= radiusSquared;
    });
  },

  updatePlayerZone: () => {
    const state = get();
    const currentZone = zoneManager.getZoneAtPosition(state.player.position);
    if (currentZone?.id !== state.currentZoneId) {
      set({ currentZoneId: currentZone?.id || null });
      console.log(`Player entered zone: ${currentZone?.name || 'wilderness'}`);
    }
  },

  // Skill management
  handleSkillCast: (skillId: string) => {
    const state = get();
    if (state.playerSkills.includes(skillId)) {
      get().castSkill(skillId);
    }
  },
  
  setSelectedSkill: (skillId: string | null) => {
    set({ selectedSkill: skillId });
  },
}));

// random enemy type appropriate for level
function getRandomEnemyType(level: number): string {
  // Pool of enemy types with their minimum levels
  const enemyTypes: {[key: string]: number} = {
    'goblin': 1,
    'wolf': 1,
    'skeleton': 2,
    'orc': 3,
    'troll': 4
  };
  
  // Filter enemies that are appropriate for this level
  const availableEnemies = Object.entries(enemyTypes)
    .filter(([_, minLevel]) => minLevel <= level)
    .map(([type]) => type);
  
  // Return random enemy from available pool
  return availableEnemies[Math.floor(Math.random() * availableEnemies.length)];
}
