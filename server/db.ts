import 'dotenv/config';
import { Kysely, PostgresDialect, type ColumnType, type Generated } from 'kysely';
import { Pool } from 'pg';
import type { SkillId } from '../packages/content/skills.js';
import type { InventorySlot, StarterProgressState } from '../packages/protocol/messages.js';

type DefaultColumn<T> = ColumnType<T, T | undefined, T>;
type NullableDefaultColumn<T> = ColumnType<T | null, T | null | undefined, T | null>;
type TimestampColumn = ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
type JsonColumn<T> = ColumnType<T, T | string | undefined, T | string>;

export interface PlayersTable {
  id: Generated<string>;
  socket_id: NullableDefaultColumn<string>;
  name: string;
  level: DefaultColumn<number>;
  xp: DefaultColumn<number>;
  experience: DefaultColumn<number>;
  gold: DefaultColumn<number>;
  health: DefaultColumn<number>;
  is_alive: DefaultColumn<boolean>;
  position_x: DefaultColumn<number>;
  position_y: DefaultColumn<number>;
  position_z: DefaultColumn<number>;
  inventory: JsonColumn<InventorySlot[]>;
  skills: JsonColumn<SkillId[]>;
  skill_shortcuts: JsonColumn<(SkillId | null)[]>;
  available_skill_points: DefaultColumn<number>;
  starter_progress: JsonColumn<StarterProgressState>;
  class_name: DefaultColumn<string>;
  last_login: TimestampColumn;
  last_updated: NullableDefaultColumn<number>;
  updated_at: TimestampColumn;
}

export interface ServerEventsTable {
  id: Generated<number>;
  event_type: string;
  player_id: NullableDefaultColumn<string>;
  event_data: NullableDefaultColumn<unknown>;
  timestamp: NullableDefaultColumn<number>;
  description: NullableDefaultColumn<string>;
  created_at: TimestampColumn;
}

export interface GameStatsTable {
  id: Generated<number>;
  category: string;
  name: string;
  value: ColumnType<string, number | string, number | string>;
  created_at: TimestampColumn;
}

export interface GameDatabase {
  players: PlayersTable;
  server_events: ServerEventsTable;
  game_stats: GameStatsTable;
}

export const pool = new Pool({
  connectionString: process.env.SERVER_DATABASE_URL ?? process.env.DATABASE_URL,
  max: 10,
});

export const database = new Kysely<GameDatabase>({
  dialect: new PostgresDialect({ pool }),
});

let closeStarted = false;

export async function closeDatabase(): Promise<void> {
  if (closeStarted) {
    return;
  }

  closeStarted = true;
  await database.destroy();
}

process.once('SIGTERM', () => {
  void closeDatabase();
});
process.once('SIGINT', () => {
  void closeDatabase();
});
