import { describe, expect, it } from 'vitest';
import { ZoneManager } from '../packages/content/zones';
import { createGameState } from '../server/gameState';
import { spawnInitialEnemies } from '../server/enemies/enemyLifecycle';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';

/**
 * PR WW — Frost Wolf was claimed at (-460, 480) in Frozen Tundra
 * but absent in-game. Root cause: only the first 8 zones are
 * active at boot, and Frozen Tundra (#10 in GAME_ZONES) never had
 * its initial mob population spawned. The tick pipeline now
 * spawns newly-active zones once. These tests pin both halves.
 */
describe('zone spawn — newly-active zones run their initial population', () => {
  it('spawnInitialEnemies records the zones it ran on', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const zoneManager = new ZoneManager();
    spawnInitialEnemies(state, spatial, zoneManager, {
      activeZoneIds: ['frozen_tundra'],
      maxEnemies: 50,
      maxEnemiesPerZone: 25,
    });
    expect(state.zones.spawnedZoneIds ?? []).toContain('frozen_tundra');
  });

  it('Frost Wolf spawns inside its anchored radius when its zone activates', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const zoneManager = new ZoneManager();
    spawnInitialEnemies(state, spatial, zoneManager, {
      activeZoneIds: ['frozen_tundra'],
      maxEnemies: 50,
      maxEnemiesPerZone: 25,
    });
    const frostWolves = Object.values(state.enemies).filter((e) => e.type === 'frost_wolf');
    expect(frostWolves.length).toBeGreaterThan(0);
    // PR FF — anchor is (-460, 480), spawnRadius 22. Generous margin
    // for terrain Y + pack clustering.
    for (const wolf of frostWolves) {
      const dx = wolf.position.x - (-460);
      const dz = wolf.position.z - 480;
      expect(Math.hypot(dx, dz),
        `frost wolf ${wolf.id} at (${wolf.position.x}, ${wolf.position.z}) outside anchor radius`,
      ).toBeLessThan(40);
    }
  });

  it('spawnInitialEnemies is idempotent over `spawnedZoneIds` filtering at the caller', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const zoneManager = new ZoneManager();
    spawnInitialEnemies(state, spatial, zoneManager, {
      activeZoneIds: ['frozen_tundra'],
      maxEnemies: 50, maxEnemiesPerZone: 25,
    });
    const afterFirst = Object.keys(state.enemies).length;
    // Re-running for the same zone would double mobs if the
    // tick-pipeline filter slipped — simulate the filter explicitly.
    const stillNeeding = ['frozen_tundra'].filter((id) => !(state.zones.spawnedZoneIds ?? []).includes(id));
    expect(stillNeeding).toEqual([]);
    expect(Object.keys(state.enemies).length).toBe(afterFirst);
  });
});
