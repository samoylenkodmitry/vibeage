import { DEFAULT_RACE } from '../packages/content/races.js';
import type { PlayerState } from '../packages/sim/entities.js';
import { normalizeStarterProgressState } from '../packages/protocol/messages.js';
import {
  normalizeUnlockedSkills,
  normalizeSkillShortcuts,
} from './players/playerProgression.js';
import {
  playerRepository,
  type StablePlayerPersistenceData,
} from './persistence/playerRepository.js';

export const PLAYER_SESSION_COLUMNS = ['name', 'socket_id', 'last_login'] as const;

export const PERSISTED_PLAYER_COLUMNS = [
  'position_x',
  'position_y',
  'position_z',
  'health',
  'is_alive',
  'level',
  'experience',
  'gold',
  'class_name',
  'race',
  'inventory',
  'character_inventory',
  'skills',
  'skill_shortcuts',
  'available_skill_points',
  'starter_progress',
  'specialization_id',
  'skill_levels',
  'quest_state',
  'last_updated',
] as const;

export const STABLE_PLAYER_STATE_FIELDS = [
  'position',
  'health',
  'isAlive',
  'level',
  'experience',
  'gold',
  'className',
  'race',
  'inventory',
  'characterInventory',
  'unlockedSkills',
  'skillShortcuts',
  'availableSkillPoints',
  'starterProgress',
  'specializationId',
  'skillLevels',
  'questState',
] as const satisfies ReadonlyArray<keyof PlayerState>;

export const PLAYER_IDENTITY_STATE_FIELDS = [
  'id',
  'name',
] as const satisfies ReadonlyArray<keyof PlayerState>;

export const TRANSIENT_PLAYER_STATE_FIELDS = [
  'socketId',
  'rotation',
  'maxHealth',
  'mana',
  'maxMana',
  'experienceToNextLevel',
  'skillCooldownEndTs',
  'statusEffects',
  'castingSkill',
  'castingProgressMs',
  'deathTimeTs',
  'targetId',
  'lastSnapTime',
  'movement',
  'velocity',
  'posHistory',
  'stats',
  'maxInventorySlots',
] as const satisfies ReadonlyArray<keyof PlayerState>;

export const PLAYER_STATE_PERSISTENCE_POLICY = {
  stable: STABLE_PLAYER_STATE_FIELDS,
  identity: PLAYER_IDENTITY_STATE_FIELDS,
  transient: TRANSIENT_PLAYER_STATE_FIELDS,
} as const;

export type { StablePlayerPersistenceData } from './persistence/playerRepository.js';

export function isPersistenceDisabled(): boolean {
  return process.env.VIBEAGE_DISABLE_PERSISTENCE === '1';
}

function currentUnixMs(): number {
  return Date.now();
}

function currentDate(): Date {
  return new Date();
}

export function buildStablePlayerPersistenceData(
  player: PlayerState,
  timestamp: number = currentUnixMs(),
): StablePlayerPersistenceData {
  const unlockedSkills = normalizeUnlockedSkills(player.unlockedSkills, player.className);
  const starterProgress = normalizeStarterProgressState(player.starterProgress, {
    levelReached: player.level,
    learnedSkills: unlockedSkills.length,
  });

  return {
    position_x: player.position.x,
    position_y: player.position.y,
    position_z: player.position.z,
    health: player.health,
    is_alive: player.isAlive,
    level: player.level,
    experience: player.experience,
    gold: player.gold ?? 0,
    class_name: player.className,
    race: player.race ?? DEFAULT_RACE,
    // §45.7 — `inventory` column is the legacy flat-bag shape;
    // `character_inventory` is the authoritative aggregate. We
    // stopped persisting `inventory` here (always empty) so there's
    // exactly one source of truth on disk. `hydratePersistedPlayer`
    // ignores the column and rebuilds `player.inventory` from the
    // aggregate via `hydratePersistedCharacterInventory`.
    inventory: [],
    character_inventory: player.characterInventory ?? null,
    skills: unlockedSkills,
    skill_shortcuts: normalizeSkillShortcuts(player.skillShortcuts, unlockedSkills),
    available_skill_points: player.availableSkillPoints,
    starter_progress: starterProgress,
    specialization_id: player.specializationId ?? null,
    skill_levels: player.skillLevels ?? {},
    quest_state: player.questState ?? { active: {}, completed: [] },
    last_updated: timestamp,
  };
}

export async function upsertPlayerSession(socketId: string, name: string, accountId?: string) {
  return playerRepository.upsertSession(socketId, name, currentDate(), accountId);
}

/**
 * Persists player state to the database
 */
export async function persistPlayer(player: PlayerState) {
  if (isPersistenceDisabled()) {
    return;
  }

  try {
    await playerRepository.updatePlayer(player.id, buildStablePlayerPersistenceData(player));
  } catch (error) {
    console.error(`Failed to persist player ${player.id} in periodic update:`, error);
  }
}

/**
 * Records a server event
 */
export async function recordServerEvent(eventType: string, playerId: string | null, eventData: unknown) {
  if (isPersistenceDisabled()) {
    return;
  }

  try {
    await playerRepository.insertServerEvent(eventType, playerId, eventData, currentUnixMs());
  } catch (error) {
    console.error(`Failed to record server event ${eventType}:`, error);
  }
}
