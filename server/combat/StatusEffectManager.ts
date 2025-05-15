import { Server } from 'socket.io';
import { PlayerState, Enemy, StatusEffect as ActiveStatusEffectShared } from '../../shared/types';
import { EFFECTS, EffectDef, EffectTick, EffectId } from '../../shared/effectsDefinition';
import { applyEffectTick } from './effects/EffectApplicator';
import { log, LOG_CATEGORIES } from '../logger'; // Adjust path if logger is elsewhere

// Interface for the game world, to be passed to the manager
interface World {
    players: Record<string, PlayerState>;
    enemies: Record<string, Enemy>;
    // Potentially add methods like getEntityById(id: string): PlayerState | Enemy | null;
}

// Server-side representation of an active status effect instance on an entity.
// This extends the shared definition to include internal management properties.
interface ManagedStatusEffect extends ActiveStatusEffectShared {
    _tickTimerMs: number; // Internal: Time remaining until the next tick for this specific instance.
    _definition: EffectDef; // Internal: Cached definition for quick access.
}

export class StatusEffectManager {
    constructor() {
        log(LOG_CATEGORIES.SYSTEM, 'StatusEffectManager initialized.');
    }

    /**
     * Updates all active status effects on all entities in the game world.
     * This method is called on every game tick from the main worldLoop.
     *
     * @param deltaTimeMs - The time elapsed since the last game tick, in milliseconds.
     * @param world - A reference to the current game world state.
     * @param io - The Socket.IO server instance for broadcasting updates to clients.
     */
    public update(deltaTimeMs: number, world: World, io: Server): void {
        // Combine players and enemies into a single list for easier iteration
        const allEntities: (PlayerState | Enemy)[] = [...Object.values(world.players), ...Object.values(world.enemies)];

        for (const entity of allEntities) {
            // Skip entities that are not alive or have no status effects
            if (!entity.isAlive || !entity.statusEffects || entity.statusEffects.length === 0) {
                continue;
            }

            let entityEffectsChanged = false; // Flag to indicate if any effect on this entity was processed or removed
            const effectsToRemoveById: string[] = []; // Store IDs of effects to be removed

            // Iterate backwards to allow safe removal of effects during the loop
            for (let i = entity.statusEffects.length - 1; i >= 0; i--) {
                const activeEffect = entity.statusEffects[i] as ManagedStatusEffect;

                // Cache the effect definition if not already done (e.g., when an effect is first added)
                if (!activeEffect._definition) {
                    const effectDef = EFFECTS[activeEffect.type as EffectId];
                    if (!effectDef) {
                        log(LOG_CATEGORIES.SYSTEM, `Warning: Unknown effect type "${activeEffect.type}" on entity ${entity.id}. Scheduling for removal.`);
                        effectsToRemoveById.push(activeEffect.id);
                        entityEffectsChanged = true;
                        continue;
                    }
                    activeEffect._definition = effectDef;
                }
                
                // Initialize _tickTimerMs if it's not set (for newly added effects or first processing pass)
                if (activeEffect._tickTimerMs === undefined) {
                    activeEffect._tickTimerMs = activeEffect._definition.tickMs; // Start timer for the first tick
                }

                // 1. Decrement total duration of the effect
                activeEffect.durationMs -= deltaTimeMs;

                // Check if the effect has expired
                if (activeEffect.durationMs <= 0) {
                    effectsToRemoveById.push(activeEffect.id);
                    entityEffectsChanged = true;
                    log(LOG_CATEGORIES.SYSTEM, `Effect ${activeEffect.type} (ID: ${activeEffect.id}) expired for entity ${entity.id}`);
                    continue; // Move to the next effect for this entity
                }

                // 2. Decrement the timer for the next tick
                activeEffect._tickTimerMs -= deltaTimeMs;

                // Check if it's time to apply this effect's tick
                if (activeEffect._tickTimerMs <= 0) {
                    const effectDef = activeEffect._definition;
                    
                    // Generate a seed for deterministic RNG if the effect uses it
                    // Using entityId, effectId, and current time for a reasonably unique seed
                    const tickSeed = Date.now() + (entity.id.charCodeAt(0) || 0) + (activeEffect.id.charCodeAt(0) || 0);
                    
                    // Call the effect's apply function to get the EffectTick data
                    const effectTickResult: EffectTick = effectDef.apply({
                        level: entity.level || 1, // Default to level 1 if not present
                        // TODO: Define how 'int' (or other scaling stats) are sourced.
                        // For now, using a placeholder or a common stat like player's mana.
                        int: (entity as PlayerState).mana || (entity as PlayerState).maxMana || 10, // Placeholder for scaling stat
                        seed: tickSeed,
                    });

                    log(LOG_CATEGORIES.SYSTEM, `Applying tick for effect ${activeEffect.type} (ID: ${activeEffect.id}) on entity ${entity.id}. Value: ${effectTickResult.value}, Type: ${effectTickResult.type}`);

                    // Apply the tick to the entity using EffectApplicator
                    const entityDiedAsResult = applyEffectTick(effectTickResult, entity);
                    entityEffectsChanged = true; // Mark that entity state has changed

                    // Reset the tick timer for the next occurrence of this effect's tick
                    // Add remaining time from current tick to prevent drift (e.g., if deltaTimeMs was large)
                    activeEffect._tickTimerMs += effectDef.tickMs; 

                    if (entityDiedAsResult) {
                        log(LOG_CATEGORIES.DAMAGE, `Entity ${entity.id} died as a result of status effect ${activeEffect.type} (ID: ${activeEffect.id}).`);
                        // Entity death is handled by applyEffectTick (sets isAlive=false).
                        // The main game loop or other systems will handle XP, loot, and removal of the dead entity.
                        // We should mark this effect and potentially all others on this entity for removal.
                        effectsToRemoveById.push(activeEffect.id);
                        // Optionally, mark all effects for removal if entity died:
                        // entity.statusEffects.forEach(ef => effectsToRemoveById.push(ef.id));
                        // break; // Stop processing more effects for this dead entity in this tick
                    }
                }
            }

            // Remove expired or processed effects from the entity
            if (effectsToRemoveById.length > 0) {
                entity.statusEffects = entity.statusEffects.filter(ef => !effectsToRemoveById.includes(ef.id));
            }

            // If any effects were processed or removed, broadcast the entity's updated state
            if (entityEffectsChanged) {
                const updatePayload = {
                    id: entity.id,
                    health: entity.health,
                    mana: (entity as PlayerState).mana, // Only players have mana typically
                    statusEffects: entity.statusEffects.map(ef => ({ // Send clean objects without internal fields
                        id: ef.id,
                        type: ef.type,
                        value: ef.value,
                        durationMs: ef.durationMs,
                        startTimeTs: ef.startTimeTs,
                        sourceSkill: ef.sourceSkill
                    })),
                    isAlive: entity.isAlive,
                };

                if ((entity as PlayerState).socketId) { // Check if it's a player
                    io.emit('playerUpdated', updatePayload);
                } else { // It's an enemy
                    io.emit('enemyUpdated', updatePayload);
                }

                // Also send a specific EffectSnapshot message for clients that might need more detailed/immediate effect updates
                // This can be useful for UIs that show detailed timers or effect values.
                io.emit('msg', {
                    type: 'EffectSnapshot',
                    targetId: entity.id,
                    effects: updatePayload.statusEffects, // Send the cleaned effects
                });
            }
        }
    }
}
