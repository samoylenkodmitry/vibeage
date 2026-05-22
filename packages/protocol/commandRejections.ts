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
  // GM / dev
  'GmCommand',
] as const;
// `RespawnRequest` and `SelectSpecialization` are intentionally NOT
// in this list. The wire schemas don't carry `clientSeq` for them
// and the server doesn't emit `CommandRejected` for either
// (RespawnRequest logs invalidOwnership via counters;
// SelectSpecialization just no-ops on unknown spec). Add them back
// only after both halves of the contract land — schema field +
// server emit.

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

/**
 * Archwork item #3 sub-work 2 — per-command reason unions.
 *
 * Each commandType has a finite, known set of rejection reasons.
 * Mapping them here means a typo (e.g. 'cooldwon' for 'cooldown')
 * is a compile error when callers reach for the typed helpers, and
 * the client-side copy table can statically prove it covers every
 * reason for a given command.
 *
 * The schema-side (Zod) discriminated union is sub-work 3; this
 * file is the TS surface only so old callers using raw strings
 * keep compiling during the migration.
 *
 * Reasons are drawn from the actual emit sites in the server tree
 * as of 2026-05-22. When a handler adds a new branch, the entry
 * here is what `tests/commandRejectionReasons.spec.ts` asserts
 * against — keeping the map in sync with the code is the test
 * boundary.
 *
 * A few reasons appear under multiple commands (`playerNotFound`,
 * `rateLimited`, `invalid`) because they map to common
 * infrastructure paths (ownership lookup, rate limiter, generic
 * validation gate). They're listed under each command where they
 * actually occur, not pulled into a shared "any-command" bucket —
 * staying explicit lets the client copy table render the right
 * sentence for the surface it's covering.
 */
export type CommandRejectionReasons = {
  // Combat
  CastReq:
    | 'cooldown'
    | 'nomana'
    | 'invalid'
    | 'outofrange'
    | 'missingTarget'
    | 'targetNotFound'
    | 'rateLimited';
  // Inventory + equipment
  EquipItem:
    | 'itemNotFound'
    | 'levelTooLow'
    | 'wrongClass'
    | 'wrongRace'
    | 'slotConflict'
    | 'handConflict'
    | 'notEquippable'
    | 'twoHandBlocksOffhand'
    | 'uniqueAlreadyEquipped'
    | 'invalidSlot'
    | 'playerNotFound'
    | 'rateLimited';
  UnequipItem:
    | 'itemNotFound'
    | 'slotConflict'
    | 'playerNotFound'
    | 'rateLimited';
  UseItem:
    | 'invalidSlot'
    | 'invalidCount'
    | 'noEffect'
    | 'playerDead'
    | 'playerNotFound'
    | 'rateLimited'
    // Reasons returned by the item-use validation layer.
    | 'itemNotFound'
    | 'notConsumable'
    | 'cooldown';
  DropItem:
    | 'invalidSlot'
    | 'invalidCount'
    | 'playerDead'
    | 'itemNotFound'
    | 'playerNotFound'
    | 'rateLimited';
  DestroyItem:
    | 'invalidSlot'
    | 'invalidCount'
    | 'playerDead'
    | 'itemNotFound'
    | 'playerNotFound'
    | 'rateLimited';
  CraftItem:
    | 'unknownRecipe'
    | 'missingReagents'
    | 'missingIngredients'
    | 'inventoryFull'
    | 'invalidSlot'
    | 'playerDead'
    | 'notRecipe'
    | 'playerNotFound'
    | 'rateLimited';
  // Skill progression
  LearnSkill:
    | 'unknownSkill'
    | 'levelTooLow'
    | 'wrongClass'
    | 'missingPrereq'
    | 'noSkillPoints'
    | 'alreadyKnown'
    | 'rateLimited';
  UpgradeSkill:
    | 'unknownSkill'
    | 'maxRank'
    | 'maxLevelReached'
    | 'missingPrereq'
    | 'noSkillPoints'
    | 'skillNotLearned'
    | 'noUpgradesAvailable'
    | 'playerNotFound'
    | 'rateLimited';
  // Quest verbs
  AcceptQuest: 'playerNotFound' | 'notNearNpc' | 'missingPrereq' | 'noEffect' | 'rateLimited';
  CancelQuest: 'playerNotFound' | 'noEffect' | 'rateLimited';
  AdvanceQuest: 'playerNotFound' | 'noEffect' | 'rateLimited';
  ClaimQuestReward: 'playerNotFound' | 'notNearNpc' | 'notReady' | 'notActive' | 'noEffect' | 'inventoryFull' | 'rateLimited';
  // Vendor
  BuyFromVendor:
    | 'playerNotFound'
    | 'notNearVendor'
    | 'unknownItem'
    | 'notEnoughGold'
    | 'inventoryFull'
    | 'rateLimited';
  SellToVendor:
    | 'playerNotFound'
    | 'notNearVendor'
    | 'invalidSlot'
    | 'invalidCount'
    | 'rateLimited';
  // Chat
  ChatRequest: 'playerNotFound' | 'emptyText' | 'rateLimited';
  // Identity
  SelectClass: 'notGm' | 'playerNotFound' | 'invalid' | 'rateLimited';
  SelectRace: 'notGm' | 'playerNotFound' | 'invalid' | 'rateLimited';
  // GM / dev
  GmCommand: 'playerNotFound' | 'notGm' | 'invalid' | 'rateLimited';
};

/**
 * The set of rejection reasons for a specific command. Use in
 * client copy tables and per-command test exhaustiveness:
 *
 *   const copy: Record<CommandRejectionReason<'LearnSkill'>, string> = { … };
 */
export type CommandRejectionReason<C extends RejectableCommand> = CommandRejectionReasons[C];

/**
 * Helper type: a fully-typed CommandRejected envelope for one
 * specific command. Used by sub-work 3's typed `sendCommandRejected`
 * overloads to make typos at the emit site compile errors.
 */
export type CommandRejectedFor<C extends RejectableCommand> = {
  type: 'CommandRejected';
  commandType: C;
  reason: CommandRejectionReason<C>;
  requestId?: number;
  targetId?: string;
  detail?: string;
};
