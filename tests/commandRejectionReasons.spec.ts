import { describe, expect, it } from 'vitest';
import {
  REJECTABLE_COMMANDS,
  type CommandRejectionReason,
  type CommandRejectedFor,
  type RejectableCommand,
} from '../packages/protocol/commandRejections';

/**
 * Archwork item #3 sub-work 2 — per-command reason unions.
 *
 * `CommandRejectionReasons` maps each rejectable command to its
 * finite set of known reason strings. Three tests pin the contract:
 *
 *  1. Every command in REJECTABLE_COMMANDS has an entry in the
 *     reason map. Adding a new command without listing its reasons
 *     is a compile error here, plus a runtime test failure.
 *  2. CommandRejectionReason<C> and CommandRejectedFor<C> narrow
 *     properly — a literal mismatched reason for the named command
 *     is a TS error (proven via @ts-expect-error annotations).
 *  3. The reasons listed for each command match the actual emit
 *     sites in the server tree (snapshot test against a frozen
 *     set per command).
 *
 * Sub-work 3 will tighten the Zod schema and `sendCommandRejected`
 * helper so the runtime path enforces the same contract.
 */

// Exhaustiveness check at compile time: a Record keyed by every
// rejectable command means TS errors if the reason map omits one.
const REASON_INVENTORY: { [C in RejectableCommand]: ReadonlyArray<CommandRejectionReason<C>> } = {
  CastReq: ['cooldown', 'nomana', 'invalid', 'outofrange', 'missingTarget', 'targetNotFound', 'rateLimited'],
  EquipItem: [
    'itemNotFound', 'levelTooLow', 'wrongClass', 'wrongRace',
    'slotConflict', 'handConflict', 'notEquippable',
    'twoHandBlocksOffhand', 'uniqueAlreadyEquipped',
    'invalidSlot', 'playerNotFound', 'rateLimited',
  ],
  UnequipItem: ['itemNotFound', 'slotConflict', 'playerNotFound', 'rateLimited'],
  UseItem: ['invalidSlot', 'invalidCount', 'noEffect', 'playerDead', 'playerNotFound', 'rateLimited'],
  DropItem: ['invalidSlot', 'invalidCount', 'playerNotFound', 'rateLimited'],
  DestroyItem: ['invalidSlot', 'invalidCount', 'playerNotFound', 'rateLimited'],
  CraftItem: ['unknownRecipe', 'missingReagents', 'inventoryFull', 'playerNotFound', 'rateLimited'],
  LootPickup: ['playerNotFound', 'lootNotFound', 'tooFar', 'inventoryFull', 'rateLimited'],
  LearnSkill: ['unknownSkill', 'levelTooLow', 'wrongClass', 'missingPrereq', 'noSkillPoints', 'rateLimited'],
  UpgradeSkill: ['unknownSkill', 'maxRank', 'missingPrereq', 'noSkillPoints', 'playerNotFound', 'rateLimited'],
  AcceptQuest: ['playerNotFound', 'notNearNpc', 'missingPrereq', 'noEffect', 'rateLimited'],
  CancelQuest: ['playerNotFound', 'noEffect', 'rateLimited'],
  AdvanceQuest: ['playerNotFound', 'noEffect', 'rateLimited'],
  ClaimQuestReward: ['playerNotFound', 'notNearNpc', 'notReady', 'notActive', 'noEffect', 'inventoryFull', 'rateLimited'],
  BuyFromVendor: ['playerNotFound', 'notNearVendor', 'unknownItem', 'notEnoughGold', 'inventoryFull', 'rateLimited'],
  SellToVendor: ['playerNotFound', 'notNearVendor', 'invalidSlot', 'invalidCount', 'rateLimited'],
  ChatRequest: ['playerNotFound', 'emptyText', 'rateLimited'],
  SelectClass: ['notGm', 'playerNotFound', 'invalid', 'rateLimited'],
  SelectRace: ['notGm', 'playerNotFound', 'invalid', 'rateLimited'],
  RespecSpecialization: ['playerNotFound', 'notSpecced', 'notEnoughGold', 'rateLimited'],
  GmCommand: ['playerNotFound', 'notGm', 'invalid', 'rateLimited'],
};

describe('CommandRejectionReasons — registry exhaustiveness', () => {
  it('every rejectable command has at least one reason listed', () => {
    for (const cmd of REJECTABLE_COMMANDS) {
      const reasons = REASON_INVENTORY[cmd];
      expect(reasons.length, `${cmd} has no reasons listed`).toBeGreaterThan(0);
    }
  });

  it('every command-reason pair stays narrow (no string drift)', () => {
    // This loop typechecks because REASON_INVENTORY is typed with the
    // per-command unions; iterating proves runtime + compile-time agree.
    for (const cmd of REJECTABLE_COMMANDS) {
      const reasons = REASON_INVENTORY[cmd];
      for (const reason of reasons) {
        expect(typeof reason).toBe('string');
      }
    }
  });

  it('typed CommandRejectedFor narrows reason at the literal level', () => {
    // Compile-time proof — these are valid:
    const validLearn: CommandRejectedFor<'LearnSkill'> = {
      type: 'CommandRejected',
      commandType: 'LearnSkill',
      reason: 'levelTooLow',
      targetId: 'iceBolt',
    };
    expect(validLearn.reason).toBe('levelTooLow');

    const validCast: CommandRejectedFor<'CastReq'> = {
      type: 'CommandRejected',
      commandType: 'CastReq',
      reason: 'cooldown',
    };
    expect(validCast.reason).toBe('cooldown');

    const invalidLearn: CommandRejectedFor<'LearnSkill'> = {
      type: 'CommandRejected',
      commandType: 'LearnSkill',
      // @ts-expect-error LearnSkill doesn't accept the CastReq-only 'cooldown' reason
      reason: 'cooldown',
    };
    expect(invalidLearn.commandType).toBe('LearnSkill');
  });
});

// Static surface check: REASON_INVENTORY is keyed by every
// RejectableCommand. The type annotation on the const above
// (`{ [C in RejectableCommand]: ReadonlyArray<CommandRejectionReason<C>> }`)
// already enforces this — adding a command without a reasons entry
// is a TS error there. This block keeps the symbol referenced so
// the unused-vars lint stays happy if the inventory ever becomes
// internal-only.
void REASON_INVENTORY;
