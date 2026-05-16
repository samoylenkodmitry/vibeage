import { describe, expect, test } from 'vitest';
import { clientMessageSchema, type ClientMessage } from '../packages/protocol/clientMessages';
import {
  learnSkillFailedSchema,
  type LearnSkillFailedMsg,
} from '../packages/protocol/serverMessages';
import { WORLD_CLIENT_COMMAND_TYPES } from '../server/transport/roomBoundary';

type ClientMessageType = ClientMessage['type'];

function collectClientMessageTypes(): readonly ClientMessageType[] {
  // discriminatedUnion exposes its option schemas; pull the literal `type`
  // from each so the test is exhaustive even when a new command is added.
  const options = (clientMessageSchema as unknown as { _def: { options: Array<{ shape: { type: { value: ClientMessageType } } }> } })._def.options;
  return options.map((option) => option.shape.type.value);
}

describe('protocol boundary', () => {
  test('every ClientMessage schema type appears in WORLD_CLIENT_COMMAND_TYPES', () => {
    const schemaTypes = new Set(collectClientMessageTypes());
    const boundaryTypes = new Set<ClientMessageType>(WORLD_CLIENT_COMMAND_TYPES as readonly ClientMessageType[]);
    const missing: ClientMessageType[] = [];
    for (const type of schemaTypes) {
      if (!boundaryTypes.has(type)) {
        missing.push(type);
      }
    }
    expect(missing).toEqual([]);
  });

  test('no stale WORLD_CLIENT_COMMAND_TYPES entries that the schema does not declare', () => {
    const schemaTypes = new Set(collectClientMessageTypes());
    const extras = WORLD_CLIENT_COMMAND_TYPES.filter((type) => !schemaTypes.has(type as ClientMessageType));
    expect(extras).toEqual([]);
  });

  test('LearnSkillFailed schema accepts every reason in the TS union', () => {
    const reasons: LearnSkillFailedMsg['reason'][] = [
      'noSkillPoints',
      'levelTooLow',
      'missingPrereq',
      'unknownSkill',
      'wrongClass',
      'alreadyKnown',
    ];
    for (const reason of reasons) {
      const parsed = learnSkillFailedSchema.safeParse({
        type: 'LearnSkillFailed',
        skillId: 'fireball',
        reason,
      });
      expect(parsed.success).toBe(true);
    }
  });

  test('LearnSkillFailed schema rejects an unknown reason', () => {
    const parsed = learnSkillFailedSchema.safeParse({
      type: 'LearnSkillFailed',
      skillId: 'fireball',
      reason: 'something_weird',
    });
    expect(parsed.success).toBe(false);
  });
});
