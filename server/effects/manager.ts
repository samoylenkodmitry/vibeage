import { EffectEntity, Projectile, Instant } from './entities';
import { SKILLS, SkillId } from '../../packages/content/skills.js';
import type { VecXZ } from '../../packages/protocol/messages.js';
import type { PlayerState } from '../../shared/types.js';
import type { GameState } from '../gameState.js';

import { Server } from 'socket.io';

type EffectDirection = VecXZ & { y: number };

export class EffectManager {
  private effects: Record<string, EffectEntity> = {};
  
  constructor(
    private io: Server,
    private state: GameState
  ) {}
  
  spawnProjectile(
    skillId: SkillId,
    caster: PlayerState,
    dir: EffectDirection,
    targetId?: string
  ) {
      const skill = SKILLS[skillId];
      if (!skill) return null;
      
      const origin = {...caster.position, y: 1.5};
      const p = new Projectile(skill, origin, dir, caster.id, targetId);
      this.effects[p.id] = p;
      
      return p.id;
  }
  
  spawnInstant(skillId: SkillId, caster: PlayerState, targetIds: string[]) {
      const skill = SKILLS[skillId];
      if (!skill) return null;
      
      const inst = new Instant(skill, caster.id, targetIds, {...caster.position, y: 1.5});
      this.effects[inst.id] = inst;
      return inst.id;
  }
  
  updateAll(dt: number) {
      const updatedEnemies = new Set<string>();
      const updatedPlayers = new Set<string>();
      
      for(const id in this.effects) {
          const e = this.effects[id];
          const results = e.update(dt, this.state);
          
          // Collect IDs of targets that got hit
          results.forEach(result => {
              // Handle HitResult (from Projectile)
              if ('targetId' in result && 'damage' in result) {
                  // HitResult from Projectile
                  const hitId = result.targetId;
                  if (this.state.enemies[hitId]) {
                      updatedEnemies.add(hitId);
                  } else if (this.state.players[hitId]) {
                      updatedPlayers.add(hitId);
                  }
              } 
              // Handle InstantHit
              else if (result.type === 'InstantHit') {
                  this.io.emit('msg', result);
                  (result.hitIds || []).forEach(hitId => {
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
