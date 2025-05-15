import { SkillDef } from '../../shared/skillsDefinition';
import { VecXZ, InstantHit } from '../../shared/messages';
import { getDamage, hash } from '../../shared/combatMath';
import { v4 as uuid } from 'uuid';
import { handleEnemyLoot } from '../lootHandler';

// Define a simplified GameState interface for use in this file
interface GameState {
  enemies: Record<string, any>;
  players: Record<string, any>;
  sockets?: Record<string, any>; // Socket instances mapped by socket ID
}

// Represents hit data without using ProjHit2
export interface HitResult {
  targetId: string;
  damage: number;
  impactPos: VecXZ;
}

export interface EffectEntity {
  id: string;
  skill: SkillDef;
  done: boolean;
  update(dt: number, state: GameState): HitResult[] | InstantHit[];
}

/* ---- Projectile ---------- */
export class Projectile implements EffectEntity {
  id = uuid();
  done = false;
  constructor(
     public skill: SkillDef,
     public pos: VecXZ & {y:number},
     public dir: VecXZ & {y:number},
     public casterId: string,
     public targetId?: string)
  {}
  update(dt: number, state: GameState): HitResult[]{
     if(this.done) return [];
     
     // Use the standardized projectile speed from the skill definition
     const speed = this.skill.projectile?.speed || this.skill.speed || 0;
     this.pos.x += this.dir.x * speed * dt;
     this.pos.y += this.dir.y * speed * dt;
     this.pos.z += this.dir.z * speed * dt;
     
     /* hit check vs targetId (later broaden) */
     const hitResults: HitResult[] = [];
     if(this.targetId) {
        const t = state.enemies[this.targetId] || state.players[this.targetId];
        // Use the hitRadius from the projectile definition if available
        const hitRadius = this.skill.projectile?.hitRadius || 0.5;
        if(t && distanceXZ(this.pos, t.position) <= hitRadius) {
            this.done = true;
            
            // Add casterId to skill for XP calculation
            const skillWithCaster = {...this.skill, casterId: this.casterId};
            
            // Calculate damage using the shared function
            const { dmg } = getDamage({
              caster: state.players[this.casterId]?.stats || { dmgMult: 1 },
              skill: { base: this.skill.dmg || 10, variance: 0.1 },
              seed: `${this.id}:${t.id}`
            });
            
            // Apply the damage using our pre-calculated value
            applySkillDamage(skillWithCaster, t, state, dmg);
            
            hitResults.push({
              targetId: t.id,
              damage: dmg,
              impactPos: { x: this.pos.x, z: this.pos.z }
            });
        }
     }
     return hitResults;
  }
}

/* ---- Instant ---------- */
export class Instant implements EffectEntity {
  id = uuid();
  done = false;
  constructor(public skill: SkillDef,
              public casterId: string,
              public targetIds: string[],
              public origin: {x: number; y: number; z: number}) {}
  
  update(dt: number, state: GameState): InstantHit[] {
     if(this.done) return [];
     this.done = true;
     
     /* immediately apply damage and effects to targets */
     const damageResults: number[] = [];
     
     for (const targetId of this.targetIds) {
       const target = state.enemies[targetId] || state.players[targetId];
       if (target) {
         // Add casterId to skill for XP calculation
         const skillWithCaster = {...this.skill, casterId: this.casterId};
         
         // Calculate damage using the shared function
         const { dmg } = getDamage({
           caster: state.players[this.casterId]?.stats || { dmgMult: 1 },
           skill: { base: this.skill.dmg || 10, variance: 0.1 },
           seed: `${this.id}:${targetId}`
         });
         
         damageResults.push(dmg);
         
         // Pass the pre-calculated damage to applySkillDamage
         applySkillDamage(skillWithCaster, target, state, dmg);
       } else {
         damageResults.push(0); // No damage for non-existent targets
       }
     }
     
     return [{
       type: 'InstantHit',
       skillId: this.skill.id,
       origin: this.origin,
       targetPos: this.origin,
       hitIds: this.targetIds,
       dmg: damageResults
     }];
  }
}

/* Helper functions */
export function distanceXZ(a: VecXZ, b: VecXZ): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function applySkillDamage(skill: any, target: any, state: GameState, precalculatedDmg?: number) {
  // Apply all effects from the skill
  const now = Date.now();
  
  // Use precalculated damage if provided, otherwise calculate it
  let dmgToApply: number;
  if (precalculatedDmg !== undefined) {
    dmgToApply = precalculatedDmg;
  } else {
    // Get damage using the shared damage calculation
    const { dmg } = getDamage({
      caster: state.players[skill.casterId]?.stats || { dmgMult: 1 },
      skill: { base: skill.effects?.find(e => e.type === 'damage')?.value || skill.dmg || 10, variance: 0.1 },
      seed: `${skill.id || ''}:${target.id || ''}`
    });
    dmgToApply = dmg;
  }
  
  // Process all skill effects
  for (const effect of skill.effects) {
    if (effect.type === 'damage') {
      // Apply damage from our calculation instead of the literal value
      target.health -= dmgToApply;
      if (target.health <= 0) {
        target.health = 0;
        target.isAlive = false;
        target.deathTimeTs = now;
        
        // Clear target if this is an enemy
        if (target.targetId !== undefined) {
          target.targetId = null;
        }
        
        // If this is an enemy, grant XP to the player who killed it
        if (state.players && skill.casterId) {
          const killer = state.players[skill.casterId];
          if (killer && target.experienceValue) {
            killer.experience += target.experienceValue;
            
            // Check for level up
            while (killer.experience >= killer.experienceToNextLevel) {
              killer.level++;
              killer.experience -= killer.experienceToNextLevel;
              killer.experienceToNextLevel = Math.floor(killer.experienceToNextLevel * 1.5);
              killer.maxHealth += 20;
              killer.health = killer.maxHealth;
              killer.maxMana += 10;
              killer.mana = killer.maxMana;
            }
            
            // Handle loot drops if this is an enemy with a loot table
            if (target.type && target.lootTableId) {
              // Store the loot result in target metadata to be processed by the world system
              // This avoids needing direct access to sockets from here
              target.lootResult = handleEnemyLoot(target, skill.casterId, state);
            }
          }
        }
      }
    } else {
      // Apply status effect
      const effectId = `effect-${hash(`${effect.type}-${now}`)}`;
      const statusEffect = {
        id: effectId,
        type: effect.type,
        value: effect.value,
        durationMs: effect.durationMs || 0,
        startTimeTs: now,
        sourceSkill: skill.id
      };
      
      const existingEffectIndex = target.statusEffects.findIndex((e: any) => e.type === effect.type);
      if (existingEffectIndex >= 0) {
        target.statusEffects[existingEffectIndex] = statusEffect;
      } else {
        target.statusEffects.push(statusEffect);
      }
    }
  }
}
