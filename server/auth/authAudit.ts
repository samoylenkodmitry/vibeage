import type { Request } from 'express';
import { sql, type Insertable } from 'kysely';
import { database, type ServerEventsTable } from '../db.js';

/**
 * Auth + character-lifecycle audit log. Every event we'd want to
 * grep for during incident response — successful + failed login,
 * logout, register, character create / delete, account delete,
 * suspicious ownership attempts — writes a `server_events` row
 * with a stable `event_type` and the relevant context.
 *
 * Best-effort: a failure to persist must never break the action
 * itself (we still want logout to succeed even if the DB pool is
 * full). Errors are logged + swallowed.
 *
 * Each entry is also mirrored to console so prod logs stay
 * grep-able without round-tripping through Postgres.
 */
export type AuthAuditEventType =
  | 'auth.login.success'
  | 'auth.login.failure'
  | 'auth.register.success'
  | 'auth.logout'
  | 'account.delete'
  | 'character.create'
  | 'character.delete'
  | 'ownership.suspicious';

export interface AuthAuditEvent {
  type: AuthAuditEventType;
  accountId?: string | null;
  login?: string | null;
  characterName?: string | null;
  reason?: string | null;
  remoteAddr?: string | null;
}

export async function recordAuthAuditEvent(event: AuthAuditEvent): Promise<void> {
  const data = {
    accountId: event.accountId ?? null,
    login: event.login ?? null,
    characterName: event.characterName ?? null,
    reason: event.reason ?? null,
    remoteAddr: event.remoteAddr ?? null,
  };
  // Prod logs grep on this `[audit]` prefix.
  console.log(`[audit] ${event.type}`, JSON.stringify(data));
  try {
    const values: Pick<Insertable<ServerEventsTable>, 'event_type' | 'player_id' | 'event_data' | 'timestamp' | 'description'> = {
      event_type: event.type,
      player_id: null,
      event_data: sql`${JSON.stringify(data)}::jsonb`,
      timestamp: Date.now(),
      description: event.login ? `${event.type} login=${event.login}` : event.type,
    };
    await database
      .insertInto('server_events')
      .values(values as Insertable<ServerEventsTable>)
      .execute();
  } catch (err) {
    console.warn(`[audit] failed to persist ${event.type}:`, err);
  }
}

/**
 * Extract a coarse client IP for audit context. Honours
 * X-Forwarded-For when set by a trusted proxy; falls back to the
 * raw socket address. Treated as best-effort context, not a
 * security signal.
 */
export function clientIp(req: Request): string | null {
  const xff = req.header('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || null;
  return req.socket?.remoteAddress ?? null;
}
