import { nanoid } from 'nanoid';
import { EffectDef, EffectId, EFFECTS } from '../../../shared/effectsDefinition.js';
import { EffectSnapshotMsg } from '../../../shared/messages.js';
import { effectRng } from '../../../shared/combatMath.js';
import { applyEffectTick } from './EffectApplicator.js';

type EntityId = string;

interface Entity {
  id: string;
  level?: number;
  int?: number;  // Intelligence stat for effect damage/healing calculations
}

interface Active {
  id: string;        // Unique identifier for this effect instance
  srcId: EntityId;   // Source of the effect
  effectId: EffectId; // Type of effect
  def: EffectDef;    // Effect definition
  remaining: number; // Remaining duration in ms
  lastTick: number;  // When this effect last ticked
  stacks: number;    // Current stack count
  seed: number;      // RNG seed for deterministic calculations
  level: number;     // Level of the effect (from source entity)
  int: number;       // Int stat (from source entity)
}

class EffectRunner {
  private active = new Map<EntityId, Active[]>();

  /**
   * Add a new effect to an entity or refresh an existing one
   */
  add(target: Entity, src: Entity, effectId: EffectId, seed: number) {
    if (!EFFECTS[effectId]) {
      console.error(`Unknown effect type: ${effectId}`);
      return;
    }

    const targetId = target.id;
    const def = EFFECTS[effectId];
    const now = Date.now();
    
    // Get or create effects array for this target
    if (!this.active.has(targetId)) {
      this.active.set(targetId, []);
    }
    
    const effects = this.active.get(targetId)!;
    
    // Check if this effect type already exists on target
    const existingIdx = effects.findIndex(e => e.effectId === effectId && e.srcId === src.id);
    
    if (existingIdx >= 0) {
      // Update existing effect
      const existing = effects[existingIdx];
      existing.remaining = Math.max(existing.remaining, def.durationMs); // Reset duration
      existing.stacks = Math.min(existing.stacks + 1, def.maxStacks);    // Increment stacks
      existing.seed = seed; // Update seed for deterministic calculations
      return existing;
    } else {
      // Add new effect
      const newEffect: Active = {
        id: nanoid(),
        srcId: src.id,
        effectId,
        def,
        remaining: def.durationMs,
        lastTick: now,
        stacks: 1,
        seed,
        level: src.level || 1,
        int: src.int || 0
      };
      effects.push(newEffect);
      return newEffect;
    }
  }

  private gameState: any = {};
  
  /**
   * Set the game state reference for effect application
   */
  setGameState(state: any) {
    this.gameState = state;
  }

  /**
   * Process all active effects, trigger ticks, and return effect messages
   */
  tick(dt: number, emit: (m: EffectSnapshotMsg) => void) {
    const now = Date.now();
    const expiredEntities: EntityId[] = [];
    
    // Iterate through all targets and their effects
    for (const [targetId, effects] of this.active.entries()) {
      const expiredEffects: number[] = [];
      
      // Find the actual target entity
      const targetEntity = 
        (this.gameState.players && this.gameState.players[targetId]) || 
        (this.gameState.enemies && this.gameState.enemies[targetId]);
      
      if (!targetEntity) {
        // If target no longer exists, remove all effects
        expiredEntities.push(targetId);
        continue;
      }
      
      // Update each effect
      for (let i = 0; i < effects.length; i++) {
        const effect = effects[i];
        
        // Decrease remaining time
        effect.remaining -= dt;
        
        // Check if effect should be removed
        if (effect.remaining <= 0) {
          expiredEffects.push(i);
          continue;
        }
        
        // Check if the target is still alive before applying effects
        if (!targetEntity.isAlive) {
          console.log(`[EffectRunner] Target ${targetId} is dead, skipping effect ${effect.effectId}`);
          expiredEffects.push(i);
          continue; // Skip to the next effect for this target
        }
        
        // Check if effect should tick
        const timeSinceLastTick = now - effect.lastTick;
        if (timeSinceLastTick >= effect.def.tickMs) {
          // Apply effect tick
          const tickCount = Math.floor(timeSinceLastTick / effect.def.tickMs);
          effect.lastTick = now - (timeSinceLastTick % effect.def.tickMs);
          
          // For each missed tick, apply the effect
          for (let tick = 0; tick < tickCount; tick++) {
            // Check again if the target is alive before each tick application
            if (!targetEntity.isAlive) {
              console.log(`[EffectRunner] Target ${targetId} died during effect processing, stopping ticks`);
              break; // Stop processing ticks for this effect
            }
            
            const tickSeed = effect.seed + tick;
            const result = effect.def.apply({
              level: effect.level,
              int: effect.int,
              seed: tickSeed
            });
            
            // Apply effect result value to target entity
            if (targetEntity) {
              const didKill = applyEffectTick(result, targetEntity);
              
              // If the target died, stop processing ticks for this entity
              if (didKill) {
                break;
              }
            }
          }
          
          // Send effect snapshot after each tick
          emit({
            type: 'EffectSnapshot',
            id: targetId,
            src: effect.srcId,
            effectId: effect.effectId,
            stacks: effect.stacks,
            remainingMs: effect.remaining,
            seed: effect.seed
          });
        }
      }
      
      // Remove expired effects in reverse order
      for (let i = expiredEffects.length - 1; i >= 0; i--) {
        const expiredIdx = expiredEffects[i];
        effects.splice(expiredIdx, 1);
      }
      
      // If no effects remain for this entity, mark for cleanup
      if (effects.length === 0) {
        expiredEntities.push(targetId);
      }
    }
    
    // Remove expired entities
    for (const entityId of expiredEntities) {
      this.active.delete(entityId);
    }
  }
  
  /**
   * Get all active effects for a specific entity
   */
  getEffectsForEntity(entityId: EntityId): Active[] {
    return this.active.get(entityId) || [];
  }
  
  /**
   * Remove all effects from a specific entity
   */
  clearEffects(entityId: EntityId) {
    this.active.delete(entityId);
  }
}

export const effectRunner = new EffectRunner();
