import type { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import type { GameState } from '../gameState.js';
import type { PlayerState } from '../../shared/types.js';
import { db } from '../db.js';
import { isPersistenceDisabled, persistPlayer, recordServerEvent } from '../persistence.js';
import { createTransientPlayer } from '../playerFactory.js';
import {
  normalizeAvailableSkillPoints,
  normalizeSkillShortcuts,
  normalizeUnlockedSkills,
} from './playerProgression.js';

type PlayerRow = Record<string, any>;

function numberOrFallback(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePlayerLevel(value: unknown): number {
  return Math.max(1, Math.floor(numberOrFallback(value, 1)));
}

function getMaxHealthForLevel(level: number): number {
  return 100 + (level - 1) * 20;
}

function getMaxManaForLevel(level: number): number {
  return 100 + (level - 1) * 10;
}

function getExperienceToNextLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}

function addPlayerToState(state: GameState, spatial: SpatialHashGrid, player: PlayerState): PlayerState {
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
  const maxHealth = getMaxHealthForLevel(level);
  const maxMana = getMaxManaForLevel(level);

  return {
    id: row.id,
    socketId,
    name,
    position: {
      x: row.position_x || 0,
      y: row.position_y || 0.5,
      z: row.position_z || 0,
    },
    rotation: { x: 0, y: 0, z: 0 },
    health: numberOrFallback(row.health, maxHealth),
    maxHealth,
    mana: numberOrFallback(row.mana, maxMana),
    maxMana,
    level,
    experience: numberOrFallback(row.experience ?? row.xp, 0),
    experienceToNextLevel: getExperienceToNextLevel(level),
    statusEffects: [],
    skillCooldownEndTs: {},
    castingSkill: null,
    castingProgressMs: 0,
    isAlive: row.is_alive !== undefined ? row.is_alive : true,
    className: row.class_name || 'mage',
    unlockedSkills,
    skillShortcuts: normalizeSkillShortcuts(row.skill_shortcuts, unlockedSkills),
    availableSkillPoints: normalizeAvailableSkillPoints(row.available_skill_points),
    posHistory: [],
    lastUpdateTime: Date.now(),
    inventory: row.inventory || [],
    maxInventorySlots: 20,
  };
}

export async function addPlayerSession(
  state: GameState,
  spatial: SpatialHashGrid,
  socketId: string,
  name: string,
): Promise<PlayerState> {
  const addTransientPlayer = () => addPlayerToState(state, spatial, createTransientPlayer(socketId, name));

  if (isPersistenceDisabled()) {
    return addTransientPlayer();
  }

  try {
    const { rows: [row] } = await db.query(
      `insert into players (name, socket_id, last_login)
         values ($1, $2, now())
         on conflict (name) do update
         set socket_id = excluded.socket_id,
             last_login = now()
       returning *`,
      [name, socketId],
    );

    await recordServerEvent('player_login', row.id, JSON.stringify({ playerName: name, socketId }));

    return addPlayerToState(state, spatial, hydratePersistedPlayer(row, socketId, name));
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

  await recordServerEvent('player_disconnect', playerId, JSON.stringify({ playerName: player.name, socketId }));

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
