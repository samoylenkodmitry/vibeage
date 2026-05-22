import type { Room } from '@colyseus/sdk';
import type { ClientMessage } from '../../../packages/protocol/messages';
import { SESSION_EVENTS } from '../../../packages/protocol/sessionEvents';
import { isRejectableCommand, type RejectableCommand } from '../../../packages/protocol/commandRejections';
import { nextClientSeq } from './commandSeq';

/**
 * Archwork #4 — centralised client → server command sender.
 *
 * Before this module every `clientActions.ts` site repeated
 * `room.send(SESSION_EVENTS.message, { ... })` and (for rejectable
 * commands) manually called `nextClientSeq()`. New rejectable
 * commands could forget to stamp the sequence, breaking
 * `CommandRejected` correlation silently.
 *
 * Two functions, one decision:
 *
 *   - `sendRejectable(room, command)` — stamps `clientSeq`
 *     automatically. Use for everything in
 *     `REJECTABLE_COMMANDS` (the type checker enforces it).
 *
 *   - `sendFireAndForget(room, command)` — no clientSeq, no
 *     correlation. Use for high-frequency client-initiated
 *     intents (MoveIntent, LootPickup) or intentionally silent
 *     ones (RequestInventory, DevTeleport, TalkNpc, SetSkillShortcut).
 *
 * Both no-op gracefully when `room` is null so the call site can
 * be a one-liner without a guard.
 *
 * Commands that carry `clientTs` (MoveIntent, UseItem) still need
 * to be timestamped at the call site — that's not the sender's
 * job. Adding a third helper here would overload the surface.
 */

// Discriminated commands with a clientSeq slot in their payload.
type RejectableClientCommand = Extract<ClientMessage, { type: RejectableCommand; clientSeq?: number }>;
// Commands with NO clientSeq — fire-and-forget by design.
type FireAndForgetCommand = Exclude<ClientMessage, { type: RejectableCommand }>;

// Distributive helper: for each variant V in the union, produce the
// shape with clientSeq made optional (so the caller can omit it).
type WithOptionalClientSeq<V> = V extends { clientSeq?: number }
  ? Omit<V, 'clientSeq'> & { clientSeq?: number }
  : V;
type RejectableCommandInput = WithOptionalClientSeq<RejectableClientCommand>;

/**
 * Send a rejectable command with an auto-stamped `clientSeq`. The
 * server may emit `CommandRejected` with `requestId === clientSeq`
 * so the client can route the failure back to this specific call.
 */
export function sendRejectable(
  room: Pick<Room, 'send'> | null | undefined,
  command: RejectableCommandInput,
): void {
  if (!room) return;
  // Defensive: if the caller already stamped a clientSeq (e.g. a
  // retry path that wants to keep the original id), honor it.
  // Otherwise allocate a fresh one.
  const stamped = command.clientSeq !== undefined
    ? command
    : { ...command, clientSeq: nextClientSeq() };
  // Compile-time we know stamped matches a RejectableClientCommand
  // variant; the protocol's Zod schema accepts the result. One
  // cast at the seam to drop the optional-clientSeq wrapper.
  room.send(SESSION_EVENTS.message, stamped as unknown as ClientMessage);
  // Sanity check at runtime that command.type is actually a
  // RejectableCommand — catches a caller smuggling a non-rejectable
  // type past TS. Dev-time guard; in production the server's Zod
  // schema rejection is the safety net.
  if (process.env.NODE_ENV !== 'production' && !isRejectableCommand(command.type)) {
    console.warn(`sendRejectable: ${command.type} is not in REJECTABLE_COMMANDS — should be sendFireAndForget`);
  }
}

/**
 * Send a fire-and-forget command — no clientSeq, no correlation.
 * The server may still drop the command (rate limit, ownership
 * check) but won't emit a CommandRejected envelope back.
 */
export function sendFireAndForget<C extends FireAndForgetCommand>(
  room: Pick<Room, 'send'> | null | undefined,
  command: C,
): void {
  if (!room) return;
  room.send(SESSION_EVENTS.message, command);
}
