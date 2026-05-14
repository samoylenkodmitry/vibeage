import { sql, type Insertable, type RawBuilder, type UpdateObject } from 'kysely';
import { database, type GameDatabase, type PlayersTable, type ServerEventsTable } from './db.js';
import type { SkillId } from '../packages/content/skills.js';
import type { PlayerState } from '../shared/types.js';
import type { InventorySlot } from '../packages/protocol/messages.js';
import {
  normalizeUnlockedSkills,
  serializeSkillShortcuts,
  serializeUnlockedSkills,
} from './players/playerProgression.js';

export const PLAYER_SESSION_COLUMNS = ['name', 'socket_id', 'last_login'] as const;

export const PERSISTED_PLAYER_COLUMNS = [
  'position_x',
  'position_y',
  'position_z',
  'health',
  'is_alive',
  'level',
  'experience',
  'class_name',
  'inventory',
  'skills',
  'skill_shortcuts',
  'available_skill_points',
  'last_updated',
] as const;

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
] as const;

export type StablePlayerPersistenceData = {
  position_x: number;
  position_y: number;
  position_z: number;
  health: number;
  is_alive: boolean;
  level: number;
  experience: number;
  class_name: PlayerState['className'];
  inventory: InventorySlot[];
  skills: string;
  skill_shortcuts: string;
  available_skill_points: number;
  last_updated: number;
};

type PlayerPersistencePatch = UpdateObject<GameDatabase, 'players'>;

type PlayerSessionInsert = Pick<Insertable<PlayersTable>, 'name' | 'socket_id' | 'last_login'>;

type ServerEventInsert = Pick<Insertable<ServerEventsTable>, 'event_type' | 'player_id' | 'event_data' | 'timestamp'>;

export function isPersistenceDisabled(): boolean {
  return process.env.VIBEAGE_DISABLE_PERSISTENCE === '1';
}

function currentUnixMs(): number {
  return Date.now();
}

function currentDate(): Date {
  return new Date();
}

function toJsonb<T>(value: unknown): RawBuilder<T> {
  if (value === null || value === undefined) {
    return sql<T>`null::jsonb`;
  }

  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return sql<T>`${serialized}::jsonb`;
}

export function buildStablePlayerPersistenceData(
  player: PlayerState,
  timestamp: number = currentUnixMs(),
): StablePlayerPersistenceData {
  const unlockedSkills = normalizeUnlockedSkills(player.unlockedSkills);

  return {
    position_x: player.position.x,
    position_y: player.position.y,
    position_z: player.position.z,
    health: player.health,
    is_alive: player.isAlive,
    level: player.level,
    experience: player.experience,
    class_name: player.className,
    inventory: player.inventory || [],
    skills: serializeUnlockedSkills(unlockedSkills),
    skill_shortcuts: serializeSkillShortcuts(player.skillShortcuts, unlockedSkills),
    available_skill_points: player.availableSkillPoints,
    last_updated: timestamp,
  };
}

function toPlayerPersistencePatch(player: PlayerState): PlayerPersistencePatch {
  const stableData = buildStablePlayerPersistenceData(player);

  return {
    ...stableData,
    inventory: toJsonb<InventorySlot[]>(stableData.inventory),
    skills: toJsonb<SkillId[]>(stableData.skills),
    skill_shortcuts: toJsonb<Array<SkillId | null>>(stableData.skill_shortcuts),
  };
}

export async function upsertPlayerSession(socketId: string, name: string) {
  const loginTime = currentDate();
  const values: PlayerSessionInsert = {
    name,
    socket_id: socketId,
    last_login: loginTime,
  };

  return database
    .insertInto('players')
    .values(values as Insertable<PlayersTable>)
    .onConflict((oc) => oc.column('name').doUpdateSet({
      socket_id: socketId,
      last_login: loginTime,
    }))
    .returningAll()
    .executeTakeFirstOrThrow();
}

/**
 * Persists player state to the database
 */
export async function persistPlayer(player: PlayerState) {
  if (isPersistenceDisabled()) {
    return;
  }

  try {
    await database
      .updateTable('players')
      .set(toPlayerPersistencePatch(player))
      .where('id', '=', player.id)
      .execute();
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

  const values: ServerEventInsert = {
    event_type: eventType,
    player_id: playerId,
    event_data: toJsonb<unknown>(eventData),
    timestamp: currentUnixMs(),
  };

  try {
    await database
      .insertInto('server_events')
      .values(values as Insertable<ServerEventsTable>)
      .execute();
  } catch (error) {
    console.error(`Failed to record server event ${eventType}:`, error);
  }
}
