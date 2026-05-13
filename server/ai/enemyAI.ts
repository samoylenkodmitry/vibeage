// server/ai/enemyAI.ts
import { Server } from 'socket.io';
import { Enemy } from '../../shared/types.js';
import { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import type { EntityState } from '../gameState.js';
import {
    applyEnemyAttack,
    distanceXZ,
    faceEnemyToward,
    findAggroTargetId,
    makeEnemyUpdate,
    moveEnemyToward,
    snapEnemyToSpawn,
    stopEnemy,
} from './enemyBehavior.js';

export function updateEnemyAI(
    enemy: Enemy,
    gameState: EntityState,
    io: Server,
    spatialGrid: SpatialHashGrid,
    deltaTime: number // in seconds
) {
    if (!enemy.isAlive) {
        return;
    }

    const now = Date.now();
    let broadcastEnemyUpdate = false;
    const previousVelocity = { ...enemy.velocity || { x: 0, z: 0 } };
    const previousState = enemy.aiState;

    // State: Idle
    if (enemy.aiState === 'idle') {
        // Scan for players in aggro radius
        const nearbyPlayerIds = spatialGrid.queryCircle({ x: enemy.position.x, z: enemy.position.z }, enemy.aggroRadius);
        const targetId = findAggroTargetId(enemy, gameState.players, nearbyPlayerIds);
        if (targetId) {
            enemy.targetId = targetId;
            enemy.aiState = 'chasing';
            console.log(`[AI] Enemy ${enemy.id} aggroed player ${targetId}`);
            broadcastEnemyUpdate = true;
        }
        // If idle and not at spawn point, try to return
        if (enemy.aiState === 'idle' && distanceXZ(enemy.position, enemy.spawnPosition) > 1) {
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
            const distToTarget = distanceXZ(enemy.position, targetPlayer.position);
            if (distToTarget <= enemy.attackRange) {
                enemy.aiState = 'attacking';
                // Stop movement by clearing velocity
                stopEnemy(enemy);
                broadcastEnemyUpdate = true;
            } else {
                // Move towards target
                moveEnemyToward(enemy, targetPlayer.position, spatialGrid, deltaTime);
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
            const distToTarget = distanceXZ(enemy.position, targetPlayer.position);
            if (distToTarget > enemy.attackRange) {
                enemy.aiState = 'chasing';
                broadcastEnemyUpdate = true;
            } else {
                // Face the target while attacking
                faceEnemyToward(enemy, targetPlayer.position);
                
                const attack = applyEnemyAttack(enemy, targetPlayer, now);
                if (attack) {
                    const damageDealt = attack.damage;

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

                    if (attack.killed) {
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
        const distToSpawn = distanceXZ(enemy.position, enemy.spawnPosition);
        if (distToSpawn <= 1.0) { // Close enough to spawn point
            enemy.aiState = 'idle';
            snapEnemyToSpawn(enemy, spatialGrid);
            broadcastEnemyUpdate = true;
        } else {
            // Move towards spawn point
            moveEnemyToward(enemy, enemy.spawnPosition, spatialGrid, deltaTime);
        }
        
        // During returning, can still aggro if a player comes close
        const nearbyPlayerIds = spatialGrid.queryCircle({ x: enemy.position.x, z: enemy.position.z }, enemy.aggroRadius);
        const targetId = findAggroTargetId(enemy, gameState.players, nearbyPlayerIds);
        if (targetId) {
            enemy.targetId = targetId;
            enemy.aiState = 'chasing';
            broadcastEnemyUpdate = true;
        }
    }

    if (broadcastEnemyUpdate) {
        io.emit('enemyUpdated', makeEnemyUpdate(enemy));
    }
    
    enemy.lastUpdateTime = now; // For enemy movement prediction if needed
    
    // Mark enemy as dirty for position snapshots if velocity or state changed
    const newVelocity = enemy.velocity || { x: 0, z: 0 };
    if (previousState !== enemy.aiState || 
        Math.abs(previousVelocity.x - newVelocity.x) > 0.01 || 
        Math.abs(previousVelocity.z - newVelocity.z) > 0.01) {
        // Velocity changed significantly or state changed, mark for forced position update
        (enemy as any).dirtySnap = true;
    }
}
