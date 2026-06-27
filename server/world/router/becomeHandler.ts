import type { ClientMessage } from '../../../packages/protocol/messages.js';
import type { PlayerState } from '../../../packages/sim/entities.js';
import type { GameState } from '../../gameState.js';
import type { OutboundEventSink } from '../../transport/outboundEvents.js';
import type { WorldClient } from './commandContext.js';
import { findPlayerIdBySocket } from '../../players/playerSession.js';
import { applyBecomeIdentity } from '../../players/playerIdentity.js';
import { isGmAccount } from '../../players/gmMode.js';
import { verifySessionToken } from '../../auth/sessionTokens.js';
import { buildStablePlayerPersistenceData, isPersistenceDisabled } from '../../persistence.js';
import { playerRepository } from '../../persistence/playerRepository.js';
import { log, warn, LOG_CATEGORIES } from '../../logger.js';

const NAME_RE = /^[A-Za-z0-9._-]+$/;

/**
 * Become: promote the live Nameless guest into a saved hero IN PLACE, carrying
 * its current progress (level/xp/gold/inventory/quests/position). The runtime
 * player keeps playing on the same socket — no reconnect — and its state is
 * persisted into a new character row on the verified account.
 *
 * The client pre-validates the name (and authenticates over HTTP) before
 * sending this, so the guards here are defensive: a forged or stale message is
 * logged and dropped rather than answered, since legitimate clients never hit
 * them.
 */
export function onBecomeCharacter(
  socket: WorldClient,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'BecomeCharacter' }>,
  outbound: OutboundEventSink,
): void {
  const playerId = findPlayerIdBySocket(state, socket.id);
  const player = playerId ? state.players[playerId] : undefined;
  if (!player) return;
  // Only an unbound guest can Become — never overwrite a logged-in hero.
  if (player.accountId || player.persistentId) {
    warn(LOG_CATEGORIES.PLAYER, `BecomeCharacter ignored: ${socket.id} already bound to an account`);
    return;
  }
  const session = verifySessionToken(msg.sessionToken);
  if (!session) {
    warn(LOG_CATEGORIES.PLAYER, `BecomeCharacter rejected: invalid/expired token from ${socket.id}`);
    return;
  }
  const name = msg.name.trim();
  if (name.length < 1 || name.length > 24 || !NAME_RE.test(name)) {
    warn(LOG_CATEGORIES.PLAYER, `BecomeCharacter rejected: invalid name from ${socket.id}`);
    return;
  }
  // Stamp the identity immediately (instant in-world feedback), then persist
  // the carried-forward state into a new row.
  const applied = applyBecomeIdentity(player, msg.race, msg.className, name, outbound);
  if (applied.ok === false) {
    warn(LOG_CATEGORIES.PLAYER, `BecomeCharacter rejected: ${applied.reason} from ${socket.id}`);
    return;
  }
  player.accountId = session.accountId;
  player.isGm = isGmAccount(player);
  void persistPromotedGuest(player, session.accountId, name);
}

async function persistPromotedGuest(player: PlayerState, accountId: string, name: string): Promise<void> {
  // Persistence-off (e2e): identity is applied in-memory; nothing to write.
  if (isPersistenceDisabled()) return;
  try {
    const { id } = await playerRepository.insertPlayerForAccount(
      accountId,
      name,
      buildStablePlayerPersistenceData(player),
    );
    player.persistentId = id;
    log(LOG_CATEGORIES.PLAYER, `Promoted guest ${player.id} -> character row ${id} on account ${accountId}`);
  } catch (err) {
    // Most likely the unique (account_id, name) collision — the client
    // pre-checks the name, so this is a forged/edge case. The player keeps the
    // chosen identity in-memory for this session; nothing persists.
    console.error(`Become promotion failed for "${name}":`, err);
  }
}
