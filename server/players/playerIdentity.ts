import { CLASS_SKILL_TREES, type CharacterClass } from '../../packages/content/classes.js';
import { CHARACTER_RACES, type CharacterRace } from '../../packages/content/races.js';
import { SKILLS, type SkillId } from '../../packages/content/skills.js';
import { getSpecializationById } from '../../packages/content/specializations.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import { refreshPlayerStatsFromEquipment } from '../inventory/equipHandlers.js';
import { log, LOG_CATEGORIES, warn } from '../logger.js';
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
  resetSkillsForClassChange(player);
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
    availableSkillPoints: player.availableSkillPoints,
    // The derived combat stats (pAtk, mAtk, pDef, mDef, crit, etc.)
    // change with class multipliers — broadcast them so the panel reflects
    // the switch immediately, not just HP/MP.
    stats: player.stats,
  });
  return true;
}

/**
 * When a player switches class, guarantee they unlock the new class's
 * starter skill. The previous heuristic checked "do you already have any
 * skill from this class's tree" — but several trees deliberately share
 * skills (warrior has fireball at L6, paladin has bless, etc.), so a
 * mage switching to warrior would short-circuit with `fireball` already
 * present and never get `slash` added, breaking learn-prereq chains
 * (bash requires slash, etc.). Check specifically for the starter.
 */
/**
 * On a class change: wipe the old class's skills entirely and replace
 * with the new class's starter. Otherwise unlockedSkills accumulates
 * across switches — a new player who joins (defaulted to mage with
 * fireball) and then picks knight ends up with both fireball AND
 * slash, which is wrong UX.
 *
 * Refund every previously-spent skill point so the player can re-learn
 * skills appropriate to the new class. The starter itself is free.
 *
 * Drop all skill shortcuts that referenced retired skills and re-bind
 * the new starter into the first empty slot.
 */
function resetSkillsForClassChange(player: PlayerState): void {
  const starters = starterSkillsFor(player.className);
  // Refund spent points: everything beyond the freebie starters.
  // starterSkillsFor returns [...UNIVERSAL_SKILLS, classStarter], all
  // of which are granted for free, so they don't count toward refund.
  const refundable = Math.max(0, player.unlockedSkills.length - starters.length);
  player.availableSkillPoints += refundable;
  player.unlockedSkills = [...starters];
  player.skillShortcuts = player.skillShortcuts.map((skill) =>
    skill && player.unlockedSkills.includes(skill) ? skill : null,
  );
  for (const skill of starters) {
    if (!player.skillShortcuts.includes(skill)) {
      const emptyIndex = player.skillShortcuts.findIndex((slot) => slot === null);
      if (emptyIndex !== -1) {
        player.skillShortcuts[emptyIndex] = skill;
      }
    }
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
    // Race multipliers feed into derived stats (Lineage-style weights).
    // Broadcast so the panel updates pAtk/mAtk/etc. immediately.
    stats: player.stats,
  });
  return true;
}

/**
 * Player picks a specialization at SPECIALIZATION_UNLOCK_LEVEL (20).
 * Validates: the spec exists, matches the player's base class, the
 * player has hit the unlock level, and isn't already specialized.
 * Spec choice is currently one-way (no respec) by design — the
 * proficiency tier (lv40) unlocks more skills under the same branch.
 */
export function applySpecializationChange(
  player: PlayerState,
  rawSpecId: string,
  outbound: OutboundEventSink,
): boolean {
  const spec = getSpecializationById(rawSpecId);
  if (!spec) return false;
  if (spec.baseClass !== player.className) {
    warn(LOG_CATEGORIES.PLAYER, `Spec ${rawSpecId} doesn't match player class ${player.className}`);
    return false;
  }
  if (player.level < spec.unlockLevel) {
    warn(LOG_CATEGORIES.PLAYER, `Player ${player.id} below spec unlock level (${player.level} < ${spec.unlockLevel})`);
    return false;
  }
  if (player.specializationId === spec.id) return false;
  player.specializationId = spec.id;
  // Spec passive multipliers will feed into refreshPlayerStatsFromEquipment
  // once derivePlayerStats reads them; for now we just record the choice
  // and broadcast. (Stat-merge integration is its own small follow-up.)
  log(LOG_CATEGORIES.PLAYER, `Player ${player.id} spec -> ${spec.id}`);
  emitPlayerUpdated(outbound, {
    id: player.id,
    specializationId: spec.id,
  });
  return true;
}

/**
 * Bump a skill's upgrade tier by one. Requires:
 *   - skill is currently unlocked
 *   - skill has an upgrades[] table
 *   - player hasn't already maxed the table
 *   - player has at least one available skill point
 *
 * Spends one availableSkillPoint per tier. Engine reads skillLevels
 * on cast resolution via getSkillUpgradeModifiers.
 */
export function applySkillUpgrade(
  player: PlayerState,
  skillId: SkillId,
  outbound: OutboundEventSink,
): boolean {
  if (!player.unlockedSkills.includes(skillId)) return false;
  const skill = SKILLS[skillId];
  const upgrades = skill?.upgrades;
  if (!upgrades?.length) return false;
  const current = Math.max(1, Math.floor(player.skillLevels?.[skillId] ?? 1));
  const maxLevel = 1 + upgrades.length;
  if (current >= maxLevel) return false;
  if (player.availableSkillPoints < 1) return false;
  player.availableSkillPoints -= 1;
  const next = current + 1;
  player.skillLevels = { ...(player.skillLevels ?? {}), [skillId]: next };
  log(LOG_CATEGORIES.PLAYER, `Player ${player.id} upgraded ${skillId} -> lv${next}`);
  emitPlayerUpdated(outbound, {
    id: player.id,
    availableSkillPoints: player.availableSkillPoints,
    skillLevels: player.skillLevels,
  });
  return true;
}
