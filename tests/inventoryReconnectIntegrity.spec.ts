import { describe, expect, it } from 'vitest';
import { createTransientPlayer } from '../server/playerFactory';
import { buildStablePlayerPersistenceData } from '../server/persistence';
import { hydratePersistedPlayer } from '../server/players/playerSession';

/**
 * ROADMAP — persistence integrity across reconnect.
 *
 * Coverage targets:
 *  - L446: equipped items survive disconnect/reconnect
 *  - L447: equipped items are not duplicated on reconnect
 *  - L448: bag order survives reconnect
 *  - L449: stack counts survive reconnect
 *
 * The persist → hydrate roundtrip is the production code path that
 * runs every time a player disconnects then comes back. Pin the
 * properties that matter for an MMORPG inventory: no item dupes
 * (exploit guard), slot order stable (UX), stack count preserved
 * (no silent loss / inflation).
 *
 * Existing handtestFixes.spec.ts covers the basic equipped-MAIN_HAND
 * roundtrip. This spec adds the duplication / ordering / stacking
 * guards that L447–L449 explicitly call out.
 */

function makePlayerWithBag() {
  const player = createTransientPlayer('s-original', 'tester');
  player.characterInventory = {
    characterId: player.id,
    items: {
      'inst-sword': {
        instanceId: 'inst-sword',
        ownerId: player.id,
        templateId: 'worn_sword',
        location: { kind: 'equipped' as const, slot: 'MAIN_HAND' as const },
        count: 1,
        enchantLevel: 0,
        bound: false,
        createdAtTs: 1_000,
      },
      'inst-potion-stack': {
        instanceId: 'inst-potion-stack',
        ownerId: player.id,
        templateId: 'health_potion',
        location: { kind: 'inventory' as const, slotIndex: 0 },
        count: 17,
        enchantLevel: 0,
        bound: false,
        createdAtTs: 2_000,
      },
      'inst-coin-stack': {
        instanceId: 'inst-coin-stack',
        ownerId: player.id,
        templateId: 'gold_coin',
        location: { kind: 'inventory' as const, slotIndex: 3 },
        count: 250,
        enchantLevel: 0,
        bound: false,
        createdAtTs: 3_000,
      },
    },
    equipment: { MAIN_HAND: 'inst-sword' },
    occupancy: {},
    limits: { baseSlots: 20, bonusSlots: 0, maxWeight: 80_000 },
  };
  return player;
}

function roundtrip(player: ReturnType<typeof makePlayerWithBag>) {
  const row = buildStablePlayerPersistenceData(player, 2_000);
  return hydratePersistedPlayer(
    { id: player.id, ...row },
    's-reconnect',
    player.name,
    Date.now(),
  );
}

describe('inventory reconnect integrity — survival + uniqueness', () => {
  it('equipped MAIN_HAND survives the persist → hydrate roundtrip', () => {
    const hydrated = roundtrip(makePlayerWithBag());
    expect(hydrated.characterInventory?.equipment.MAIN_HAND).toBe('inst-sword');
    expect(hydrated.characterInventory?.items['inst-sword']?.templateId).toBe('worn_sword');
  });

  it('equipped item is not duplicated into the bag on reconnect (no dupe-exploit vector)', () => {
    const hydrated = roundtrip(makePlayerWithBag());
    const sword = hydrated.characterInventory?.items['inst-sword'];
    // The single 'inst-sword' instance still lives at its equipped slot,
    // NOT in a bag slot. A bug that copied equipped items into bag slots
    // during hydration would either duplicate the instance or move it.
    expect(sword?.location.kind).toBe('equipped');
    if (sword?.location.kind === 'equipped') {
      expect(sword.location.slot).toBe('MAIN_HAND');
    }
    // And no second instance with a different id but same templateId
    // shows up in the bag (would indicate a hydration-side dupe).
    const swordInstances = Object.values(hydrated.characterInventory?.items ?? {})
      .filter((it) => it.templateId === 'worn_sword');
    expect(swordInstances).toHaveLength(1);
  });

  it('every persisted instanceId remains unique after hydration', () => {
    const hydrated = roundtrip(makePlayerWithBag());
    const ids = Object.keys(hydrated.characterInventory?.items ?? {});
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(['inst-coin-stack', 'inst-potion-stack', 'inst-sword']);
  });
});

describe('inventory reconnect integrity — bag order + stack counts', () => {
  it('bag slot indices are preserved across reconnect', () => {
    const hydrated = roundtrip(makePlayerWithBag());
    const potion = hydrated.characterInventory?.items['inst-potion-stack'];
    const coin = hydrated.characterInventory?.items['inst-coin-stack'];
    expect(potion?.location).toEqual({ kind: 'inventory', slotIndex: 0 });
    expect(coin?.location).toEqual({ kind: 'inventory', slotIndex: 3 });
  });

  it('stack counts are preserved across reconnect (no silent loss or inflation)', () => {
    const hydrated = roundtrip(makePlayerWithBag());
    expect(hydrated.characterInventory?.items['inst-potion-stack']?.count).toBe(17);
    expect(hydrated.characterInventory?.items['inst-coin-stack']?.count).toBe(250);
  });

  it('non-stackable equipped item keeps its count of 1 (sanity guard against stack inflation)', () => {
    const hydrated = roundtrip(makePlayerWithBag());
    expect(hydrated.characterInventory?.items['inst-sword']?.count).toBe(1);
  });
});

describe('inventory reconnect integrity — template + ownership identity', () => {
  it('templateId is preserved (the actual item stays the actual item)', () => {
    const hydrated = roundtrip(makePlayerWithBag());
    expect(hydrated.characterInventory?.items['inst-sword']?.templateId).toBe('worn_sword');
    expect(hydrated.characterInventory?.items['inst-potion-stack']?.templateId).toBe('health_potion');
  });

  it('ownerId is updated to the reconnected character id (no stale ownership)', () => {
    const original = makePlayerWithBag();
    const hydrated = roundtrip(original);
    // The ownerId on each item must point at the hydrated character id
    // (which equals the original.id since it round-trips through the
    // persisted row's `id` field, not the new socketId).
    for (const item of Object.values(hydrated.characterInventory?.items ?? {})) {
      expect(item.ownerId).toBe(hydrated.id);
    }
  });
});
