import type { GmCommand } from '../../packages/protocol/messages.js';
import type { CharacterClass } from '../../packages/content/classes.js';
import { CHARACTER_RACES, type CharacterRace } from '../../packages/content/races.js';
import { CLASS_SKILL_TREES } from '../../packages/content/classes.js';
import { SKILLS, type SkillId } from '../../packages/content/skills.js';
import { SPECIALIZATIONS } from '../../packages/content/specializations.js';
import { addItemsToPlayer } from '../inventory/aggregateBridge.js';
import { recomputePlayerStats } from './playerStatsRefresh.js';
import { log, LOG_CATEGORIES, warn } from '../logger.js';
import { applyClassChange, applyRaceChange, applySpecializationChange } from './playerIdentity.js';
import { isGmModeEnabled } from './gmMode.js';
import { emitPlayerUpdated, type OutboundEventSink } from '../transport/outboundEvents.js';
import type { PlayerState } from '../../packages/sim/entities.js';

/**
 * GM verb dispatcher. Single read-site for every grant/set verb so
 * the audit log is uniform and the env gate is enforced once. Each
 * verb returns true on success and emits a playerUpdated where the
 * mutation isn't already broadcast by the underlying helper.
 *
 * Verb summary:
 *   grantXp        — value: number (added to player.experience)
 *   grantGold      — value: number (placeholder: stored on player.gold;
 *                    inventory currency wiring is a follow-up)
 *   grantSp        — value: number (added to availableSkillPoints)
 *   grantItem      — value: itemId; quantity: number
 *   grantSkill     — value: skillId (added to unlockedSkills)
 *   setLevel       — value: number
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
    case 'grantXp': {
      if (typeof msg.value !== 'number') return false;
      target.experience += msg.value;
      emitPlayerUpdated(outbound, { id: target.id, experience: target.experience });
      return true;
    }
    case 'grantGold': {
      if (typeof msg.value !== 'number') return false;
      // TODO: route through a currency helper once currency persistence
      // lands. For now write to a transient gold field so the GM panel
      // can show "added 100" without crashing.
      (target as PlayerState & { gold?: number }).gold = ((target as PlayerState & { gold?: number }).gold ?? 0) + msg.value;
      return true;
    }
    case 'grantSp': {
      if (typeof msg.value !== 'number') return false;
      target.availableSkillPoints += msg.value;
      emitPlayerUpdated(outbound, { id: target.id, availableSkillPoints: target.availableSkillPoints });
      return true;
    }
    case 'grantItem': {
      if (typeof msg.value !== 'string') return false;
      const quantity = msg.quantity && msg.quantity > 0 ? msg.quantity : 1;
      const result = addItemsToPlayer(target, msg.value, quantity);
      return result.ok;
    }
    case 'grantSkill': {
      if (typeof msg.value !== 'string') return false;
      const skillId = msg.value as SkillId;
      if (!SKILLS[skillId]) return false;
      if (!target.unlockedSkills.includes(skillId)) {
        target.unlockedSkills.push(skillId);
        // Mirror the normal learn flow: drop the new skill into the
        // first empty shortcut slot so the player can actually press
        // it without rebinding manually.
        const emptyIndex = target.skillShortcuts.findIndex((s) => s === null);
        if (emptyIndex !== -1) {
          target.skillShortcuts[emptyIndex] = skillId;
        }
      }
      emitPlayerUpdated(outbound, {
        id: target.id,
        unlockedSkills: target.unlockedSkills,
        skillShortcuts: target.skillShortcuts,
      });
      return true;
    }
    case 'setLevel': {
      if (typeof msg.value !== 'number' || msg.value < 1) return false;
      target.level = Math.floor(msg.value);
      // Derived stats (HP/MP caps, P.Atk, M.Atk, etc.) scale with
      // level; re-deriving here so the GM-set level isn't just a
      // cosmetic number. Broadcast the resulting stats + caps so
      // the client doesn't wait for the next tick to display them.
      recomputePlayerStats(target);
      emitPlayerUpdated(outbound, {
        id: target.id,
        level: target.level,
        stats: target.stats,
        maxHealth: target.maxHealth,
        maxMana: target.maxMana,
        health: target.health,
        mana: target.mana,
      });
      return true;
    }
    case 'setRace': {
      if (typeof msg.value !== 'string') return false;
      if (!CHARACTER_RACES.includes(msg.value as CharacterRace)) return false;
      return applyRaceChange(target, msg.value, outbound);
    }
    case 'setClass': {
      if (typeof msg.value !== 'string') return false;
      if (!CLASS_SKILL_TREES[msg.value as CharacterClass]) return false;
      return applyClassChange(target, msg.value, outbound);
    }
    case 'setSpecialization': {
      if (typeof msg.value !== 'string') return false;
      if (msg.value === '' || msg.value === 'none') {
        target.specializationId = null;
        emitPlayerUpdated(outbound, { id: target.id, specializationId: null });
        return true;
      }
      if (!SPECIALIZATIONS[msg.value as keyof typeof SPECIALIZATIONS]) return false;
      // applySpecializationChange refuses to overwrite an existing
      // spec; for GM use we want to be able to switch freely, so
      // null it out first then re-apply through the normal path.
      target.specializationId = null;
      return applySpecializationChange(target, msg.value, outbound);
    }
  }
}
