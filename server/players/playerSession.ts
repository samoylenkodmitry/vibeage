import type { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import type { GameState } from '../gameState.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import { CLASS_SKILL_TREES, type CharacterClass } from '../../packages/content/classes.js';
import { UNIVERSAL_SKILLS } from '../../packages/content/skills.js';
import {
  CHARACTER_RACES,
  DEFAULT_RACE,
  isClassAllowedForRace,
  RACE_PROFILES,
  type CharacterRace,
} from '../../packages/content/races.js';
import { normalizeStarterProgressState, type InventorySlot } from '../../packages/protocol/messages.js';
import { isPersistenceDisabled, persistPlayer, recordServerEvent, upsertPlayerSession } from '../persistence.js';
import { createTransientPlayer } from '../playerFactory.js';
import {
  getExperienceToNextLevel,
  normalizePlayerLevel,
  normalizeAvailableSkillPoints,
  numberOrFallback,
  normalizeSkillShortcuts,
  normalizeUnlockedSkills,
} from './playerProgression.js';
import { recomputePlayerStats } from './playerStatsRefresh.js';
import { applyStarterLoadout } from '../inventory/starterLoadout.js';
import { hydratePersistedCharacterInventory } from '../inventory/aggregateBridge.js';
import { forgetSocketRateLimits } from '../world/rateLimiter.js';
import { forgetMovementFreshness } from '../movement/staleIntentTracker.js';
import { starterSkillsFor } from './playerProgression.js';
import { CLASS_AUTO_PASSIVE_SKILL } from '../../packages/content/classPassives.js';

type PlayerRow = {
  id: string;
  position_x?: unknown;
  position_y?: unknown;
  position_z?: unknown;
  health?: unknown;
  mana?: unknown;
  level?: unknown;
  xp?: unknown;
  experience?: unknown;
  gold?: unknown;
  is_alive?: boolean | null;
  class_name?: unknown;
  skills?: unknown;
  skill_shortcuts?: unknown;
  available_skill_points?: unknown;
  starter_progress?: unknown;
  inventory?: InventorySlot[];
  character_inventory?: unknown;
  race?: unknown;
  specialization_id?: unknown;
  skill_levels?: unknown;
  quest_state?: unknown;
};

function normalizeSpecializationId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizeQuestState(value: unknown): { active: Record<string, { stageIndex: number; progress: number; readyToClaim?: boolean }>; completed: string[] } {
  const empty = { active: {} as Record<string, { stageIndex: number; progress: number; readyToClaim?: boolean }>, completed: [] as string[] };
  if (!value || typeof value !== 'object') return empty;
  const obj = value as { active?: unknown; completed?: unknown };
  if (obj.active && typeof obj.active === 'object') {
    for (const [qid, entry] of Object.entries(obj.active as Record<string, unknown>)) {
      if (entry && typeof entry === 'object') {
        const e = entry as { stageIndex?: unknown; progress?: unknown; readyToClaim?: unknown };
        empty.active[qid] = {
          stageIndex: Math.max(0, Math.floor(Number(e.stageIndex) || 0)),
          progress: Math.max(0, Math.floor(Number(e.progress) || 0)),
          readyToClaim: Boolean(e.readyToClaim),
        };
      }
    }
  }
  if (Array.isArray(obj.completed)) {
    empty.completed = obj.completed.filter((id): id is string => typeof id === 'string');
  }
  return empty;
}

function normalizeSkillLevels(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [skillId, level] of Object.entries(value as Record<string, unknown>)) {
    const n = typeof level === 'number' ? level : Number(level);
    if (Number.isFinite(n) && n >= 1) {
      out[skillId] = Math.floor(n);
    }
  }
  return out;
}

function normalizeClassName(value: unknown): CharacterClass {
  if (value === 'warrior' || value === 'healer' || value === 'ranger'
    || value === 'knight' || value === 'paladin' || value === 'rogue') {
    return value;
  }
  return 'mage';
}

function normalizeRace(value: unknown): CharacterRace {
  if (typeof value === 'string' && CHARACTER_RACES.includes(value as CharacterRace)) {
    return value as CharacterRace;
  }
  return DEFAULT_RACE;
}

function snapClassToRace(className: CharacterClass, race: CharacterRace): CharacterClass {
  if (isClassAllowedForRace(race, className)) return className;
  return RACE_PROFILES[race]?.allowedClasses[0] ?? className;
}

export function upsertActivePlayerSession(state: GameState, spatial: SpatialHashGrid, player: PlayerState): PlayerState {
  const existing = state.players[player.id];
  if (existing) {
    existing.socketId = player.socketId;
    existing.name = player.name;
    return existing;
  }

  state.players[player.id] = player;
  spatial.insert(player.id, { x: player.position.x, z: player.position.z });
  return player;
}

export function findPlayerIdBySocket(state: GameState, socketId: string): string | undefined {
  return Object.keys(state.players).find(id => state.players[id].socketId === socketId);
}

export function hydratePersistedPlayer(row: PlayerRow, socketId: string, name: string): PlayerState {
  const level = normalizePlayerLevel(row.level);
  const race = normalizeRace(row.race);
  // Race -> class gate is enforced at hydrate too: a legacy persisted
  // (human + warrior) record from before the gate landed gets snapped
  // to the first allowed class for that race, so the player can play
  // again rather than getting wedged into a class they can never cast.
  const className = snapClassToRace(normalizeClassName(row.class_name), race);
  const unlockedSkills = normalizeUnlockedSkills(row.skills, className);
  const starterProgress = normalizeStarterProgressState(row.starter_progress, {
    levelReached: level,
    learnedSkills: unlockedSkills.length,
  });

  const player: PlayerState = {
    id: row.id,
    socketId,
    name,
    position: {
      x: numberOrFallback(row.position_x, 0),
      y: numberOrFallback(row.position_y, 0.5),
      z: numberOrFallback(row.position_z, 0),
    },
    rotation: { x: 0, y: 0, z: 0 },
    // PR NN — vitals seeded with placeholders; recomputePlayerStats
    // below derives the real maxes from contributions, then we clamp
    // the persisted current health/mana into the new range.
    health: numberOrFallback(row.health, 1),
    maxHealth: 1,
    mana: numberOrFallback(row.mana, 1),
    maxMana: 1,
    level,
    experience: numberOrFallback(row.experience ?? row.xp, 0),
    experienceToNextLevel: getExperienceToNextLevel(level),
    gold: numberOrFallback(row.gold, 0),
    statusEffects: [],
    skillCooldownEndTs: {},
    castingSkill: null,
    castingProgressMs: 0,
    isAlive: row.is_alive !== undefined ? row.is_alive : true,
    className,
    race,
    unlockedSkills,
    skillShortcuts: normalizeSkillShortcuts(row.skill_shortcuts, unlockedSkills),
    availableSkillPoints: normalizeAvailableSkillPoints(row.available_skill_points),
    starterProgress,
    posHistory: [],
    lastUpdateTime: Date.now(),
    inventory: row.inventory || [],
    maxInventorySlots: 20,
    specializationId: normalizeSpecializationId(row.specialization_id),
    skillLevels: normalizeSkillLevels(row.skill_levels),
    questState: normalizeQuestState(row.quest_state),
  };
  // Restore the persisted CharacterInventory aggregate (item instances +
  // equipment slots + occupancy). Without this, equipped gear silently
  // disappears on the next session because the legacy `inventory` jsonb
  // only carries the flat bag-slot view.
  hydratePersistedCharacterInventory(player, row.character_inventory);
  // Fresh persisted accounts (level 1, empty inventory) get the starter
  // loadout so they see the new equipment system immediately.
  if (
    player.level === 1
    && player.inventory.length === 0
    && !player.characterInventory
  ) {
    applyStarterLoadout(player);
  }
  // PR NN — single stat-compute entrypoint. Builds the contributions
  // list from the now-restored race / class / level / equipment and
  // writes player.stats / max{Health,Mana}.
  recomputePlayerStats(player);
  // Legacy rows persisted before vitals existed default health/mana
  // to the *new* maxes after the recompute. Pre-recompute we couldn't
  // do this because the maxes were unknown.
  if (row.health === undefined || row.health === null) player.health = player.maxHealth;
  if (row.mana === undefined || row.mana === null) player.mana = player.maxMana;
  if (player.health > player.maxHealth) player.health = player.maxHealth;
  if (player.mana > player.maxMana) player.mana = player.maxMana;
  // Retroactive starter-skill backfill: a player who switched class
  // BEFORE slice #20's ensureClassHasStarterSkill fix shipped will have
  // className='warrior' but unlockedSkills=['fireball'] — they can't
  // learn any warrior skill (prereqs reference slash, which they don't
  // own). Re-run the same predicate on hydrate so persisted players
  // get unstuck on next login.
  ensureClassStarterUnlocked(player);
  return player;
}

function ensureClassStarterUnlocked(player: PlayerState): void {
  const starters = starterSkillsFor(player.className);
  const [starter] = starters;
  if (!starter) return;
  // Drop carried-over skills that don't belong to the current class
  // tree. A legacy warrior persisted with skills=['fireball'] would
  // otherwise become ['fireball','slash'] after the starter push,
  // letting them cast a mage skill they should never have had — and
  // applyClassChange's refundable count (unlockedSkills.length - 1)
  // would refund a skill point for that invalid mage skill on the
  // next class change.
  const tree = CLASS_SKILL_TREES[player.className];
  const treeSkills = new Set<string>(tree ? Object.keys(tree.skillProgression) : [starter]);
  for (const skill of UNIVERSAL_SKILLS) treeSkills.add(skill);
  // PR PP — the auto-granted class passive isn't in the tree but is
  // legal to own. Keep it through the filter so a hydrated player
  // doesn't lose their class HP/MP/dmg/speed deltas.
  const autoPassive = CLASS_AUTO_PASSIVE_SKILL[player.className];
  if (autoPassive) treeSkills.add(autoPassive);
  player.unlockedSkills = player.unlockedSkills.filter((skill) => treeSkills.has(skill));
  for (const required of starters) {
    if (!player.unlockedSkills.includes(required)) {
      player.unlockedSkills.push(required);
    }
  }
  // Same prune on shortcuts: drop slots referencing skills no longer
  // unlocked, then bind the starter into the first empty slot.
  player.skillShortcuts = player.skillShortcuts.map((skill) =>
    skill && player.unlockedSkills.includes(skill) ? skill : null,
  );
  if (!player.skillShortcuts.includes(starter)) {
    const emptySlotIndex = player.skillShortcuts.findIndex((slot) => slot === null);
    if (emptySlotIndex !== -1) {
      player.skillShortcuts[emptySlotIndex] = starter;
    }
  }
}

export type AddPlayerSessionOptions = {
  /**
   * Race + class picked in the lobby's character-creation flow.
   * Only honoured when this is the FIRST session for `name` —
   * existing characters preserve their persisted identity. Falls
   * back to defaults (race='human', className='mage') when omitted.
   */
  initialRace?: string;
  initialClass?: string;
  /** Authenticated account id (PR I); scopes the player lookup. */
  accountId?: string;
};

export class CharacterNotFoundError extends Error {
  constructor(public readonly name: string) {
    super(`Character ${name} not found for account`);
  }
}

function applyInitialIdentity(
  player: PlayerState,
  options: AddPlayerSessionOptions,
): PlayerState {
  if (options.initialRace
    && CHARACTER_RACES.includes(options.initialRace as CharacterRace)) {
    player.race = options.initialRace as CharacterRace;
  }
  const race = (player.race ?? DEFAULT_RACE) as CharacterRace;
  if (options.initialClass) {
    const candidate = normalizeClassName(options.initialClass);
    if (isClassAllowedForRace(race, candidate)) {
      player.className = candidate;
      // resetSkillsForClassChange would belong here but it lives in
      // playerIdentity.ts; refreshing skills happens through the
      // normal createTransientPlayer / starterSkillsFor path below
      // when the factory builds the player. For now snap the class
      // and let the existing class-switch tests prove the rest.
      const starters = starterSkillsFor(candidate);
      player.unlockedSkills = [...starters];
      player.skillShortcuts = normalizeSkillShortcuts(undefined, starters);
    }
  }
  return player;
}

export async function addPlayerSession(
  state: GameState,
  spatial: SpatialHashGrid,
  socketId: string,
  name: string,
  options: AddPlayerSessionOptions = {},
): Promise<PlayerState> {
  const addTransientPlayer = () => upsertActivePlayerSession(
    state,
    spatial,
    applyInitialIdentity(createTransientPlayer(socketId, name), options),
  );

  if (isPersistenceDisabled()) {
    return addTransientPlayer();
  }

  try {
    const row = await upsertPlayerSession(socketId, name, options.accountId);
    if (!row) {
      // Account-scoped lookup found no matching character; reject the
      // join. The lobby should have already created the character via
      // /api/account/characters before pointing the player here.
      throw new CharacterNotFoundError(name);
    }

    await recordServerEvent('player_login', row.id, { playerName: name, socketId });

    // If the row is brand new (no class_name yet), apply the lobby
    // picks before inserting into the active state. Existing players
    // preserve their persisted identity.
    const isNewCharacter = !row.class_name || row.class_name === '';
    const hydrated = hydratePersistedPlayer(row, socketId, name);
    return upsertActivePlayerSession(
      state,
      spatial,
      isNewCharacter ? applyInitialIdentity(hydrated, options) : hydrated,
    );
  } catch (error) {
    if (error instanceof CharacterNotFoundError) {
      throw error;
    }
    console.error('Error adding player to database:', error);
    return addTransientPlayer();
  }
}

export async function removePlayerSessionBySocketId(
  state: GameState,
  spatial: SpatialHashGrid,
  socketId: string,
): Promise<string | null> {
  forgetSocketRateLimits(socketId);
  forgetMovementFreshness(socketId);
  const playerId = findPlayerIdBySocket(state, socketId);
  if (!playerId) {
    return null;
  }

  const player = state.players[playerId];
  const pos = { x: player.position.x, z: player.position.z };

  await recordServerEvent('player_disconnect', playerId, { playerName: player.name, socketId });

  try {
    await persistPlayer(player);
  } catch (error) {
    console.error(`Failed to persist player ${playerId} on disconnect:`, error);
  }

  spatial.remove(playerId, pos);
  delete state.players[playerId];

  return playerId;
}

export async function persistActivePlayers(state: GameState): Promise<void> {
  const results = await Promise.allSettled(
    Object.values(state.players).map(player => persistPlayer(player)),
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Failed to persist active player:', result.reason);
    }
  }
}
