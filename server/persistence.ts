import { sql } from 'kysely';
import { database } from './db.js';
import { PlayerState } from '../shared/types.js';
import {
  normalizeUnlockedSkills,
  serializeSkillShortcuts,
  serializeUnlockedSkills,
} from './players/playerProgression.js';

export function isPersistenceDisabled(): boolean {
    return process.env.VIBEAGE_DISABLE_PERSISTENCE === '1';
}

function toJsonb(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return sql<unknown>`${serialized}::jsonb`;
}

export async function upsertPlayerSession(socketId: string, name: string) {
  return database
    .insertInto('players')
    .values({
      name,
      socket_id: socketId,
      last_login: sql<Date>`now()`,
    } as any)
    .onConflict((oc) => oc.column('name').doUpdateSet({
      socket_id: socketId,
      last_login: sql<Date>`now()`,
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
        .set({
          position_x: player.position.x,
          position_y: player.position.y,
          position_z: player.position.z,
          health: player.health,
          is_alive: player.isAlive,
          level: player.level,
          experience: player.experience,
          inventory: toJsonb(player.inventory || []),
          skills: toJsonb(serializeUnlockedSkills(player.unlockedSkills)),
          skill_shortcuts: toJsonb(serializeSkillShortcuts(player.skillShortcuts, normalizeUnlockedSkills(player.unlockedSkills))),
          available_skill_points: player.availableSkillPoints,
          last_updated: Date.now(),
        } as any)
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

        // Record login for analytics
        try {
          await database
            .insertInto('server_events')
            .values({
              event_type: eventType,
              player_id: playerId,
              event_data: toJsonb(eventData),
              timestamp: Date.now(),
            } as any)
            .execute();
        } catch (error) {
          console.error('Failed to record player login event:', error);
        }

}
