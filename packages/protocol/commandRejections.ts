import { z } from 'zod';

/**
 * Archwork item #3 — typed CommandRejected contract.
 *
 * This module is the single source of truth for which client
 * messages may be rejected with a `CommandRejected` envelope. Adding
 * a new rejectable command requires editing one list here; the
 * `CommandRejected.commandType` schema, the server emit helpers,
 * and the client routing all derive from this registry.
 *
 * Movement / cast / loot intents stay OFF this list when the
 * rejection is high-frequency client-initiated (rate limit drops on
 * MoveIntent etc. — `RATE_LIMIT_FEEDBACK_COMMANDS` in the router
 * filters those silently). Their failure modes either go through
 * other channels (CastReq → CommandRejected, but only on validation
 * failures, not rate-limit drops) or are intentionally silent.
 *
 * Sub-work 1 of archwork #3: the registry itself + a tightened
 * schema. Sub-works 2-4 (per-command reason unions, typed emit
 * helper, table-driven client routing) come in follow-ups.
 */

/**
 * Every client command type the server may reject with a
 * `CommandRejected` envelope. Drawn from the actual
 * `sendCommandRejected` call sites in the server tree as of
 * 2026-05-22.
 *
 * Order matches the rough domain grouping (cast → equip → skill →
 * quest → vendor → chat → identity → gm).
 */
export const REJECTABLE_COMMANDS = [
  // Combat
  'CastReq',
  // Inventory + equipment
  'EquipItem',
  'UnequipItem',
  'UseItem',
  'DropItem',
  'DestroyItem',
  'CraftItem',
  // Skill progression
  'LearnSkill',
  'UpgradeSkill',
  // Quest verbs
  'AcceptQuest',
  'CancelQuest',
  'AdvanceQuest',
  'ClaimQuestReward',
  // Vendor
  'BuyFromVendor',
  'SellToVendor',
  // Chat
  'ChatRequest',
  // Identity (race/class selection)
  'SelectClass',
  'SelectRace',
  'SelectSpecialization',
  // Lifecycle
  'RespawnRequest',
  // GM / dev
  'GmCommand',
] as const;

export type RejectableCommand = typeof REJECTABLE_COMMANDS[number];

export const rejectableCommandSchema = z.enum(REJECTABLE_COMMANDS);

/**
 * The membership check the server / client use to decide whether
 * a given message type is rejectable. Cheap O(1) lookup.
 */
const REJECTABLE_COMMAND_SET: ReadonlySet<string> = new Set(REJECTABLE_COMMANDS);

export function isRejectableCommand(commandType: string): commandType is RejectableCommand {
  return REJECTABLE_COMMAND_SET.has(commandType);
}
