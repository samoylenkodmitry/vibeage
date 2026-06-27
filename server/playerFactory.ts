import { QUEST_NPCS } from '../packages/content/npcs.js';
import { DEFAULT_RACE } from '../packages/content/races.js';
import { createEmptyInventory } from '../packages/sim/characterInventory.js';
import { hash } from '../packages/sim/combatMath.js';
import { PlayerState } from '../packages/sim/entities.js';
import { recomputePlayerStats } from './players/playerStatsRefresh.js';
import { applyStarterLoadout } from './inventory/starterLoadout.js';
import {
  DEFAULT_AVAILABLE_SKILL_POINTS,
  starterSkillsFor,
} from './players/playerProgression.js';
import { UNIVERSAL_SKILLS } from '../packages/content/skills.js';
import { createInitialPlayerStarterProgress } from './progression/starterPath.js';

const PLAYER_INVENTORY_LIMITS = {
  baseSlots: 20,
  bonusSlots: 0,
  maxWeight: 80_000,
};

// §49/M2 — face the starter NPC (Warden Galen) on spawn so a new
// player sees a quest-giver immediately instead of staring at a
// random horizon. Yaw is computed once at module load from the
// authored NPC position; if Galen moves, the yaw follows.
const STARTER_SPAWN_POSITION = { x: 0, y: 0.5, z: 0 };
const STARTER_FACE_NPC_ID = 'warden_galen';
const STARTER_SPAWN_YAW = (() => {
  const npc = QUEST_NPCS[STARTER_FACE_NPC_ID];
  if (!npc) return 0;
  const dx = npc.position.x - STARTER_SPAWN_POSITION.x;
  const dz = npc.position.z - STARTER_SPAWN_POSITION.z;
  // Three.js convention: yaw of 0 looks along +Z; atan2(dx, dz)
  // gives the yaw that rotates +Z towards the (dx, dz) vector.
  return Math.atan2(dx, dz);
})();

export function createTransientPlayer(
  socketId: string,
  name: string,
  options: { guest?: boolean } = {},
): PlayerState {
  const playerId = `player-${hash(socketId + Date.now().toString())}`;
  // The Nameless guest is deliberately classless: it carries only the
  // universal kit (basic Attack + Escape), no class skills like fireball. It
  // can still fight — it just hasn't chosen a prophecy yet. Picking a class via
  // the in-world Awakening flow grants the real starter skills.
  const startingSkills = options.guest ? [...UNIVERSAL_SKILLS] : starterSkillsFor('mage');
  const player: PlayerState = {
    id: playerId,
    socketId,
    name,
    position: { ...STARTER_SPAWN_POSITION },
    rotation: { x: 0, y: STARTER_SPAWN_YAW, z: 0 },
    health: 1,
    maxHealth: 1,
    mana: 1,
    maxMana: 1,
    level: 1,
    experience: 0,
    experienceToNextLevel: 100,
    statusEffects: [],
    skillCooldownEndTs: {},
    castingSkill: null,
    castingProgressMs: 0,
    isAlive: true,
    className: 'mage',
    race: DEFAULT_RACE,
    unlockedSkills: startingSkills,
    availableSkillPoints: DEFAULT_AVAILABLE_SKILL_POINTS,
    starterProgress: createInitialPlayerStarterProgress({
      level: 1,
      unlockedSkills: startingSkills,
    }),
    specializationId: null,
    skillLevels: {},
    questState: { active: {}, completed: [] },
    posHistory: [],
    lastUpdateTime: Date.now(),
    maxInventorySlots: 20,
    characterInventory: createEmptyInventory(playerId, PLAYER_INVENTORY_LIMITS),
  };
  // Stocking the starter loadout populates the aggregate; the
  // snapshot boundary projects to the legacy slot view on the wire.
  applyStarterLoadout(player);
  // §45.3 — single source of stat computation. Reads contributions
  // from race / level / class / equipment and writes player.stats +
  // max{Health,Mana}; bottoms out the placeholder 1/1 vitals above.
  recomputePlayerStats(player);
  player.health = player.maxHealth;
  player.mana = player.maxMana;
  return player;
}
