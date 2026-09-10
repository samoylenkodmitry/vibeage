export const SESSION_EVENTS = {
  joinGame: 'joinGame',
  requestGameState: 'requestGameState',
  message: 'msg',
  disconnect: 'disconnect',
  connectionRejected: 'connectionRejected',
  playerJoined: 'playerJoined',
  playerLeft: 'playerLeft',
  gameState: 'gameState',
  playerUpdated: 'playerUpdated',
  enemyUpdated: 'enemyUpdated',
  /**
   * Server → client, owner-only: a freshly-minted session token that replaces
   * the one the client just joined with. Sent when the presented token is
   * getting on in age, so an account that keeps playing never walks into an
   * expired session (which would drop them back to the Nameless guest). The
   * client swaps it into its saved session and carries on — no user-visible
   * step, and nothing to answer.
   */
  sessionRenewed: 'sessionRenewed',
} as const;

/**
 * World-join rejection codes carried on the Colyseus join failure — the
 * `ServerError.code` the client sees when `joinOrCreate` rejects (the server
 * throws a `ServerError(code, message)` from `onJoin`, which Colyseus relays to
 * the client as `Protocol.ERROR` → `room.onError` → the rejection).
 *
 * They let the client tell an *authentication* failure — a missing/expired
 * session token, where the only fix is to drop the stale saved session and
 * re-authenticate — apart from a transient network drop, where the fix is to
 * keep retrying with the same token. Without this distinction an expired token
 * traps the player: every reconnect re-presents the dead token and fails, the
 * world renders with no hero, and there's no path back to a login.
 *
 * Values live in the app-reserved 49xx range, clear of Colyseus's own close /
 * error codes (1xxx, 40xx close codes; 520–526, 4217 error codes).
 */
export const WORLD_JOIN_REJECTION = {
  /** Presented session token was absent, malformed, or expired. */
  unauthorized: 4900,
} as const;

