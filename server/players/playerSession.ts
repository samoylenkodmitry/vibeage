import type { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import type { GameState } from '../gameState.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import type { CharacterClass } from '../../packages/content/classes.js';
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
import { applyStarterLoadout } from '../inventory/starterLoadout.js';

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
};

function normalizeClassName(value: unknown): CharacterClass {
  if (value === 'warrior' || value === 'healer' || value === 'ranger'
    || value === 'knight' || value === 'paladin' || value === 'rogue') {
    return value;
  }
  return 'mage';
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
  const unlockedSkills = normalizeUnlockedSkills(row.skills);
  const level = normalizePlayerLevel(row.level);
  const className = normalizeClassName(row.class_name);
  const derived = derivePlayerStats(level, className);
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
    unlockedSkills,
    skillShortcuts: normalizeSkillShortcuts(row.skill_shortcuts, unlockedSkills),
    availableSkillPoints: normalizeAvailableSkillPoints(row.available_skill_points),
    starterProgress,
    posHistory: [],
    lastUpdateTime: Date.now(),
    inventory: row.inventory || [],
    maxInventorySlots: 20,
    stats: {
      dmgMult: derived.dmgMult,
      critChance: derived.critChance,
      critMult: derived.critMult,
    },
  };
  // Fresh persisted accounts (level 1, empty inventory) get the starter
  // loadout so they see the new equipment system immediately.
  if (player.level === 1 && player.inventory.length === 0) {
    applyStarterLoadout(player);
  }
  return player;
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
