import { db } from './db.js';
import { PlayerState } from '../shared/types.js';

/**
 * Persists player state to the database
 */
export async function persistPlayer(p: PlayerState) {
  try {
    await db.query(
      `update players
          set level=$2, xp=$3, 
              inventory=$4::jsonb, skills=$5::jsonb,
              class_name=$6, last_login=now(),
              updated_at = now()
        where id = $1`,
      [p.id, p.level, p.experience, JSON.stringify(p.inventory), JSON.stringify(p.unlockedSkills), p.className]
    );
  } catch (error) {
    console.error(`Failed to persist player ${p.id}:`, error);
  }
}

/**
 * Records player login for analytics
 */
export async function recordPlayerLogin(playerId: string, socketId: string) {
  try {
    await db.query(
      `insert into game_stats (category, name, value) values ('login', $1, 1)`,
      [socketId]
    );
  } catch (error) {
    console.error(`Failed to record login for ${playerId}:`, error);
  }
}

/**
 * Records a server event
 */
export async function recordServerEvent(eventType: string, description?: string) {
  try {
    await db.query(
      `insert into server_events (event_type, description) values ($1, $2)`,
      [eventType, description]
    );
  } catch (error) {
    console.error(`Failed to record server event ${eventType}:`, error);
  }
}
