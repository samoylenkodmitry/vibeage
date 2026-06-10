import type {
  EnemyEntity,
  GameClientState,
  GroundLootStack,
  PlayerEntity,
  ServerGameState,
} from './gameTypes';
import { normalizeClientStarterProgress } from './starterProgress';
import { normalizeVec3 } from './vec3';

export function applyGameStateSnapshot(state: GameClientState, serverState: ServerGameState): GameClientState {
  const players = healDegradedSelfSnapshot(state, serverState.players ?? {});
  const enemies = serverState.enemies ?? {};
  const selectedTargetId = enemies[state.selectedTargetId ?? ''] ? state.selectedTargetId : null;
  const inventory = state.myPlayerId ? players[state.myPlayerId]?.inventory ?? state.inventory : state.inventory;
  const maxInventorySlots = state.myPlayerId
    ? players[state.myPlayerId]?.maxInventorySlots ?? state.maxInventorySlots
    : state.maxInventorySlots;
  const groundLoot = normalizeGroundLoot(serverState.groundLoot ?? state.groundLoot);
  const activePhysicsFields = serverState.activePhysicsFields ?? state.activePhysicsFields;
  const myPlayer = state.myPlayerId ? players[state.myPlayerId] : null;
  const starterProgress = myPlayer
    ? normalizeClientStarterProgress(myPlayer.starterProgress ?? state.starterProgress, myPlayer)
    : state.starterProgress;
  const streamedRegionIds = deriveStreamedRegionIds(serverState, players, enemies);

  return {
    ...state,
    players,
    enemies,
    groundLoot,
    activePhysicsFields,
    selectedTargetId,
    inventory,
    maxInventorySlots,
    starterProgress,
    streamedRegionIds,
  };
}

/**
 * During a relogin race the server can briefly snapshot YOUR OWN player
 * through the public-player filter (self is matched by socketId in
 * makeClientPlayersSnapshot; a lingering zombie session still owns the player
 * until the takeover lands), so owner-only fields — unlockedSkills,
 * skillLevels, inventory, questState, … — vanish from one snapshot. That
 * crashed the whole client (unlockedSkills.length in starterProgress, plus
 * every HUD panel that reads owner fields). Heal it: keep the incoming public
 * fields (position/health/etc. are fresh) and fill the missing owner-only
 * fields from the previous snapshot of self; the next owner-shaped snapshot
 * overwrites everything anyway.
 */
function healDegradedSelfSnapshot(
  state: GameClientState,
  players: Record<string, PlayerEntity>,
): Record<string, PlayerEntity> {
  const id = state.myPlayerId;
  if (!id) return players;
  const incoming = players[id];
  if (!incoming || incoming.unlockedSkills !== undefined) return players;
  // Defaults under previous under incoming: the race can hit the very FIRST
  // gameState after welcome (no previous self), so the required owner-only
  // fields still get safe values instead of undefined — HUD/XP/skill
  // consumers can't crash while waiting for the owner-shaped snapshot.
  const defaults: Pick<
    PlayerEntity,
    'unlockedSkills' | 'availableSkillPoints' | 'experience' | 'experienceToNextLevel' | 'skillCooldownEndTs' | 'castingSkill' | 'castingProgressMs'
  > = {
    unlockedSkills: [],
    availableSkillPoints: 0,
    experience: 0,
    experienceToNextLevel: 100,
    skillCooldownEndTs: {},
    castingSkill: null,
    castingProgressMs: 0,
  };
  return { ...players, [id]: { ...defaults, ...state.players[id], ...incoming } };
}

function deriveStreamedRegionIds(
  serverState: ServerGameState,
  players: Record<string, PlayerEntity>,
  enemies: Record<string, EnemyEntity>,
): string[] {
  const regionIds = new Set<string>();

  for (const playerId of Object.keys(players)) {
    const regionId = serverState.zones?.playerZoneIds?.[playerId];
    if (regionId) {
      regionIds.add(regionId);
    }
  }

  for (const enemyId of Object.keys(enemies)) {
    const regionId = serverState.zones?.enemyZoneIds?.[enemyId];
    if (regionId) {
      regionIds.add(regionId);
    }
  }

  return [...regionIds].sort();
}

function normalizeGroundLoot(
  groundLoot: ServerGameState['groundLoot'] | Record<string, GroundLootStack>,
): Record<string, GroundLootStack> {
  return Object.fromEntries(
    Object.entries(groundLoot ?? {}).map(([id, loot]) => [
      id,
      {
        id,
        position: normalizeVec3(loot.position),
        items: loot.items,
      },
    ]),
  );
}
