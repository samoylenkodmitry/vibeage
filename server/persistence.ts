import { db } from './db.js';
import { PlayerState } from '../shared/types.js';
import {
  normalizeUnlockedSkills,
  serializeSkillShortcuts,
  serializeUnlockedSkills,
} from './players/playerProgression.js';

export function isPersistenceDisabled(): boolean {
    return process.env.VIBEAGE_DISABLE_PERSISTENCE === '1';
}

/**
 * Persists player state to the database
 */
export async function persistPlayer(player: PlayerState) {
    if (isPersistenceDisabled()) {
      return;
    }

    try {
      const client = await db.connect();
      try {
        await client.query(`
          UPDATE players SET
            position_x = $2,
            position_y = $3,
            position_z = $4,
            health = $5,
            is_alive = $6,
            level = $7,
            experience = $8,
            inventory = $9,
            skills = $10,
            skill_shortcuts = $11,
            available_skill_points = $12,
            last_updated = $13
          WHERE id = $1
        `, [
          player.id,
          player.position.x,
          player.position.y,
          player.position.z,
          player.health,
          player.isAlive,
          player.level,
          player.experience,
          JSON.stringify(player.inventory || []),
          serializeUnlockedSkills(player.unlockedSkills),
          serializeSkillShortcuts(player.skillShortcuts, normalizeUnlockedSkills(player.unlockedSkills)),
          player.availableSkillPoints,
          Date.now()
        ]);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(`Failed to persist player ${player.id} in periodic update:`, error);
    }
}

/**
 * Records a server event
 */
export async function recordServerEvent(event_type, player_id, event_data) {
        if (isPersistenceDisabled()) {
          return;
        }

        // Record login for analytics
        try {
          const client = await db.connect();
          try {
            await client.query(`
              INSERT INTO server_events (event_type, player_id, event_data, timestamp)
              VALUES ($1, $2, $3, $4)
            `, [
              event_type,
              player_id,
              event_data,
              Date.now()
            ]);
          } finally {
            client.release();
          }
        } catch (error) {
          console.error('Failed to record player login event:', error);
        }

}
