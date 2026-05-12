import { hash } from '../packages/sim/combatMath.js';
import { PlayerState } from '../shared/types.js';
import {
  DEFAULT_AVAILABLE_SKILL_POINTS,
  DEFAULT_UNLOCKED_SKILLS,
  normalizeSkillShortcuts,
} from './players/playerProgression.js';

export function createTransientPlayer(socketId: string, name: string): PlayerState {
  return {
    id: `player-${hash(socketId + Date.now().toString())}`,
    socketId,
    name,
    position: { x: 0, y: 0.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 100,
    maxHealth: 100,
    mana: 100,
    maxMana: 100,
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
    posHistory: [],
    lastUpdateTime: Date.now(),
    inventory: [],
    maxInventorySlots: 20
  };
}
