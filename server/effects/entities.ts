import { SkillDef } from '../../shared/skills';
import { VecXZ, ProjHit, ProjEnd, InstantHit } from '../../shared/messages';
import { GameState } from '../world';
import { v4 as uuid } from 'uuid';

export interface EffectEntity {
  id: string;
  skill: SkillDef;
  done: boolean;
  update(dt: number, state: GameState): (ProjHit | ProjEnd | InstantHit)[];
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
  update(dt: number, state: GameState): (ProjHit | ProjEnd)[]{
     if(this.done) return [];
     
     this.pos.x += this.dir.x * this.skill.speed! * dt;
     this.pos.y += this.dir.y * this.skill.speed! * dt;
     this.pos.z += this.dir.z * this.skill.speed! * dt;
     
     /* hit check vs targetId (later broaden) */
     const hitMsgs: ProjHit[] = [];
     if(this.targetId) {
        const t = state.enemies[this.targetId] || state.players[this.targetId];
        if(t && distanceXZ(this.pos, t.position) <= 0.5) {
            this.done = true;
            
            // Add casterId to skill for XP calculation
            const skillWithCaster = {...this.skill, casterId: this.casterId};
            
            applySkillDamage(skillWithCaster, t, state);
            hitMsgs.push({type: 'ProjHit', id: this.id, pos: this.pos, hitIds: [t.id]});
        }
     }
     return hitMsgs;
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
     
     /* immediately apply damage to targets */
     for (const targetId of this.targetIds) {
       const target = state.enemies[targetId] || state.players[targetId];
       if (target) {
         // Add casterId to skill for XP calculation
         const skillWithCaster = {...this.skill, casterId: this.casterId};
         
         applySkillDamage(skillWithCaster, target, state);
       }
     }
     
     return [{
       type: 'InstantHit',
       skillId: this.skill.id,
       origin: this.origin,
       targetPos: this.origin,
       hitIds: this.targetIds
     }];
  }
}

/* distanceXZ, applySkillDamage omitted for brevity */
export function distanceXZ(a: VecXZ, b: VecXZ): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function applySkillDamage(skill: SkillDef, target: any, state: GameState) {
  // Apply damage from skill to target
  if (skill.dmg) {
    target.health -= skill.dmg;
    if (target.health <= 0) {
      target.health = 0;
      target.isAlive = false;
      target.deathTimeTs = Date.now();
      
      // Clear target if this is an enemy
      if (target.targetId !== undefined) {
        target.targetId = null;
        
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
          }
        }
      }
    }
  }
}
