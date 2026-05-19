import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  clientMessageSchema,
  type ClientMessage,
} from '../packages/protocol/clientMessages';
import {
  learnSkillFailedReasonSchema,
  nonEffectServerMessageSchema,
  serverMessageSchema,
  type LearnSkillFailedReason,
  type ServerMessage,
} from '../packages/protocol/serverMessages';

/**
 * Drift detector for the protocol layer.
 *
 * Each message type lives in two places: a Zod schema (parser at the wire
 * boundary) and a TypeScript type (compile-time guarantee in handlers). When
 * the two drift apart — as happened in PR #100 with `LearnSkillFailed` — the
 * router still accepts the message but downstream code can crash on
 * unexpected shapes.
 *
 * These tests pin the discriminator literals on both sides and require any
 * future addition / rename / removal to touch the literal allow-list below,
 * forcing a conscious decision rather than silent drift.
 */

/**
 * Each map below is typed as `Record<Union, true>` so the compiler refuses
 * to build if a new variant is added to the TS union without a matching key
 * here — exhaustiveness is enforced at typecheck time, not just test time.
 */
const CLIENT_MESSAGE_TYPES: Record<ClientMessage['type'], true> = {
  MoveIntent: true,
  CastReq: true,
  LearnSkill: true,
  SetSkillShortcut: true,
  SelectClass: true,
  SelectRace: true,
  RespawnRequest: true,
  LootPickup: true,
  UseItem: true,
  CraftItem: true,
  RequestInventory: true,
  DevTeleport: true,
  ChatRequest: true,
  EquipItem: true,
  UnequipItem: true,
  SelectSpecialization: true,
  UpgradeSkill: true,
  TalkNpc: true,
  AcceptQuest: true,
  CancelQuest: true,
  AdvanceQuest: true,
  ClaimQuestReward: true,
  BuyFromVendor: true,
  SellToVendor: true,
  GmCommand: true,
};
const CLIENT_MESSAGE_TYPE_LITERALS = Object.keys(CLIENT_MESSAGE_TYPES) as ClientMessage['type'][];

const SERVER_MESSAGE_TYPES: Record<ServerMessage['type'], true> = {
  PosSnap: true,
  InstantHit: true,
  SkillLearned: true,
  SkillShortcutUpdated: true,
  ClassSelected: true,
  CastFail: true,
  CastSnapshot: true,
  EffectSnapshot: true,
  CombatLog: true,
  EnemyAttack: true,
  BossTelegraph: true,
  InventoryUpdate: true,
  LootAcquired: true,
  StarterProgressUpdate: true,
  LootPickup: true,
  LootSpawn: true,
  ItemUsed: true,
  BatchUpdate: true,
  ChatBroadcast: true,
  EquipmentUpdate: true,
  EquipFailed: true,
  LearnSkillFailed: true,
};
const SERVER_MESSAGE_TYPE_LITERALS = Object.keys(SERVER_MESSAGE_TYPES) as ServerMessage['type'][];

const LEARN_SKILL_FAILED_REASON_MAP: Record<LearnSkillFailedReason, true> = {
  noSkillPoints: true,
  levelTooLow: true,
  missingPrereq: true,
  unknownSkill: true,
  wrongClass: true,
  alreadyKnown: true,
};
const LEARN_SKILL_FAILED_REASONS = Object.keys(LEARN_SKILL_FAILED_REASON_MAP) as LearnSkillFailedReason[];

function discriminatorLiteralsFromOptions(options: readonly z.ZodTypeAny[]): string[] {
  return options
    .map((opt) => {
      const shape = (opt as z.ZodObject<z.ZodRawShape>).shape?.type;
      if (shape instanceof z.ZodLiteral) {
        return shape.value as string;
      }
      return null;
    })
    .filter((v): v is string => typeof v === 'string')
    .sort();
}

describe('protocol type ↔ schema drift', () => {
  it('clientMessageSchema discriminator literals match the ClientMessage TS union exactly', () => {
    const schemaLiterals = discriminatorLiteralsFromOptions(clientMessageSchema.options).sort();
    const tsLiterals = [...CLIENT_MESSAGE_TYPE_LITERALS].sort();
    expect(schemaLiterals).toEqual(tsLiterals);
  });

  it('nonEffectServerMessageSchema discriminator literals are a subset of ServerMessage TS union', () => {
    const schemaLiterals = discriminatorLiteralsFromOptions(nonEffectServerMessageSchema.options);
    const tsSet = new Set<string>(SERVER_MESSAGE_TYPE_LITERALS);
    const orphans = schemaLiterals.filter(l => !tsSet.has(l));
    expect(orphans, `schema literals not present in ServerMessage TS union: ${orphans.join(', ')}`).toEqual([]);
  });

  it('ServerMessage TS union literals all parse as some serverMessageSchema variant', () => {
    // Every TS literal must round-trip through the wire boundary: build a
    // minimal payload, parse it, check it isn't rejected for an unknown
    // discriminator. Only `type` is asserted — field-level drift is covered
    // separately in protocol.schemas.spec.ts.
    const minimal: Record<string, Record<string, unknown>> = {
      PosSnap: { id: 'x', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, snapTs: 1 },
      InstantHit: { skillId: 'fireball', origin: { x: 0, y: 0, z: 0 }, targetPos: { x: 0, y: 0, z: 0 }, hitIds: [] },
      SkillLearned: { skillId: 'fireball', remainingPoints: 0 },
      SkillShortcutUpdated: { slotIndex: 0, skillId: null },
      ClassSelected: { className: 'mage', baseStats: { healthMultiplier: 1, manaMultiplier: 1, damageMultiplier: 1, speedMultiplier: 1 } },
      CastFail: { clientSeq: 0, reason: 'cooldown' },
      CastSnapshot: { data: { castId: 'c', casterId: 'p', skillId: 'fireball', state: 0, origin: { x: 0, z: 0 }, pos: { x: 0, z: 0 }, startedAt: 0, castTimeMs: 0, progressMs: 0 } },
      EffectSnapshot: { targetId: 't', effects: [] },
      CombatLog: { castId: 'c', skillId: 'fireball', casterId: 'p', targets: [], damages: [] },
      EnemyAttack: { enemyId: 'e', targetId: 't', damage: 1 },
      BossTelegraph: { enemyId: 'e', bossName: 'B', abilityName: 'A', x: 0, z: 0, radius: 5, windUpMs: 1500, impactAt: 1 },
      InventoryUpdate: { inventory: [], maxInventorySlots: 20 },
      LootAcquired: { items: [] },
      StarterProgressUpdate: { progress: { defeatedEnemies: 0, defeatedEnemyIds: [], lootPickups: 0, levelReached: 1, learnedSkills: 0, isComplete: false, rewardGranted: false } },
      LootPickup: { lootId: 'l', playerId: 'p' },
      LootSpawn: { enemyId: 'e', loot: [] },
      ItemUsed: { slotIndex: 0, itemId: 'health_potion', newQuantity: 0 },
      BatchUpdate: { updates: [] },
      ChatBroadcast: { fromId: 'p', fromName: 'n', text: 'hi', scope: 'all', ts: 1 },
      EquipmentUpdate: { equipment: [] },
      EquipFailed: { reason: 'nope' },
      LearnSkillFailed: { skillId: 'fireball', reason: 'noSkillPoints' },
    };

    const unaccepted: string[] = [];
    for (const literal of SERVER_MESSAGE_TYPE_LITERALS) {
      const payload = { type: literal, ...minimal[literal] };
      const result = serverMessageSchema.safeParse(payload);
      if (!result.success) {
        unaccepted.push(`${literal}: ${result.error.issues.map(i => i.message).join('; ')}`);
      }
    }
    expect(unaccepted, `these TS literals failed to parse via serverMessageSchema:\n  ${unaccepted.join('\n  ')}`).toEqual([]);
  });

  it('LearnSkillFailedReason zod enum and TS type stay in sync', () => {
    const schemaReasons = [...learnSkillFailedReasonSchema.options].sort();
    const tsReasons = [...LEARN_SKILL_FAILED_REASONS].sort();
    expect(schemaReasons).toEqual(tsReasons);
  });
});

describe('protocol fuzz: client message hardening', () => {
  it('rejects NaN coordinates in MoveIntent', () => {
    const result = clientMessageSchema.safeParse({
      type: 'MoveIntent',
      id: 'p',
      targetPos: { x: Number.NaN, z: 0 },
      clientTs: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects Infinity coordinates in MoveIntent', () => {
    const result = clientMessageSchema.safeParse({
      type: 'MoveIntent',
      id: 'p',
      targetPos: { x: 0, z: Number.POSITIVE_INFINITY },
      clientTs: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects ChatRequest text over 240 chars', () => {
    const oversize = 'x'.repeat(241);
    const result = clientMessageSchema.safeParse({
      type: 'ChatRequest',
      text: oversize,
      scope: 'all',
      clientTs: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects ChatRequest with an unknown scope value', () => {
    const result = clientMessageSchema.safeParse({
      type: 'ChatRequest',
      text: 'hi',
      scope: 'global',
      clientTs: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects CastReq with a string skillId not in the enum', () => {
    const result = clientMessageSchema.safeParse({
      type: 'CastReq',
      id: 'p',
      skillId: 'not_a_real_skill',
      clientTs: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects SetSkillShortcut with slotIndex out of range', () => {
    const result = clientMessageSchema.safeParse({
      type: 'SetSkillShortcut',
      slotIndex: 99,
      skillId: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects SetSkillShortcut with non-integer slotIndex', () => {
    const result = clientMessageSchema.safeParse({
      type: 'SetSkillShortcut',
      slotIndex: 1.5,
      skillId: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects LearnSkillFailed via serverMessageSchema with an unknown reason', () => {
    const result = serverMessageSchema.safeParse({
      type: 'LearnSkillFailed',
      skillId: 'fireball',
      reason: 'invented-reason',
    });
    expect(result.success).toBe(false);
  });
});
