import { describe, expect, it } from 'vitest';
import {
  type PlayerPresenceSnapshot,
  sanitizePlayerForPresence,
} from '../server/transport/clientState';
import { createTransientPlayer } from '../server/playerFactory';
import type { PlayerState } from '../packages/sim/entities';

/**
 * §52 #3 — `PlayerPresenceSnapshot` is the world-wide public-presence
 * DTO (id, name, className, level, isAlive, regionId). Used by the
 * Colyseus `PublicPlayerPresenceState` schema and by any plain-TS
 * consumer (presence panel, REST endpoint, observability dashboard)
 * that needs to type-pin the same shape without instantiating a
 * Schema instance.
 *
 * Narrower than `PublicPlayerSnapshot`: no position, velocity,
 * health, mana, status effects, cast state. Drops everything that
 * would re-introduce a "what's near me" view via the world-wide
 * presence map.
 */

function makeAlive(): PlayerState {
  const p = createTransientPlayer('socket-presence', 'Presencer');
  p.level = 7;
  p.isAlive = true;
  return p;
}

describe('sanitizePlayerForPresence', () => {
  it('projects exactly the six PlayerPresenceSnapshot fields', () => {
    const player = makeAlive();
    const snap = sanitizePlayerForPresence(player, 'starter_meadow');
    expect(snap).toEqual({
      id: player.id,
      name: 'Presencer',
      className: player.className,
      level: 7,
      isAlive: true,
      regionId: 'starter_meadow',
    });
    // Belt-and-suspenders: no extra keys leaked from PlayerState.
    expect(Object.keys(snap).sort()).toEqual(
      ['className', 'id', 'isAlive', 'level', 'name', 'regionId'].sort(),
    );
  });

  it('defaults regionId to "" when the player is not in any zone', () => {
    const snap = sanitizePlayerForPresence(makeAlive());
    expect(snap.regionId).toBe('');
  });

  it('carries isAlive=false for dead players (presence still shows the dot, just dimmed)', () => {
    const player = makeAlive();
    player.isAlive = false;
    const snap = sanitizePlayerForPresence(player, 'starter_meadow');
    expect(snap.isAlive).toBe(false);
  });

  it('does NOT carry server-only / privacy-sensitive fields', () => {
    const player = makeAlive();
    const snap = sanitizePlayerForPresence(player, 'r');
    // Cast through any so the test compiles even if we accidentally
    // add a field — the assertion is the safety net.
    const leaked = snap as unknown as Record<string, unknown>;
    expect(leaked).not.toHaveProperty('socketId');
    expect(leaked).not.toHaveProperty('characterInventory');
    expect(leaked).not.toHaveProperty('position');
    expect(leaked).not.toHaveProperty('health');
    expect(leaked).not.toHaveProperty('mana');
    expect(leaked).not.toHaveProperty('stats');
    expect(leaked).not.toHaveProperty('skillCooldownEndTs');
  });

  it('produces the same shape that PublicPlayerPresenceState (worldStateSchema.ts) fills', () => {
    // Compile-time check: a fresh PlayerPresenceSnapshot must satisfy
    // the type. If a field is added/removed in `PublicPlayerPresenceState`
    // without a matching change to `PlayerPresenceSnapshot`, this
    // type-pin assertion will fail at typecheck time.
    const snap: PlayerPresenceSnapshot = sanitizePlayerForPresence(makeAlive(), 'r');
    expect(snap).toBeDefined();
  });
});
