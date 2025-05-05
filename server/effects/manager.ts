import { EffectEntity, Projectile, Instant } from './entities';
import { SKILLS, SkillId } from '../../shared/skillsDefinition';
import { ProjSpawn2, ProjHit2, InstantHit } from '../../shared/messages';
import { getDamage } from '../../shared/combatMath';
import { Server } from 'socket.io';

// Define a simplified GameState interface to match our usage
interface GameState {
  enemies: Record<string, any>;
  players: Record<string, any>;
  [key: string]: any;
}

export class EffectManager {
  private effects: Record<string, EffectEntity> = {};
  
  constructor(
    private io: Server,
    private state: GameState
  ) {}
  
  spawnProjectile(skillId: SkillId, caster, dir, targetId?) {
      const skill = SKILLS[skillId];
      if (!skill) return null;
      
      const origin = {...caster.position, y: 1.5};
      const p = new Projectile(skill, origin, dir, caster.id, targetId);
      this.effects[p.id] = p;
      
      // Calculate travel time for the projectile if we have a target
      let travelMs;
      if (targetId) {
          const target = this.state.enemies[targetId] || this.state.players[targetId];
          if (target) {
              const dist = Math.sqrt(
                  Math.pow(target.position.x - origin.x, 2) +
                  Math.pow(target.position.z - origin.z, 2)
              );
              const speedMPS = skill.projectile?.speed || skill.speed || 0;
              const speedMPMS = speedMPS / 1000;
              travelMs = Math.ceil(dist / speedMPMS);
          }
      }
      
      // Emit enhanced projectile spawn event
      this.io.emit('msg', {
        type: 'ProjSpawn2',
        castId: p.id, 
        skillId: skillId, 
        origin: { x: origin.x, z: origin.z }, 
        dir: { x: dir.x, z: dir.z }, 
        speed: skill.projectile?.speed || skill.speed || 0, 
        launchTs: Date.now(),
        casterId: caster.id,
        hitRadius: skill.projectile?.hitRadius || 0.5,
        travelMs: travelMs
      } as ProjSpawn2);
      
      return p.id;
  }
  
  spawnInstant(skillId: SkillId, caster, targetIds) {
      const skill = SKILLS[skillId];
      if (!skill) return null;
      
      const inst = new Instant(skill, caster.id, targetIds, {...caster.position, y: 1.5});
      this.effects[inst.id] = inst;
      return inst.id;
  }
  
  updateAll(dt) {
      const updatedEnemies = new Set<string>();
      const updatedPlayers = new Set<string>();
      
      for(const id in this.effects) {
          const e = this.effects[id];
          const msgs = e.update(dt, this.state);
          
          // Collect IDs of targets that got hit
          msgs.forEach(m => {
              this.io.emit('msg', m);
              
              // Track which entities need updates
              if (m.type === 'ProjHit2' || m.type === 'InstantHit') {
                  (m.hitIds || []).forEach(hitId => {
                      if (this.state.enemies[hitId]) {
                          updatedEnemies.add(hitId);
                      } else if (this.state.players[hitId]) {
                          updatedPlayers.add(hitId);
                      }
                  });
              }
          });
          
          if(e.done) {
              delete this.effects[id];
              // No need to emit ProjEnd - the new protocol handles this through state transitions
          }
      }
      
      // Send updates for all affected entities
      updatedEnemies.forEach(enemyId => {
          this.io.emit('enemyUpdated', this.state.enemies[enemyId]);
      });
      
      updatedPlayers.forEach(playerId => {
          this.io.emit('playerUpdated', this.state.players[playerId]);
      });
  }
}
