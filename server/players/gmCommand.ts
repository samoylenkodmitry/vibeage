import type { GmCommand } from '../../packages/protocol/messages.js';
import type { CharacterClass } from '../../packages/content/classes.js';
import { CHARACTER_RACES, type CharacterRace } from '../../packages/content/races.js';
import { CLASS_SKILL_TREES } from '../../packages/content/classes.js';
import { SKILLS, type SkillId } from '../../packages/content/skills.js';
import { SPECIALIZATIONS } from '../../packages/content/specializations.js';
import { addItemsToPlayer, ensureCharacterInventory } from '../inventory/aggregateBridge.js';
import { flattenInventoryToSlots } from '../../packages/sim/inventoryWireAdapter.js';
import { recomputePlayerStats } from './playerStatsRefresh.js';
import { log, LOG_CATEGORIES, warn } from '../logger.js';
import { applyClassChange, applyRaceChange, applySpecializationChange } from './playerIdentity.js';
import { isGmModeEnabled } from './gmMode.js';
import { emitPlayerUpdated, type OutboundEventSink } from '../transport/outboundEvents.js';
import type { PlayerState } from '../../packages/sim/entities.js';

/**
 * GM verb dispatcher. Single read-site for every grant/set verb so
 * the audit log is uniform and the env gate is enforced once. Every
 * mutation that the wire-projection allowlist exposes is broadcast
 * via `emitPlayerUpdated` so the GM panel + target client get
 * immediate visual feedback — no waiting for the next tick.
 *
 * Verb summary:
 *   grantXp        — value: number (handles multiple level-ups)
 *   grantGold      — value: number (added to PlayerState.gold)
 *   grantSp        — value: number (added to availableSkillPoints)
 *   grantItem      — value: itemId; quantity: number (emits inventory)
 *   grantSkill     — value: skillId (auto-binds to first empty slot)
 *   setLevel       — value: number (awards SP for each level gained)
 *   setRace        — value: race string
 *   setClass       — value: class string
 *   setSpecialization — value: spec id (clears if 'none' / '')
 */
export function applyGmCommand(
  caller: PlayerState,
  msg: GmCommand,
  resolveTarget: (id: string) => PlayerState | undefined,
  outbound: OutboundEventSink,
): boolean {
  if (!isGmModeEnabled()) {
    warn(LOG_CATEGORIES.PLAYER, `GmCommand rejected (GM mode off) caller=${caller.id} verb=${msg.verb}`);
    return false;
  }
  const target = msg.targetId ? resolveTarget(msg.targetId) ?? null : caller;
  if (!target) {
    warn(LOG_CATEGORIES.PLAYER, `GmCommand target not found: ${msg.targetId}`);
    return false;
  }
  const ok = dispatch(target, msg, outbound);
  log(LOG_CATEGORIES.PLAYER, `[GM] ${caller.id} → ${target.id} ${msg.verb}=${JSON.stringify(msg.value)}${msg.quantity ? ` x${msg.quantity}` : ''} ok=${ok}`);
  return ok;
}

function dispatch(target: PlayerState, msg: GmCommand, outbound: OutboundEventSink): boolean {
  switch (msg.verb) {
    case 'grantXp':
      return grantXp(target, msg.value, outbound);
    case 'grantGold':
      return grantGold(target, msg.value, outbound);
    case 'grantSp':
      return grantSp(target, msg.value, outbound);
    case 'grantItem':
      return grantItem(target, msg.value, msg.quantity, outbound);
    case 'grantSkill':
      return grantSkill(target, msg.value, outbound);
    case 'setLevel':
      return setLevel(target, msg.value, outbound);
    case 'setRace':
      return setRace(target, msg.value, outbound);
    case 'setClass':
      return setClass(target, msg.value, outbound);
    case 'setSpecialization':
      return setSpecialization(target, msg.value, outbound);
  }
}

/**
 * Walk through level thresholds so a big XP grant produces every
 * level-up the player should have earned. Matches the kill-XP path:
 * each level-up bumps SP +1, recomputes stats, and refills hp/mp.
 */
function grantXp(target: PlayerState, value: number | string, outbound: OutboundEventSink): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return false;
  target.experience += value;
  let leveled = false;
  while (target.experience >= target.experienceToNextLevel) {
    target.level += 1;
    target.experience -= target.experienceToNextLevel;
    target.experienceToNextLevel = Math.floor(target.experienceToNextLevel * 1.5);
    target.availableSkillPoints += 1;
    leveled = true;
  }
  if (leveled) {
    recomputePlayerStats(target);
    target.health = target.maxHealth;
    target.mana = target.maxMana;
  }
  emitPlayerUpdated(outbound, {
    id: target.id,
    experience: target.experience,
    experienceToNextLevel: target.experienceToNextLevel,
    level: target.level,
    availableSkillPoints: target.availableSkillPoints,
    stats: target.stats,
    maxHealth: target.maxHealth,
    maxMana: target.maxMana,
    health: target.health,
    mana: target.mana,
  });
  return true;
}

function grantGold(target: PlayerState, value: number | string, outbound: OutboundEventSink): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  target.gold = (target.gold ?? 0) + value;
  emitPlayerUpdated(outbound, { id: target.id, gold: target.gold });
  return true;
}

function grantSp(target: PlayerState, value: number | string, outbound: OutboundEventSink): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return false;
  target.availableSkillPoints += value;
  emitPlayerUpdated(outbound, { id: target.id, availableSkillPoints: target.availableSkillPoints });
  return true;
}

function grantItem(
  target: PlayerState,
  value: number | string,
  quantity: number | undefined,
  outbound: OutboundEventSink,
): boolean {
  if (typeof value !== 'string') return false;
  const qty = quantity && quantity > 0 ? quantity : 1;
  const result = addItemsToPlayer(target, value, qty);
  if (!result.ok) return false;
  // PlayerUpdate carries an inventory wire-projection so the
  // owner's bag panel refreshes immediately. Without this, the GM
  // had to drop+repick or relog to see the new item.
  emitPlayerUpdated(outbound, {
    id: target.id,
    inventory: flattenInventoryToSlots(ensureCharacterInventory(target)),
    gold: target.gold,
  });
  return true;
}

function grantSkill(target: PlayerState, value: number | string, outbound: OutboundEventSink): boolean {
  if (typeof value !== 'string') return false;
  const skillId = value as SkillId;
  if (!SKILLS[skillId]) return false;
  if (!target.unlockedSkills.includes(skillId)) {
    target.unlockedSkills.push(skillId);
    const emptyIndex = target.skillShortcuts.findIndex((s) => s === null);
    if (emptyIndex !== -1) target.skillShortcuts[emptyIndex] = skillId;
  }
  emitPlayerUpdated(outbound, {
    id: target.id,
    unlockedSkills: target.unlockedSkills,
    skillShortcuts: target.skillShortcuts,
  });
  return true;
}

/**
 * Set absolute level. Awards (newLevel - oldLevel) SP when leveling
 * UP so the panel matches the normal progression. Going DOWN just
 * snaps the number without taking SP back (intentional — GM is for
 * testing, not punishment).
 */
function setLevel(target: PlayerState, value: number | string, outbound: OutboundEventSink): boolean {
  if (typeof value !== 'number' || value < 1) return false;
  const next = Math.floor(value);
  const gained = Math.max(0, next - target.level);
  target.level = next;
  if (gained > 0) target.availableSkillPoints += gained;
  recomputePlayerStats(target);
  target.health = target.maxHealth;
  target.mana = target.maxMana;
  emitPlayerUpdated(outbound, {
    id: target.id,
    level: target.level,
    availableSkillPoints: target.availableSkillPoints,
    stats: target.stats,
    maxHealth: target.maxHealth,
    maxMana: target.maxMana,
    health: target.health,
    mana: target.mana,
  });
  return true;
}

function setRace(target: PlayerState, value: number | string, outbound: OutboundEventSink): boolean {
  if (typeof value !== 'string') return false;
  if (!CHARACTER_RACES.includes(value as CharacterRace)) return false;
  return applyRaceChange(target, value, outbound);
}

function setClass(target: PlayerState, value: number | string, outbound: OutboundEventSink): boolean {
  if (typeof value !== 'string') return false;
  if (!CLASS_SKILL_TREES[value as CharacterClass]) return false;
  return applyClassChange(target, value, outbound);
}

function setSpecialization(target: PlayerState, value: number | string, outbound: OutboundEventSink): boolean {
  if (typeof value !== 'string') return false;
  if (value === '' || value === 'none') {
    target.specializationId = null;
    emitPlayerUpdated(outbound, { id: target.id, specializationId: null });
    return true;
  }
  if (!SPECIALIZATIONS[value as keyof typeof SPECIALIZATIONS]) return false;
  // applySpecializationChange refuses to overwrite an existing
  // spec; clear-and-re-apply so GM can switch freely.
  target.specializationId = null;
  return applySpecializationChange(target, value, outbound);
}
