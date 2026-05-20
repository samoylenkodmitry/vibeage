import { DEFAULT_RACE } from '../packages/content/races.js';
import { createEmptyInventory } from '../packages/sim/characterInventory.js';
import { hash } from '../packages/sim/combatMath.js';
import { PlayerState } from '../packages/sim/entities.js';
import { recomputePlayerStats } from './players/playerStatsRefresh.js';
import { applyStarterLoadout } from './inventory/starterLoadout.js';
import {
  DEFAULT_AVAILABLE_SKILL_POINTS,
  normalizeSkillShortcuts,
  starterSkillsFor,
} from './players/playerProgression.js';
import { createInitialPlayerStarterProgress } from './progression/starterPath.js';

const PLAYER_INVENTORY_LIMITS = {
  baseSlots: 20,
  bonusSlots: 0,
  maxWeight: 80_000,
};

export function createTransientPlayer(socketId: string, name: string): PlayerState {
  const playerId = `player-${hash(socketId + Date.now().toString())}`;
  const player: PlayerState = {
    id: playerId,
    socketId,
    name,
    position: { x: 0, y: 0.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 1,
    maxHealth: 1,
    mana: 1,
    maxMana: 1,
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
    unlockedSkills: starterSkillsFor('mage'),
    skillShortcuts: normalizeSkillShortcuts(undefined, starterSkillsFor('mage')),
    availableSkillPoints: DEFAULT_AVAILABLE_SKILL_POINTS,
    starterProgress: createInitialPlayerStarterProgress({
      level: 1,
      unlockedSkills: starterSkillsFor('mage'),
    }),
    specializationId: null,
    skillLevels: {},
    questState: { active: {}, completed: [] },
    posHistory: [],
    lastUpdateTime: Date.now(),
    maxInventorySlots: 20,
    characterInventory: createEmptyInventory(playerId, PLAYER_INVENTORY_LIMITS),
  };
  // Stocking the starter loadout populates the aggregate; the
  // snapshot boundary projects to the legacy slot view on the wire.
  applyStarterLoadout(player);
  // PR NN — single source of stat computation. Reads contributions
  // from race / level / class / equipment and writes player.stats +
  // max{Health,Mana}; bottoms out the placeholder 1/1 vitals above.
  recomputePlayerStats(player);
  player.health = player.maxHealth;
  player.mana = player.maxMana;
  return player;
}
