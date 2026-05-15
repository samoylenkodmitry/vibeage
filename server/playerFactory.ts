import { hash } from '../packages/sim/combatMath.js';
import { PlayerState } from '../packages/sim/entities.js';
import { derivePlayerStats } from '../packages/sim/playerStats.js';
import {
  DEFAULT_AVAILABLE_SKILL_POINTS,
  DEFAULT_UNLOCKED_SKILLS,
  normalizeSkillShortcuts,
} from './players/playerProgression.js';
import { createInitialPlayerStarterProgress } from './progression/starterPath.js';

export function createTransientPlayer(socketId: string, name: string): PlayerState {
  const stats = derivePlayerStats(1, 'mage');
  return {
    id: `player-${hash(socketId + Date.now().toString())}`,
    socketId,
    name,
    position: { x: 0, y: 0.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: stats.maxHealth,
    maxHealth: stats.maxHealth,
    mana: stats.maxMana,
    maxMana: stats.maxMana,
    level: 1,
    experience: 0,
    experienceToNextLevel: 100,
    statusEffects: [],
    skillCooldownEndTs: {},
    castingSkill: null,
    castingProgressMs: 0,
    isAlive: true,
    className: 'mage',
    unlockedSkills: [...DEFAULT_UNLOCKED_SKILLS],
    skillShortcuts: normalizeSkillShortcuts(undefined, DEFAULT_UNLOCKED_SKILLS),
    availableSkillPoints: DEFAULT_AVAILABLE_SKILL_POINTS,
    starterProgress: createInitialPlayerStarterProgress({
      level: 1,
      unlockedSkills: DEFAULT_UNLOCKED_SKILLS,
    }),
    posHistory: [],
    lastUpdateTime: Date.now(),
    inventory: [],
    maxInventorySlots: 20,
    stats: {
      dmgMult: stats.dmgMult,
      critChance: stats.critChance,
      critMult: stats.critMult,
    },
  };
}
