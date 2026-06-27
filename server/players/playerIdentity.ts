import { CLASS_SKILL_TREES, type CharacterClass } from '../../packages/content/classes.js';
import {
  CHARACTER_RACES,
  isClassAllowedForRace,
  RACE_PROFILES,
  type CharacterRace,
} from '../../packages/content/races.js';
import { SKILLS, type SkillId } from '../../packages/content/skills.js';
import { getSpecializationById } from '../../packages/content/specializations.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import { recomputePlayerStats } from './playerStatsRefresh.js';
import { log, LOG_CATEGORIES, warn } from '../logger.js';
import { emitPlayerUpdated, type OutboundEventSink } from '../transport/outboundEvents.js';
import { starterSkillsFor } from './playerProgression.js';
import { onSpecializationChosenForQuests } from './playerQuests.js';

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
  // Race gate: each race only allows a curated class list. Rejecting
  // here matches the client filtering — a forged SelectClass for an
  // off-race class is dropped silently rather than silently switching.
  const race = (player.race ?? 'human') as CharacterRace;
  if (!isClassAllowedForRace(race, className)) {
    warn(LOG_CATEGORIES.PLAYER, `Class ${className} not allowed for race ${race} (player ${player.id})`);
    return false;
  }
  player.className = className;
  // Spec belongs to a specific base class (specs are 1:N from class
  // — e.g. arcanist is mage-only). When the class changes, drop the
  // old specializationId so the UI shows "pick spec at Lv 20" again
  // for the new class and the engine doesn't apply mismatched
  // passives.
  player.specializationId = null;
  // recomputePlayerStats clamps health/mana to the new max
  // when the new class lowers them.
  recomputePlayerStats(player);
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
    availableSkillPoints: player.availableSkillPoints,
    // Stale-spec cleared above; broadcast the null so the client
    // drops the old spec passive label from CharacterPanel.
    specializationId: player.specializationId,
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
  // PR PP — `starters` includes the auto-granted class passive, but
  // the player's persisted unlockedSkills predates the refactor and
  // may not list it. Count refund against the *paid* freebies only
  // (the class starter + UNIVERSAL_SKILLS) so the auto-passive
  // doesn't inflate the freebie count and starve the refund.
  const paidFreebies = starters.filter((s) => !s.startsWith('passive_')).length;
  const refundable = Math.max(0, player.unlockedSkills.length - paidFreebies);
  player.availableSkillPoints += refundable;
  player.unlockedSkills = [...starters];
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
  // Race is locked once the player is in the world; only GMs can
  // mutate it. Character-creation flow (PR D2) will set the initial
  // race before the player enters; GMs use the dev-commands gate
  // (VIBEAGE_ENABLE_DEV_COMMANDS=1) the same way devTeleport does.
  // Caller is responsible for checking the gate before invoking
  // this helper (router checks the env flag).
  player.race = race;
  // Race gate: if the new race doesn't allow the player's current
  // class, snap them to the first allowed class. resetSkillsForClass
  // handles refund + starter unlock + shortcut rebind, mirroring
  // applyClassChange's behaviour.
  let classSnapped: CharacterClass | null = null;
  if (!isClassAllowedForRace(race, player.className)) {
    const fallback = RACE_PROFILES[race]?.allowedClasses[0];
    if (fallback) {
      classSnapped = fallback;
      player.className = fallback;
      // Class snapped → drop the old spec id too (specs are
      // class-specific). Mirrors the equivalent line in
      // applyClassChange.
      player.specializationId = null;
      resetSkillsForClassChange(player);
    }
  }
  // recomputePlayerStats clamps health/mana to the new max.
  recomputePlayerStats(player);
  log(LOG_CATEGORIES.PLAYER, `Player ${player.id} race -> ${race}${classSnapped ? ` (class snapped to ${classSnapped})` : ''}`);
  emitPlayerUpdated(outbound, {
    id: player.id,
    race,
    className: player.className,
    maxHealth: player.maxHealth,
    maxMana: player.maxMana,
    health: player.health,
    mana: player.mana,
    unlockedSkills: player.unlockedSkills,
    availableSkillPoints: player.availableSkillPoints,
    // Include spec id so the client drops the stale spec passive
    // label when the class got snapped to a different one.
    specializationId: player.specializationId,
    // Race multipliers feed into derived stats (Lineage-style weights).
    // Broadcast so the panel updates pAtk/mAtk/etc. immediately.
    stats: player.stats,
  });
  return true;
}

/**
 * Become: stamp a chosen race + prophecy(class) + name onto the live Nameless
 * guest, granting the class starter kit (the guest carried only universal
 * skills). Unlike applyClassChange/applyRaceChange, this is unconditional — it
 * fires even when the picked race/class equal the guest's hidden human/mage
 * default, so a human-mage Become still gets the mage starter (fireball). The
 * carried progress (level/xp/gold/inventory/quests/position) is untouched.
 */
export function applyBecomeIdentity(
  player: PlayerState,
  rawRace: string,
  rawClassName: string,
  name: string,
  outbound: OutboundEventSink,
): { ok: true } | { ok: false; reason: 'invalidRace' | 'invalidClass' | 'invalidIdentity' } {
  if (!VALID_RACES.has(rawRace as CharacterRace)) return { ok: false, reason: 'invalidRace' };
  const race = rawRace as CharacterRace;
  if (!VALID_CLASSES.has(rawClassName as CharacterClass)) return { ok: false, reason: 'invalidClass' };
  const className = rawClassName as CharacterClass;
  if (!isClassAllowedForRace(race, className)) return { ok: false, reason: 'invalidIdentity' };
  player.name = name;
  player.race = race;
  player.className = className;
  player.specializationId = null;
  resetSkillsForClassChange(player);
  recomputePlayerStats(player);
  log(LOG_CATEGORIES.PLAYER, `Player ${player.id} became ${race} ${className} "${name}"`);
  emitPlayerUpdated(outbound, {
    id: player.id,
    name,
    race,
    className,
    maxHealth: player.maxHealth,
    maxMana: player.maxMana,
    health: player.health,
    mana: player.mana,
    unlockedSkills: player.unlockedSkills,
    availableSkillPoints: player.availableSkillPoints,
    specializationId: player.specializationId,
    stats: player.stats,
  });
  return { ok: true };
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
  // One-way: once a player picks any spec, they're locked in. The
  // proficiency tier (lv40) layers on top — there's no respec by
  // design. Comparing against spec.id (instead of any non-null value)
  // would let the player swap to the sibling spec by re-clicking.
  if (player.specializationId) return false;
  player.specializationId = spec.id;
  // §45.3 — spec passives flow through pushSpecializationContributions
  // in packages/sim/statContributions.ts. The placeholder spec
  // contribution is enough to surface the choice in the breakdown
  // popup; numeric tuning is content-only.
  recomputePlayerStats(player);
  onSpecializationChosenForQuests(player, outbound);
  log(LOG_CATEGORIES.PLAYER, `Player ${player.id} spec -> ${spec.id}`);
  emitPlayerUpdated(outbound, {
    id: player.id,
    specializationId: spec.id,
    stats: player.stats,
    maxHealth: player.maxHealth,
    maxMana: player.maxMana,
  });
  return true;
}

/**
 * §9 — specialization respec. Clears the player's current
 * `specializationId` for a fixed gold cost. The spec selector then
 * lets them re-pick. Class-change is intentionally out of scope —
 * that would require respeccing skill points too.
 *
 * Reasons mirror the typed CommandRejectionReason<'RespecSpecialization'>
 * union: notSpecced (no spec to clear) / notEnoughGold.
 */
export const SPECIALIZATION_RESPEC_GOLD_COST = 5000;

export type RespecResult =
  | { ok: true }
  | { ok: false; reason: 'notSpecced' | 'notEnoughGold' };

export function applySpecializationRespec(
  player: PlayerState,
  outbound: OutboundEventSink,
): RespecResult {
  if (!player.specializationId) {
    return { ok: false, reason: 'notSpecced' };
  }
  if ((player.gold ?? 0) < SPECIALIZATION_RESPEC_GOLD_COST) {
    return { ok: false, reason: 'notEnoughGold' };
  }
  const priorSpec = player.specializationId;
  player.gold = (player.gold ?? 0) - SPECIALIZATION_RESPEC_GOLD_COST;
  player.specializationId = null;
  recomputePlayerStats(player);
  log(LOG_CATEGORIES.PLAYER, `Player ${player.id} respecced (was ${priorSpec}, paid ${SPECIALIZATION_RESPEC_GOLD_COST}g)`);
  emitPlayerUpdated(outbound, {
    id: player.id,
    specializationId: null,
    gold: player.gold,
  });
  return { ok: true };
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
export type SkillUpgradeResult =
  | { ok: true }
  | { ok: false; reason: 'skillNotLearned' | 'noUpgradesAvailable' | 'maxLevelReached' | 'noSkillPoints' };

export function applySkillUpgrade(
  player: PlayerState,
  skillId: SkillId,
  outbound: OutboundEventSink,
): SkillUpgradeResult {
  if (!player.unlockedSkills.includes(skillId)) return { ok: false, reason: 'skillNotLearned' };
  const skill = SKILLS[skillId];
  const upgrades = skill?.upgrades;
  if (!upgrades?.length) return { ok: false, reason: 'noUpgradesAvailable' };
  const current = Math.max(1, Math.floor(player.skillLevels?.[skillId] ?? 1));
  const maxLevel = 1 + upgrades.length;
  if (current >= maxLevel) return { ok: false, reason: 'maxLevelReached' };
  if (player.availableSkillPoints < 1) return { ok: false, reason: 'noSkillPoints' };
  player.availableSkillPoints -= 1;
  const next = current + 1;
  player.skillLevels = { ...(player.skillLevels ?? {}), [skillId]: next };
  log(LOG_CATEGORIES.PLAYER, `Player ${player.id} upgraded ${skillId} -> lv${next}`);
  emitPlayerUpdated(outbound, {
    id: player.id,
    availableSkillPoints: player.availableSkillPoints,
    skillLevels: player.skillLevels,
  });
  return { ok: true };
}
