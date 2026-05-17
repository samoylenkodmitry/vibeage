import type { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import type { GameState } from '../gameState.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import { CLASS_SKILL_TREES, type CharacterClass } from '../../packages/content/classes.js';
import { UNIVERSAL_SKILLS } from '../../packages/content/skills.js';
import { CHARACTER_RACES, DEFAULT_RACE, type CharacterRace } from '../../packages/content/races.js';
import { normalizeStarterProgressState, type InventorySlot } from '../../packages/protocol/messages.js';
import { isPersistenceDisabled, persistPlayer, recordServerEvent, upsertPlayerSession } from '../persistence.js';
import { createTransientPlayer } from '../playerFactory.js';
import {
  getExperienceToNextLevel,
  normalizePlayerLevel,
  normalizeAvailableSkillPoints,
  numberOrFallback,
  normalizeSkillShortcuts,
  normalizeUnlockedSkills,
} from './playerProgression.js';
import { derivePlayerStats } from '../../packages/sim/playerStats.js';
import { projectPlayerStats, refreshPlayerStatsFromEquipment } from '../inventory/equipHandlers.js';
import { applyStarterLoadout } from '../inventory/starterLoadout.js';
import { hydratePersistedCharacterInventory } from '../inventory/aggregateBridge.js';
import { forgetSocketRateLimits } from '../world/rateLimiter.js';
import { forgetMovementFreshness } from '../movement/staleIntentTracker.js';
import { starterSkillsFor } from './playerProgression.js';

type PlayerRow = {
  id: string;
  position_x?: unknown;
  position_y?: unknown;
  position_z?: unknown;
  health?: unknown;
  mana?: unknown;
  level?: unknown;
  xp?: unknown;
  experience?: unknown;
  is_alive?: boolean | null;
  class_name?: unknown;
  skills?: unknown;
  skill_shortcuts?: unknown;
  available_skill_points?: unknown;
  starter_progress?: unknown;
  inventory?: InventorySlot[];
  character_inventory?: unknown;
  race?: unknown;
};

function normalizeClassName(value: unknown): CharacterClass {
  if (value === 'warrior' || value === 'healer' || value === 'ranger'
    || value === 'knight' || value === 'paladin' || value === 'rogue') {
    return value;
  }
  return 'mage';
}

function normalizeRace(value: unknown): CharacterRace {
  if (typeof value === 'string' && CHARACTER_RACES.includes(value as CharacterRace)) {
    return value as CharacterRace;
  }
  return DEFAULT_RACE;
}

export function upsertActivePlayerSession(state: GameState, spatial: SpatialHashGrid, player: PlayerState): PlayerState {
  const existing = state.players[player.id];
  if (existing) {
    existing.socketId = player.socketId;
    existing.name = player.name;
    return existing;
  }

  state.players[player.id] = player;
  spatial.insert(player.id, { x: player.position.x, z: player.position.z });
  return player;
}

export function findPlayerIdBySocket(state: GameState, socketId: string): string | undefined {
  return Object.keys(state.players).find(id => state.players[id].socketId === socketId);
}

export function hydratePersistedPlayer(row: PlayerRow, socketId: string, name: string): PlayerState {
  const level = normalizePlayerLevel(row.level);
  const className = normalizeClassName(row.class_name);
  const unlockedSkills = normalizeUnlockedSkills(row.skills, className);
  const race = normalizeRace(row.race);
  const derived = derivePlayerStats(level, className, {}, race);
  const starterProgress = normalizeStarterProgressState(row.starter_progress, {
    levelReached: level,
    learnedSkills: unlockedSkills.length,
  });

  const player: PlayerState = {
    id: row.id,
    socketId,
    name,
    position: {
      x: numberOrFallback(row.position_x, 0),
      y: numberOrFallback(row.position_y, 0.5),
      z: numberOrFallback(row.position_z, 0),
    },
    rotation: { x: 0, y: 0, z: 0 },
    health: numberOrFallback(row.health, derived.maxHealth),
    maxHealth: derived.maxHealth,
    mana: numberOrFallback(row.mana, derived.maxMana),
    maxMana: derived.maxMana,
    level,
    experience: numberOrFallback(row.experience ?? row.xp, 0),
    experienceToNextLevel: getExperienceToNextLevel(level),
    statusEffects: [],
    skillCooldownEndTs: {},
    castingSkill: null,
    castingProgressMs: 0,
    isAlive: row.is_alive !== undefined ? row.is_alive : true,
    className,
    race,
    unlockedSkills,
    skillShortcuts: normalizeSkillShortcuts(row.skill_shortcuts, unlockedSkills),
    availableSkillPoints: normalizeAvailableSkillPoints(row.available_skill_points),
    starterProgress,
    posHistory: [],
    lastUpdateTime: Date.now(),
    inventory: row.inventory || [],
    maxInventorySlots: 20,
    stats: projectPlayerStats(derived),
  };
  // Restore the persisted CharacterInventory aggregate (item instances +
  // equipment slots + occupancy). Without this, equipped gear silently
  // disappears on the next session because the legacy `inventory` jsonb
  // only carries the flat bag-slot view.
  hydratePersistedCharacterInventory(player, row.character_inventory);
  // Fresh persisted accounts (level 1, empty inventory) get the starter
  // loadout so they see the new equipment system immediately.
  if (
    player.level === 1
    && player.inventory.length === 0
    && !player.characterInventory
  ) {
    applyStarterLoadout(player);
  }
  // Recompute derived stats now that equipment has been restored. Called
  // unconditionally so legacy players (no character_inventory column yet
  // populated but with items in the legacy bag) still get the correct
  // equipment bonuses on login — refreshPlayerStatsFromEquipment lazily
  // builds the aggregate from the legacy slots when missing.
  refreshPlayerStatsFromEquipment(player);
  // Retroactive starter-skill backfill: a player who switched class
  // BEFORE slice #20's ensureClassHasStarterSkill fix shipped will have
  // className='warrior' but unlockedSkills=['fireball'] — they can't
  // learn any warrior skill (prereqs reference slash, which they don't
  // own). Re-run the same predicate on hydrate so persisted players
  // get unstuck on next login.
  ensureClassStarterUnlocked(player);
  return player;
}

function ensureClassStarterUnlocked(player: PlayerState): void {
  const [starter] = starterSkillsFor(player.className);
  if (!starter) return;
  // Drop carried-over skills that don't belong to the current class
  // tree. A legacy warrior persisted with skills=['fireball'] would
  // otherwise become ['fireball','slash'] after the starter push,
  // letting them cast a mage skill they should never have had — and
  // applyClassChange's refundable count (unlockedSkills.length - 1)
  // would refund a skill point for that invalid mage skill on the
  // next class change.
  const tree = CLASS_SKILL_TREES[player.className];
  const treeSkills = new Set<string>(tree ? Object.keys(tree.skillProgression) : [starter]);
  // Universal skills (Basic Attack) are not in any class tree — keep
  // them so the filter doesn't strip them on class switch / hydrate.
  for (const skill of UNIVERSAL_SKILLS) {
    treeSkills.add(skill);
  }
  player.unlockedSkills = player.unlockedSkills.filter((skill) => treeSkills.has(skill));
  for (const skill of UNIVERSAL_SKILLS) {
    if (!player.unlockedSkills.includes(skill)) {
      player.unlockedSkills.push(skill);
    }
  }
  if (!player.unlockedSkills.includes(starter)) {
    player.unlockedSkills.push(starter);
  }
  // Same prune on shortcuts: drop slots referencing skills no longer
  // unlocked, then bind the starter into the first empty slot.
  player.skillShortcuts = player.skillShortcuts.map((skill) =>
    skill && player.unlockedSkills.includes(skill) ? skill : null,
  );
  if (!player.skillShortcuts.includes(starter)) {
    const emptySlotIndex = player.skillShortcuts.findIndex((slot) => slot === null);
    if (emptySlotIndex !== -1) {
      player.skillShortcuts[emptySlotIndex] = starter;
    }
  }
}

export async function addPlayerSession(
  state: GameState,
  spatial: SpatialHashGrid,
  socketId: string,
  name: string,
): Promise<PlayerState> {
  const addTransientPlayer = () => upsertActivePlayerSession(state, spatial, createTransientPlayer(socketId, name));

  if (isPersistenceDisabled()) {
    return addTransientPlayer();
  }

  try {
    const row = await upsertPlayerSession(socketId, name);

    await recordServerEvent('player_login', row.id, { playerName: name, socketId });

    return upsertActivePlayerSession(state, spatial, hydratePersistedPlayer(row, socketId, name));
  } catch (error) {
    console.error('Error adding player to database:', error);
    return addTransientPlayer();
  }
}

export async function removePlayerSessionBySocketId(
  state: GameState,
  spatial: SpatialHashGrid,
  socketId: string,
): Promise<string | null> {
  forgetSocketRateLimits(socketId);
  forgetMovementFreshness(socketId);
  const playerId = findPlayerIdBySocket(state, socketId);
  if (!playerId) {
    return null;
  }

  const player = state.players[playerId];
  const pos = { x: player.position.x, z: player.position.z };

  await recordServerEvent('player_disconnect', playerId, { playerName: player.name, socketId });

  try {
    await persistPlayer(player);
  } catch (error) {
    console.error(`Failed to persist player ${playerId} on disconnect:`, error);
  }

  spatial.remove(playerId, pos);
  delete state.players[playerId];

  return playerId;
}

export async function persistActivePlayers(state: GameState): Promise<void> {
  const results = await Promise.allSettled(
    Object.values(state.players).map(player => persistPlayer(player)),
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Failed to persist active player:', result.reason);
    }
  }
}
