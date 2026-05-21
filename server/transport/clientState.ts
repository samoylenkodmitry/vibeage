import type { GameState } from '../gameState.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import type { PlayerUpdate } from './outboundEvents.js';
import type { EquipmentEntry, InventorySlot } from '../../packages/protocol/messages.js';
import {
  getEnemiesInActiveRegions,
  getEntityRegionId,
  getPlayerStreamRegionIds,
  getPositionRegionId,
  type ServerWorldRegion,
} from '../world/regions.js';

/**
 * §46/slice-4 — explicit allowlist of fields shipped to *other*
 * clients on the `playerJoined` / `playerUpdated` / `gameState`
 * paths. Was a denylist (every new field on `PlayerState` was
 * public unless someone remembered to add it to the deny list);
 * allowlist closes that footgun: a new field on PlayerState is
 * now private by default unless it's added here.
 *
 * Owner-only data (socketId, inventory, characterInventory,
 * questState, gold, skillShortcuts, skillLevels,
 * availableSkillPoints, starterProgress, stats, skill cooldowns,
 * regen bookkeeping, persistence flags) is *not* listed below
 * and therefore never reaches another player's client.
 */
export const PUBLIC_PLAYER_FIELDS = [
  'id',
  'name',
  'className',
  'race',
  'specializationId',
  'level',
  'position',
  'rotation',
  'velocity',
  'movement',
  'health',
  'maxHealth',
  'mana',
  'maxMana',
  'isAlive',
  'deathTimeTs',
  'castingSkill',
  'castingProgressMs',
  'targetId',
  'statusEffects',
  'dirtySnap',
  // §45.7 — denylist used to keep the wire-shape `inventory`
  // mirror but blank to other players. Removed entirely now;
  // PublicPlayerSnapshot has no inventory field at all.
] as const satisfies ReadonlyArray<keyof PlayerState>;
export const CLIENT_GAME_STATE_FIELDS = [
  'players',
  'enemies',
  'groundLoot',
  'zones',
] as const satisfies ReadonlyArray<keyof GameState>;

type PublicPlayerField = typeof PUBLIC_PLAYER_FIELDS[number];

/**
 * Owner-only fields (everything on PlayerState that isn't in the
 * public allowlist). Re-exported as a denylist so legacy callers /
 * tests built against the prior denylist API keep working. The
 * allowlist is the source of truth — this list is computed in a
 * sibling helper to avoid two registries drifting.
 */
// §52 #2 — `inventory` dropped from this list along with the
// PlayerState field. The wire-only `PlayerUpdate.inventory` projection
// is sanitised separately by the public/owner sanitisers.
export const PRIVATE_PLAYER_STATE_FIELDS = [
  'socketId',
  'unlockedSkills',
  'skillShortcuts',
  'availableSkillPoints',
  'skillLevels',
  'starterProgress',
  'questState',
  'skillCooldownEndTs',
  'lastRegenTimeMs',
  'experience',
  'experienceToNextLevel',
  'lastUpdateTime',
  'lastSnapTime',
  'posHistory',
  'usedResurrectionThisLife',
  'stats',
  'maxInventorySlots',
  'characterInventory',
  'gold',
] as const satisfies ReadonlyArray<keyof PlayerState>;
/**
 * §46/slice-4 — projected DTO shipped to other clients. Built from
 * `PUBLIC_PLAYER_FIELDS` (allowlist) so the type itself documents
 * what crosses the public boundary; adding a new sensitive field
 * to `PlayerState` no longer requires updating a deny list.
 */
export type PublicPlayerSnapshot = Pick<PlayerState, PublicPlayerField>;
// §52 #3 — the snapshot now ships an `OwnerPlayerSnapshot` for the
// requesting socket (was the raw `PlayerState`). Other players still
// come through as `PublicPlayerSnapshot`.
type ClientPlayerState = OwnerPlayerSnapshot | PublicPlayerSnapshot;

/**
 * §52 #3 / §5 — explicit allowlist of fields shipped to the *owner*
 * of the player (the player on its own client). Wider than
 * `PUBLIC_PLAYER_FIELDS` (carries progression, gold, skill state,
 * stats, quest state) but narrower than the full `PlayerState`
 * (excludes purely server-side bookkeeping like `posHistory`,
 * `lastRegenTimeMs`, `socketId`, `characterInventory`).
 *
 * Owner inventory + equipment ride their own DTOs
 * (`InventoryUpdate`, `EquipmentUpdate`) so they're not duplicated
 * inside `OwnerPlayerSnapshot`. `OwnerInventorySnapshot` and
 * `OwnerEquipmentSnapshot` below carve the same shapes out of
 * the wire messages for explicit consumer typing.
 */
export const OWNER_PLAYER_FIELDS = [
  ...PUBLIC_PLAYER_FIELDS,
  'experience',
  'experienceToNextLevel',
  'unlockedSkills',
  'skillShortcuts',
  'availableSkillPoints',
  'skillLevels',
  'starterProgress',
  'questState',
  'skillCooldownEndTs',
  'stats',
  'gold',
  'maxInventorySlots',
] as const satisfies ReadonlyArray<keyof PlayerState>;
type OwnerPlayerField = typeof OWNER_PLAYER_FIELDS[number];

/**
 * §52 #3 / §5 — projected DTO the owning client sees. Built from
 * `OWNER_PLAYER_FIELDS` so adding a new server-only field to
 * `PlayerState` defaults to NOT crossing the owner boundary;
 * adding it to the owner snapshot requires an explicit edit here.
 */
export type OwnerPlayerSnapshot = Pick<PlayerState, OwnerPlayerField>;

/**
 * §52 #3 / §5 — public world-presence DTO. Matches the live shape
 * of `PublicPlayerPresenceState` (`server/transport/worldStateSchema.ts`);
 * defining it here so other consumers (tests, observability dashboards,
 * presence-list panels) can type-pin the shape without depending on the
 * Colyseus Schema class.
 *
 * Narrower than `PublicPlayerSnapshot`: no position, velocity, health,
 * status effects, or cast state. Used for the world-wide presence map
 * that flows alongside `VibeAgePublicState` regardless of region scope.
 */
export type PlayerPresenceSnapshot = {
  id: string;
  name: string;
  className: string;
  level: number;
  isAlive: boolean;
  /** Empty string when the player is not currently in any zone. */
  regionId: string;
};

/**
 * §52 #3 — project a `PlayerState` onto the presence shape. The
 * `PublicPlayerPresenceState` Schema fills the same fields from the
 * same source; this helper makes the projection callable from plain
 * TS too (without instantiating a Colyseus Schema), which the tests
 * + future REST/health endpoints exercise.
 */
export function sanitizePlayerForPresence(
  player: PlayerState,
  regionId: string = '',
): PlayerPresenceSnapshot {
  return {
    id: player.id,
    name: player.name,
    className: player.className,
    level: player.level,
    isAlive: player.isAlive,
    regionId,
  };
}

/**
 * Owner-bound bag snapshot. Equivalent to the existing
 * `InventoryUpdate` wire payload minus the `type` literal so a
 * consumer that wants the shape on its own can type-pin it
 * without the discriminant.
 */
export type OwnerInventorySnapshot = {
  playerId?: string;
  inventory: InventorySlot[];
  maxInventorySlots: number;
};

/**
 * Owner-bound equipment snapshot. Same relationship to
 * `EquipmentUpdate` as `OwnerInventorySnapshot` has to
 * `InventoryUpdate`.
 */
export type OwnerEquipmentSnapshot = {
  equipment: EquipmentEntry[];
};

// §52 #3 — projects a full PlayerState onto the owner snapshot.
// Matches the shape of `sanitizePlayerForPublic` but uses the
// wider OWNER_PLAYER_FIELDS allowlist.
export function sanitizePlayerForOwner(player: PlayerState): OwnerPlayerSnapshot {
  return pickOwnerFields(player) as OwnerPlayerSnapshot;
}

function pickOwnerFields<T extends Partial<PlayerState>>(source: T): Partial<OwnerPlayerSnapshot> {
  const projected: Partial<OwnerPlayerSnapshot> = {};
  for (const field of OWNER_PLAYER_FIELDS) {
    if (field in source && source[field] !== undefined) {
      (projected as Record<string, unknown>)[field] = source[field as keyof T] as unknown;
    }
  }
  return projected;
}
export type ClientGameStateSnapshot = Pick<GameState, 'enemies' | 'groundLoot' | 'zones'> & {
  players: Record<string, ClientPlayerState>;
};

export function makeClientGameStateSnapshot(
  state: GameState,
  socketId: string,
  regions?: readonly ServerWorldRegion[],
): ClientGameStateSnapshot {
  const visibleRegionIds = regions ? getPlayerStreamRegionIds(state, regions, socketId) : null;
  const players = makeClientPlayersSnapshot(state, socketId, regions, visibleRegionIds);
  const enemies = makeClientEnemiesSnapshot(state, regions, visibleRegionIds);
  const groundLoot = makeClientGroundLootSnapshot(state, regions, visibleRegionIds);

  return {
    players,
    enemies,
    groundLoot,
    zones: makeClientZonesSnapshot(state, players, enemies),
  };
}

// §46/slice-4 — projects every PlayerState onto `PublicPlayerSnapshot`
// (allowlist of fields). Adding a new field to PlayerState defaults
// to private; opt in by adding the key to `PUBLIC_PLAYER_FIELDS`.
export function sanitizePlayerForPublic(player: PlayerState): PublicPlayerSnapshot {
  // Cast: a full PlayerState always carries every PUBLIC_PLAYER_FIELDS
  // entry; the partial projector returns `Partial<...>` for the shared
  // update path, but the full-projection case here gives back the full
  // shape — pin it with the cast rather than a runtime assert that'd
  // crash the room loop.
  return pickPublicFields(player) as PublicPlayerSnapshot;
}

// PlayerUpdate is a partial; project the same allowlist so deltas
// stay equally guarded. Fields the update doesn't carry stay absent.
export function sanitizePlayerUpdateForPublic(update: PlayerUpdate): Partial<PublicPlayerSnapshot> {
  return pickPublicFields(update);
}

function pickPublicFields<T extends Partial<PlayerState>>(source: T): Partial<PublicPlayerSnapshot> {
  const projected: Partial<PublicPlayerSnapshot> = {};
  for (const field of PUBLIC_PLAYER_FIELDS) {
    if (field in source && source[field] !== undefined) {
      // Cast-through-any: PUBLIC_PLAYER_FIELDS is itself typed against
      // PlayerState, so the runtime read is safe even when T narrows.
      (projected as Record<string, unknown>)[field] = source[field as keyof T] as unknown;
    }
  }
  return projected;
}

function makeClientPlayersSnapshot(
  state: GameState,
  socketId: string,
  regions: readonly ServerWorldRegion[] | undefined,
  visibleRegionIds: ReadonlySet<string> | null,
): ClientGameStateSnapshot['players'] {
  return Object.fromEntries(
    Object.entries(state.players)
      .filter(([playerId, player]) => player.socketId === socketId || isEntityInScope(state, regions, visibleRegionIds, playerId))
      .map(([playerId, player]) => [
        playerId,
        // §52 #3 — the owner now sees a projected DTO too (was the raw
        // PlayerState before). The allowlist in OWNER_PLAYER_FIELDS
        // excludes server-only bookkeeping (posHistory, lastRegenTimeMs,
        // characterInventory aggregate, etc.) so a new server-only
        // field defaults to NOT leaking to the wire.
        player.socketId === socketId ? sanitizePlayerForOwner(player) : sanitizePlayerForPublic(player),
      ]),
  ) as ClientGameStateSnapshot['players'];
}

function makeClientEnemiesSnapshot(
  state: GameState,
  regions: readonly ServerWorldRegion[] | undefined,
  visibleRegionIds: ReadonlySet<string> | null,
): GameState['enemies'] {
  if (!regions || !visibleRegionIds) {
    return getEnemiesInActiveRegions(state);
  }

  return Object.fromEntries(
    Object.entries(state.enemies).filter(([enemyId]) => isEntityInScope(state, regions, visibleRegionIds, enemyId)),
  );
}

function makeClientGroundLootSnapshot(
  state: GameState,
  regions: readonly ServerWorldRegion[] | undefined,
  visibleRegionIds: ReadonlySet<string> | null,
): GameState['groundLoot'] {
  if (!regions || !visibleRegionIds) {
    return state.groundLoot;
  }

  return Object.fromEntries(
    Object.entries(state.groundLoot).filter(([, loot]) => isRegionInScope(
      getPositionRegionId(regions, loot.position),
      visibleRegionIds,
    )),
  );
}

function makeClientZonesSnapshot(
  state: GameState,
  players: ClientGameStateSnapshot['players'],
  enemies: GameState['enemies'],
): GameState['zones'] {
  const playerIds = new Set(Object.keys(players));
  const enemyIds = new Set(Object.keys(enemies));

  return {
    activeZoneIds: state.zones.activeZoneIds,
    // PR WW — spawnedZoneIds is server-only bookkeeping; the client
    // never needs to know which zones have been initial-spawned, so
    // an empty list is the right wire shape.
    spawnedZoneIds: [],
    playerZoneIds: Object.fromEntries(
      Object.entries(state.zones.playerZoneIds).filter(([playerId]) => playerIds.has(playerId)),
    ),
    enemyZoneIds: Object.fromEntries(
      Object.entries(state.zones.enemyZoneIds).filter(([enemyId]) => enemyIds.has(enemyId)),
    ),
  };
}

function isEntityInScope(
  state: GameState,
  regions: readonly ServerWorldRegion[] | undefined,
  visibleRegionIds: ReadonlySet<string> | null,
  entityId: string,
): boolean {
  if (!regions || !visibleRegionIds) {
    return true;
  }

  return isRegionInScope(getEntityRegionId(state, regions, entityId), visibleRegionIds);
}

function isRegionInScope(regionId: string | undefined, visibleRegionIds: ReadonlySet<string>): boolean {
  return Boolean(regionId && visibleRegionIds.has(regionId));
}
