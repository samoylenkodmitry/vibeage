import { DEFAULT_RACE } from '../packages/content/races.js';
import type { PlayerState } from '../packages/sim/entities.js';
import { normalizeStarterProgressState } from '../packages/protocol/messages.js';
import { ensureCharacterInventory } from './inventory/aggregateBridge.js';
import {
  normalizeUnlockedSkills,
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
  'character_inventory',
  'skills',
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
  'characterInventory',
  'unlockedSkills',
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
  // §52 #2 — `inventory` field retired from PlayerState. The wire
  // emit (`InventoryUpdate`, `playerUpdated.inventory`) flattens
  // `characterInventory` on demand; nothing transient about it now.
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

  // §45.7 — `characterInventory` is the only inventory store on
  // disk. Production paths always seed it; fall back to an empty
  // aggregate for the rare test fixture that didn't.
  const aggregate = ensureCharacterInventory(player);

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
    // §45.7 — `inventory` column dropped (migration 011);
    // `character_inventory` is the only persisted store.
    character_inventory: aggregate,
    skills: unlockedSkills,
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
 * Insert the character row for a just-Become'd guest, carrying its current
 * state. Idempotent-ish: only runs while `pendingPersistentInsert` is set, and
 * clears it (and sets `persistentId`) on success. If the insert fails (DB
 * hiccup), the flag stays set so the next persist retries — the carried-forward
 * progress is never silently dropped. A genuine (account, name) collision keeps
 * failing harmlessly without ever overwriting the existing character.
 */
export async function promotePendingGuest(player: PlayerState): Promise<void> {
  if (isPersistenceDisabled() || !player.accountId || !player.pendingPersistentInsert) {
    return;
  }
  try {
    const { id } = await playerRepository.insertPlayerForAccount(
      player.accountId,
      player.name,
      buildStablePlayerPersistenceData(player),
    );
    player.persistentId = id;
    player.pendingPersistentInsert = false;
  } catch (error) {
    console.error(`Failed to insert promoted-guest row for "${player.name}":`, error);
  }
}

/**
 * Persists player state to the database
 */
export async function persistPlayer(player: PlayerState) {
  if (isPersistenceDisabled()) {
    return;
  }

  try {
    // A Become'd guest whose row insert hasn't landed yet: (re)try the insert
    // rather than UPDATE a non-existent guest id.
    if (player.pendingPersistentInsert && player.accountId) {
      await promotePendingGuest(player);
      return;
    }
    // A promoted guest keeps its runtime id but persists to the real DB row.
    await playerRepository.updatePlayer(player.persistentId ?? player.id, buildStablePlayerPersistenceData(player));
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
