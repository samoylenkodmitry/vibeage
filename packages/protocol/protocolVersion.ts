/**
 * Shared protocol-version constants consumed by both client and
 * server. The server stamps `PROTOCOL_VERSION` on every join
 * response so a client running an older bundle can detect the
 * mismatch and surface a useful upgrade error rather than
 * failing silently on the first unknown field.
 *
 * Bumping rules:
 *  - Increment `PROTOCOL_VERSION` whenever the wire shape changes
 *    in a way an older client cannot tolerate (new required field
 *    on an existing message, removed field, changed type).
 *  - Lift `MIN_SUPPORTED_CLIENT_PROTOCOL_VERSION` only when older
 *    clients can no longer be served safely. The two numbers can
 *    drift: server might speak v5 while still tolerating v3+.
 */
export const PROTOCOL_VERSION = 2;
export const MIN_SUPPORTED_CLIENT_PROTOCOL_VERSION = 2;
