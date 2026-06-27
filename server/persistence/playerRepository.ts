import { performance } from 'node:perf_hooks';
import { sql, type Insertable, type RawBuilder, type Selectable, type UpdateObject } from 'kysely';
import { runtimeMetrics } from '../observability/runtimeMetrics.js';
import { database, type GameDatabase, type PlayersTable, type ServerEventsTable } from '../db.js';
import type { SkillId } from '../../packages/content/skills.js';
import type { StarterProgressState } from '../../packages/protocol/messages.js';
import type { CharacterInventory } from '../../packages/sim/characterInventory.js';
import type { PlayerQuestState, PlayerState } from '../../packages/sim/entities.js';

export type StablePlayerPersistenceData = {
  position_x: number;
  position_y: number;
  position_z: number;
  health: number;
  is_alive: boolean;
  level: number;
  experience: number;
  gold: number;
  class_name: PlayerState['className'];
  race: NonNullable<PlayerState['race']>;
  character_inventory: CharacterInventory | null;
  skills: SkillId[];
  available_skill_points: number;
  starter_progress: StarterProgressState;
  specialization_id: string | null;
  skill_levels: Record<string, number>;
  quest_state: PlayerQuestState;
  last_updated: number;
};

type PlayerPersistencePatch = UpdateObject<GameDatabase, 'players'>;

type PlayerSessionInsert = Pick<Insertable<PlayersTable>, 'name' | 'socket_id' | 'last_login'>;

type ServerEventInsert = Pick<Insertable<ServerEventsTable>, 'event_type' | 'player_id' | 'event_data' | 'timestamp'>;

type PersistenceDatabase = Pick<typeof database, 'insertInto' | 'updateTable' | 'selectFrom'>;

export interface PlayerRepository {
  upsertSession(socketId: string, name: string, loginTime: Date, accountId?: string): Promise<Selectable<PlayersTable> | null>;
  updatePlayer(playerId: string, data: StablePlayerPersistenceData): Promise<void>;
  /**
   * Insert a brand-new character row on an account, seeded with full stable
   * state (used by Become to carry a guest's progress forward). Returns the
   * generated row id. Throws on the unique (account_id, name) violation.
   */
  insertPlayerForAccount(accountId: string, name: string, data: StablePlayerPersistenceData): Promise<{ id: string }>;
  insertServerEvent(eventType: string, playerId: string | null, eventData: unknown, timestamp: number): Promise<void>;
}

function createKyselyPlayerRepository(db: PersistenceDatabase): PlayerRepository {
  return {
    async upsertSession(socketId, name, loginTime, accountId) {
      // §52 #4 — join-flow DB latency. The session upsert runs on
      // every join (new or reconnect), so this is a load-meaningful
      // signal that #12 can graph.
      const startedAt = performance.now();
      try {
        return await upsertSessionImpl(db, socketId, name, loginTime, accountId);
      } finally {
        runtimeMetrics.recordHistogram('db.upsertSession.durationMs', performance.now() - startedAt);
      }
    },

    async updatePlayer(playerId, data) {
      // §52 #4 — DB write latency histogram so the load-test work
      // (#12) has a real signal to graph instead of running blind.
      const startedAt = performance.now();
      try {
        await db
          .updateTable('players')
          .set(toPlayerPersistencePatch(data))
          .where('id', '=', playerId)
          .execute();
      } finally {
        runtimeMetrics.recordHistogram('db.updatePlayer.durationMs', performance.now() - startedAt);
      }
    },

    async insertPlayerForAccount(accountId, name, data) {
      const row = await db
        .insertInto('players')
        .values({
          ...toPlayerPersistencePatch(data),
          account_id: accountId,
          name,
          last_login: new Date(),
        } as Insertable<PlayersTable>)
        .returning(['id'])
        .executeTakeFirstOrThrow();
      return { id: row.id };
    },

    async insertServerEvent(eventType, playerId, eventData, timestamp) {
      const values: ServerEventInsert = {
        event_type: eventType,
        player_id: playerId,
        event_data: toJsonb<unknown>(eventData),
        timestamp,
      };

      await db
        .insertInto('server_events')
        .values(values as Insertable<ServerEventsTable>)
        .execute();
    },
  };
}

export const playerRepository = createKyselyPlayerRepository(database);

async function upsertSessionImpl(
  db: PersistenceDatabase,
  socketId: string,
  name: string,
  loginTime: Date,
  accountId?: string,
): Promise<Selectable<PlayersTable> | null> {
  if (accountId) {
    // Account-scoped lookup: the row was created via the
    // /api/account/characters POST in the lobby. World join only
    // re-uses it; we don't create a row here. Returning null
    // signals "unknown character for this account" — caller rejects.
    const existing = await db
      .selectFrom('players')
      .where('account_id', '=', accountId)
      .where('name', '=', name)
      .selectAll()
      .executeTakeFirst();
    if (!existing) return null;
    await db
      .updateTable('players')
      .set({ socket_id: socketId, last_login: loginTime })
      .where('id', '=', existing.id)
      .execute();
    return { ...existing, socket_id: socketId, last_login: loginTime } as Selectable<PlayersTable>;
  }
  // Legacy path (no account): kept temporarily so non-auth clients
  // still work. PR I deploy drops this once the auth wave is rolled out.
  const values: PlayerSessionInsert = {
    name,
    socket_id: socketId,
    last_login: loginTime,
  };
  return db
    .insertInto('players')
    .values(values as Insertable<PlayersTable>)
    .onConflict((oc) => oc.column('name').doUpdateSet({
      socket_id: socketId,
      last_login: loginTime,
    }))
    .returningAll()
    .executeTakeFirstOrThrow();
}

function toPlayerPersistencePatch(data: StablePlayerPersistenceData): PlayerPersistencePatch {
  return {
    ...data,
    character_inventory: toJsonb<CharacterInventory | null>(data.character_inventory),
    skills: toJsonb<SkillId[]>(data.skills),
    starter_progress: toJsonb<StarterProgressState>(data.starter_progress),
    skill_levels: toJsonb<Record<string, number>>(data.skill_levels),
    quest_state: toJsonb<PlayerQuestState>(data.quest_state),
  };
}

function toJsonb<T>(value: unknown): RawBuilder<T> {
  if (value === null || value === undefined) {
    return sql<T>`null::jsonb`;
  }

  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return sql<T>`${serialized}::jsonb`;
}
