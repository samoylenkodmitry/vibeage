import { describe, expect, it } from 'vitest';
import {
  REJECTABLE_COMMANDS,
  isRejectableCommand,
  rejectableCommandSchema,
} from '../packages/protocol/commandRejections';
import { commandRejectedSchema } from '../packages/protocol/serverMessages';

/**
 * Archwork item #3 sub-work 1 — rejectable-command registry.
 *
 * Pin three properties:
 *
 *  1. REJECTABLE_COMMANDS contains every commandType the server
 *     emits today (drawn from the `sendCommandRejected` call sites
 *     as of 2026-05-22). Adding a new rejectable command requires
 *     adding it here first — `tests/protocolTypeDrift.spec.ts` will
 *     also fail if a new handler emits a command not in this list.
 *  2. `commandRejectedSchema` rejects an out-of-registry commandType
 *     at the Zod boundary — a typo can't escape onto the wire.
 *  3. `isRejectableCommand` mirrors the registry exactly (set
 *     membership), with no false positives or false negatives.
 */

const EXPECTED_REJECTABLE_COMMANDS = [
  'CastReq',
  'EquipItem', 'UnequipItem',
  'UseItem', 'DropItem', 'DestroyItem', 'CraftItem',
  'LearnSkill', 'UpgradeSkill',
  'AcceptQuest', 'CancelQuest', 'AdvanceQuest', 'ClaimQuestReward',
  'BuyFromVendor', 'SellToVendor',
  'ChatRequest',
  'SelectClass', 'SelectRace',
  'GmCommand',
] as const;

describe('REJECTABLE_COMMANDS registry', () => {
  it('contains every commandType the server emits rejections for (2026-05-22 snapshot)', () => {
    const got = [...REJECTABLE_COMMANDS].sort();
    const want = [...EXPECTED_REJECTABLE_COMMANDS].sort();
    expect(got).toEqual(want);
  });

  it('isRejectableCommand returns true for every registry entry', () => {
    for (const cmd of REJECTABLE_COMMANDS) {
      expect(isRejectableCommand(cmd)).toBe(true);
    }
  });

  it('isRejectableCommand returns false for known non-rejectable commands', () => {
    // Movement and bookkeeping commands are deliberately silent on
    // rate-limit drops and don't have a rejection envelope.
    for (const nonReject of ['MoveIntent', 'SetSkillShortcut', 'RequestInventory', 'TalkNpc', 'DevTeleport']) {
      expect(isRejectableCommand(nonReject)).toBe(false);
    }
  });

  it('isRejectableCommand returns false for garbage / typos', () => {
    expect(isRejectableCommand('')).toBe(false);
    expect(isRejectableCommand('castReq')).toBe(false); // wrong case
    expect(isRejectableCommand('ClaimQuestRewards')).toBe(false); // typo
    expect(isRejectableCommand('NotARealCommand')).toBe(false);
  });
});

describe('rejectableCommandSchema (Zod) — wire-boundary enforcement', () => {
  it('accepts every registry entry', () => {
    for (const cmd of REJECTABLE_COMMANDS) {
      expect(rejectableCommandSchema.safeParse(cmd).success).toBe(true);
    }
  });

  it('rejects an unknown commandType', () => {
    expect(rejectableCommandSchema.safeParse('NotARealCommand').success).toBe(false);
  });
});

describe('commandRejectedSchema — full envelope', () => {
  it('accepts a valid envelope with a registered commandType', () => {
    const parsed = commandRejectedSchema.safeParse({
      type: 'CommandRejected',
      commandType: 'LearnSkill',
      reason: 'levelTooLow',
      requestId: 42,
      targetId: 'iceBolt',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an envelope with an out-of-registry commandType (Archwork #3 guard)', () => {
    const parsed = commandRejectedSchema.safeParse({
      type: 'CommandRejected',
      commandType: 'CastRequest', // typo for 'CastReq'
      reason: 'cooldown',
    });
    expect(parsed.success).toBe(false);
  });
});
