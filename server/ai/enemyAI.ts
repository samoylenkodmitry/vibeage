// server/ai/enemyAI.ts
import { Server } from 'socket.io';
import { Enemy, PlayerState } from '../../shared/types.js';
import { VecXZ } from '../../shared/messages.js';
import { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';

// Minimal GameState interface for this module
interface GameState {
    players: Record<string, PlayerState>;
    enemies: Record<string, Enemy>;
}

// Helper: Calculate distance
function localDistance(a: VecXZ, b: VecXZ): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
}

// Helper: Calculate direction
function localCalculateDir(from: VecXZ, to: VecXZ): VecXZ {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist === 0) return { x: 0, z: 0 };
    return { x: dx / dist, z: dz / dist };
}

// Check if entity moved to a different grid cell
export function gridCellChanged(oldPos: VecXZ, newPos: VecXZ, cellSize: number = 10): boolean {
    const oldCellX = Math.floor(oldPos.x / cellSize);
    const oldCellZ = Math.floor(oldPos.z / cellSize);
    const newCellX = Math.floor(newPos.x / cellSize);
    const newCellZ = Math.floor(newPos.z / cellSize);
    
    return oldCellX !== newCellX || oldCellZ !== newCellZ;
}

export function updateEnemyAI(
    enemy: Enemy,
    gameState: GameState,
    io: Server,
    spatialGrid: SpatialHashGrid,
    deltaTime: number // in seconds
) {
    if (!enemy.isAlive) {
        return;
    }

    const now = Date.now();
    let broadcastEnemyUpdate = false;

    // State: Idle
    if (enemy.aiState === 'idle') {
        // Scan for players in aggro radius
        const nearbyPlayerIds = spatialGrid.queryCircle({ x: enemy.position.x, z: enemy.position.z }, enemy.aggroRadius);
        for (const playerId of nearbyPlayerIds) {
            const player = gameState.players[playerId];
            if (player && player.isAlive) {
                const distToPlayer = localDistance(enemy.position, player.position);
                if (distToPlayer <= enemy.aggroRadius) {
                    enemy.targetId = playerId;
                    enemy.aiState = 'chasing';
                    console.log(`[AI] Enemy ${enemy.id} aggroed player ${playerId}`);
                    broadcastEnemyUpdate = true;
                    break;
                }
            }
        }
        // If idle and not at spawn point, try to return
        if (enemy.aiState === 'idle' && localDistance(enemy.position, enemy.spawnPosition) > 1) {
             enemy.aiState = 'returning';
             broadcastEnemyUpdate = true;
        }
    }

    // State: Chasing
    if (enemy.aiState === 'chasing') {
        const targetPlayer = enemy.targetId ? gameState.players[enemy.targetId] : null;
        if (!targetPlayer || !targetPlayer.isAlive) {
            enemy.targetId = null;
            enemy.aiState = 'returning'; // Or 'idle' if already at spawn
            console.log(`[AI] Enemy ${enemy.id} lost target or target died, returning.`);
            broadcastEnemyUpdate = true;
        } else {
            const distToTarget = localDistance(enemy.position, targetPlayer.position);
            if (distToTarget <= enemy.attackRange) {
                enemy.aiState = 'attacking';
                // Stop movement by clearing velocity
                enemy.velocity = { x: 0, z: 0 };
                broadcastEnemyUpdate = true;
            } else {
                // Move towards target
                const dirToTarget = localCalculateDir(enemy.position, targetPlayer.position);
                const oldPos = { x: enemy.position.x, z: enemy.position.z };

                // Update enemy velocity
                enemy.velocity = { 
                    x: dirToTarget.x * enemy.movementSpeed,
                    z: dirToTarget.z * enemy.movementSpeed
                };
                
                // Update position based on velocity
                enemy.position.x += enemy.velocity.x * deltaTime;
                enemy.position.z += enemy.velocity.z * deltaTime;
                
                // Update rotation to face target
                enemy.rotation.y = Math.atan2(dirToTarget.x, dirToTarget.z);

                if (gridCellChanged(oldPos, enemy.position)) {
                    spatialGrid.move(enemy.id, oldPos, enemy.position);
                }
                // Position updates are sent via broadcastSnaps/collectDeltas
            }
        }
    }

    // State: Attacking
    if (enemy.aiState === 'attacking') {
        const targetPlayer = enemy.targetId ? gameState.players[enemy.targetId] : null;
        if (!targetPlayer || !targetPlayer.isAlive) {
            enemy.targetId = null;
            enemy.aiState = 'returning';
            console.log(`[AI] Enemy ${enemy.id} target died while attacking, returning.`);
            broadcastEnemyUpdate = true;
        } else {
            const distToTarget = localDistance(enemy.position, targetPlayer.position);
            if (distToTarget > enemy.attackRange) {
                enemy.aiState = 'chasing';
                broadcastEnemyUpdate = true;
            } else {
                // Face the target while attacking
                const dirToTarget = localCalculateDir(enemy.position, targetPlayer.position);
                enemy.rotation.y = Math.atan2(dirToTarget.x, dirToTarget.z);
                
                if (now - enemy.lastAttackTime >= enemy.attackCooldownMs) {
                    // Perform attack
                    const damageDealt = enemy.attackDamage; // Basic damage for now
                    targetPlayer.health -= damageDealt;
                    enemy.lastAttackTime = now;

                    console.log(`[AI] Enemy ${enemy.id} attacked player ${targetPlayer.id} for ${damageDealt} damage. Player HP: ${targetPlayer.health}`);

                    // Emit EnemyAttack message for client VFX
                    io.emit('msg', {
                        type: 'EnemyAttack',
                        enemyId: enemy.id,
                        targetId: targetPlayer.id,
                        damage: damageDealt
                    });

                    // Broadcast player health update
                    io.emit('playerUpdated', {
                        id: targetPlayer.id,
                        health: targetPlayer.health
                    });

                    if (targetPlayer.health <= 0) {
                        targetPlayer.health = 0;
                        targetPlayer.isAlive = false;
                        targetPlayer.deathTimeTs = now;
                        targetPlayer.targetId = null; // Player can't target when dead
                        targetPlayer.castingSkill = null; // Stop casting
                        targetPlayer.castingProgressMs = 0;

                        console.log(`[AI] Player ${targetPlayer.id} was killed by enemy ${enemy.id}`);
                        io.emit('playerUpdated', { // Full update for death state
                            id: targetPlayer.id,
                            health: targetPlayer.health,
                            isAlive: targetPlayer.isAlive,
                            deathTimeTs: targetPlayer.deathTimeTs,
                            targetId: targetPlayer.targetId,
                            castingSkill: targetPlayer.castingSkill,
                            castingProgressMs: targetPlayer.castingProgressMs
                        });

                        // Award XP to the enemy (if there's a function for that)
                        // This would be handled in the world.ts file when players kill enemies

                        // Enemy stops attacking and returns to idle/spawn
                        enemy.targetId = null;
                        enemy.aiState = 'returning';
                        broadcastEnemyUpdate = true;
                    }
                }
            }
        }
    }

    // State: Returning
    if (enemy.aiState === 'returning') {
        const distToSpawn = localDistance(enemy.position, enemy.spawnPosition);
        if (distToSpawn <= 1.0) { // Close enough to spawn point
            enemy.aiState = 'idle';
            enemy.position.x = enemy.spawnPosition.x; // Snap to spawn
            enemy.position.z = enemy.spawnPosition.z;
            enemy.velocity = { x: 0, z: 0 };
            broadcastEnemyUpdate = true;
        } else {
            // Move towards spawn point
            const dirToSpawn = localCalculateDir(enemy.position, enemy.spawnPosition);
            const oldPos = { x: enemy.position.x, z: enemy.position.z };

            // Update enemy velocity
            enemy.velocity = { 
                x: dirToSpawn.x * enemy.movementSpeed,
                z: dirToSpawn.z * enemy.movementSpeed
            };
            
            // Update position based on velocity
            enemy.position.x += enemy.velocity.x * deltaTime;
            enemy.position.z += enemy.velocity.z * deltaTime;
            
            // Update rotation to face spawn point
            enemy.rotation.y = Math.atan2(dirToSpawn.x, dirToSpawn.z);

            if (gridCellChanged(oldPos, enemy.position)) {
                spatialGrid.move(enemy.id, oldPos, enemy.position);
            }
        }
        
        // During returning, can still aggro if a player comes close
        const nearbyPlayerIds = spatialGrid.queryCircle({ x: enemy.position.x, z: enemy.position.z }, enemy.aggroRadius);
        for (const playerId of nearbyPlayerIds) {
            const player = gameState.players[playerId];
            if (player && player.isAlive) {
                enemy.targetId = playerId;
                enemy.aiState = 'chasing';
                broadcastEnemyUpdate = true;
                break;
            }
        }
    }

    if (broadcastEnemyUpdate) {
        io.emit('enemyUpdated', {
            id: enemy.id,
            targetId: enemy.targetId,
            aiState: enemy.aiState,
            // position and rotation are handled by general position broadcasts
        });
    }
    
    enemy.lastUpdateTime = now; // For enemy movement prediction if needed
}
