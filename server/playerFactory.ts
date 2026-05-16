import { DEFAULT_RACE } from '../packages/content/races.js';
import { createEmptyInventory } from '../packages/sim/characterInventory.js';
import { hash } from '../packages/sim/combatMath.js';
import { PlayerState } from '../packages/sim/entities.js';
import { derivePlayerStats } from '../packages/sim/playerStats.js';
import { projectPlayerStats } from './inventory/equipHandlers.js';
import { applyStarterLoadout } from './inventory/starterLoadout.js';
import {
  DEFAULT_AVAILABLE_SKILL_POINTS,
  DEFAULT_UNLOCKED_SKILLS,
  normalizeSkillShortcuts,
} from './players/playerProgression.js';
import { createInitialPlayerStarterProgress } from './progression/starterPath.js';

const PLAYER_INVENTORY_LIMITS = {
  baseSlots: 20,
  bonusSlots: 0,
  maxWeight: 80_000,
};

export function createTransientPlayer(socketId: string, name: string): PlayerState {
  const stats = derivePlayerStats(1, 'mage', {}, DEFAULT_RACE);
  const playerId = `player-${hash(socketId + Date.now().toString())}`;
  const player: PlayerState = {
    id: playerId,
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
    race: DEFAULT_RACE,
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
    stats: projectPlayerStats(stats),
    characterInventory: createEmptyInventory(playerId, PLAYER_INVENTORY_LIMITS),
  };
  // Stocking the starter loadout populates both the aggregate and the
  // legacy slot array via the bridge, so the new Bag / Paperdoll panels
  // have something to show on the very first spawn.
  applyStarterLoadout(player);
  return player;
}
