import { describe, expect, it } from 'vitest';
import {
  MIN_SUPPORTED_CLIENT_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
} from '../packages/protocol/protocolVersion';
import {
  MIN_CLIENT_PROTOCOL_VERSION,
  SERVER_PROTOCOL_VERSION,
} from '../server/transport/roomBoundary';

// §46/slice-1 — guarantees that the server's exported constants
// match the shared file. Adding a new const re-export in
// roomBoundary without re-pointing the import will trip this.

describe('shared protocol version constants', () => {
  it('server re-exports match the protocol package source', () => {
    expect(SERVER_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION);
    expect(MIN_CLIENT_PROTOCOL_VERSION).toBe(MIN_SUPPORTED_CLIENT_PROTOCOL_VERSION);
  });

  it('server accepts at least the version it speaks', () => {
    // Server should always tolerate clients on its own version; if
    // we ever ship a server that requires a *newer* client than it
    // speaks itself we've made an undeployable artifact.
    expect(SERVER_PROTOCOL_VERSION).toBeGreaterThanOrEqual(MIN_CLIENT_PROTOCOL_VERSION);
  });
});
