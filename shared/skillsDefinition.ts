// Direct definitions without imports
export type SkillId = 'fireball'|'iceBolt'|'waterSplash'|'petrify';

export type SkillCategory = 'projectile'|'instant'|'beam'|'aura';

export interface SkillDef {
  id: SkillId;
  cat: SkillCategory;
  manaCost: number;
  castMs: number;
  cooldownMs: number;
  dmg?: number;
  range?: number;
  speed?: number;       // tiles/sec
  area?: number;        // tile radius
  status?: {type:string; value:number; durationMs:number}[];
}

// Define the SKILLS directly
export const SKILLS: Record<SkillId,SkillDef> = {
  fireball:    {id:'fireball',    cat:'projectile', manaCost:20, castMs:300, cooldownMs:500, dmg:150, range:1800, speed:22},
  iceBolt:     {id:'iceBolt',     cat:'projectile', manaCost:15, castMs:500,  cooldownMs:3000, dmg:30, range:18, speed:26},
  waterSplash: {id:'waterSplash', cat:'projectile', manaCost:25, castMs:1500, cooldownMs:8000, dmg:20, range:15, speed:20, area:3},
  petrify:     {id:'petrify',     cat:'instant',    manaCost:40, castMs:2000, cooldownMs:15000, dmg:10, range:10,
                 status:[{type:'stun',value:1,durationMs:1000}]}
};
