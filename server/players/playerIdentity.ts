import { CLASS_SKILL_TREES, type CharacterClass } from '../../packages/content/classes.js';
import { CHARACTER_RACES, type CharacterRace } from '../../packages/content/races.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import { refreshPlayerStatsFromEquipment } from '../inventory/equipHandlers.js';
import { log, LOG_CATEGORIES } from '../logger.js';
import { emitPlayerUpdated, type OutboundEventSink } from '../transport/outboundEvents.js';
import { starterSkillsFor } from './playerProgression.js';

const VALID_CLASSES: ReadonlySet<CharacterClass> = new Set(
  Object.keys(CLASS_SKILL_TREES) as CharacterClass[],
);

const VALID_RACES: ReadonlySet<CharacterRace> = new Set(CHARACTER_RACES);

export function applyClassChange(
  player: PlayerState,
  rawClassName: string,
  outbound: OutboundEventSink,
): boolean {
  if (!VALID_CLASSES.has(rawClassName as CharacterClass)) {
    return false;
  }
  const className = rawClassName as CharacterClass;
  if (player.className === className) {
    return false;
  }
  player.className = className;
  // refreshPlayerStatsFromEquipment also clamps health/mana to the new max
  // when the new class lowers them — see equipHandlers.ts.
  refreshPlayerStatsFromEquipment(player);
  ensureClassHasStarterSkill(player);
  log(LOG_CATEGORIES.PLAYER, `Player ${player.id} class -> ${className}`);
  emitPlayerUpdated(outbound, {
    id: player.id,
    className,
    maxHealth: player.maxHealth,
    maxMana: player.maxMana,
    health: player.health,
    mana: player.mana,
    unlockedSkills: player.unlockedSkills,
    skillShortcuts: player.skillShortcuts,
  });
  return true;
}

/**
 * When a player switches class, make sure they have at least one skill from
 * the new class's tree — otherwise their skill bar can be empty (or stuck on
 * a skill from the previous class that isn't actually usable any more).
 */
function ensureClassHasStarterSkill(player: PlayerState): void {
  const tree = CLASS_SKILL_TREES[player.className];
  if (!tree) return;
  const treeSkills = Object.keys(tree.skillProgression);
  if (player.unlockedSkills.some((skill) => treeSkills.includes(skill))) {
    return;
  }
  const [starter] = starterSkillsFor(player.className);
  if (!starter) return;
  if (!player.unlockedSkills.includes(starter)) {
    player.unlockedSkills.push(starter);
  }
  // Drop the starter into the first empty shortcut slot so the player can
  // actually cast it.
  const emptySlotIndex = player.skillShortcuts.findIndex((slot) => slot === null);
  if (emptySlotIndex !== -1 && !player.skillShortcuts.includes(starter)) {
    player.skillShortcuts[emptySlotIndex] = starter;
  }
}

export function applyRaceChange(
  player: PlayerState,
  rawRace: string,
  outbound: OutboundEventSink,
): boolean {
  if (!VALID_RACES.has(rawRace as CharacterRace)) {
    return false;
  }
  const race = rawRace as CharacterRace;
  if (player.race === race) {
    return false;
  }
  player.race = race;
  // refreshPlayerStatsFromEquipment clamps health/mana to the new max — see
  // equipHandlers.ts.
  refreshPlayerStatsFromEquipment(player);
  log(LOG_CATEGORIES.PLAYER, `Player ${player.id} race -> ${race}`);
  emitPlayerUpdated(outbound, {
    id: player.id,
    race,
    maxHealth: player.maxHealth,
    maxMana: player.maxMana,
    health: player.health,
    mana: player.mana,
  });
  return true;
}
