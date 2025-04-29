import { EffectEntity, Projectile, Instant } from './entities';
import { GameState } from '../world';
import { SKILLS, SkillId } from '../../shared/skillsDefinition';
import { ProjSpawn, ProjHit, ProjEnd, InstantHit } from '../../shared/messages';

export class EffectManager {
  private effects: Record<string, EffectEntity> = {};
  constructor(private io: import('socket.io').Server,
              private state: GameState) {}
  
  spawnProjectile(skillId: SkillId, caster, dir, targetId?) {
      const skill = SKILLS[skillId];
      const origin = {...caster.position, y: 1.5};
      const p = new Projectile(skill, origin, dir, caster.id, targetId);
      this.effects[p.id] = p;
      this.io.emit('msg', {
        type: 'ProjSpawn',
        id: p.id, 
        skillId: skillId, 
        origin, 
        dir, 
        speed: skill.speed, 
        launchTs: Date.now()
      });
      return p.id;
  }
  
  spawnInstant(skillId: SkillId, caster, targetIds) {
      const skill = SKILLS[skillId];
      const inst = new Instant(skill, caster.id, targetIds, {...caster.position, y: 1.5});
      this.effects[inst.id] = inst;
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
              if (m.type === 'ProjHit' || m.type === 'InstantHit') {
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
              if(e instanceof Projectile)
                  this.io.emit('msg', {type: 'ProjEnd', id: e.id, pos: e.pos});
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
