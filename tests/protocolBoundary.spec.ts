import { describe, expect, test } from 'vitest';
import { clientMessageSchema, type ClientMessage } from '../packages/protocol/clientMessages';
import {
  learnSkillFailedReasonSchema,
  learnSkillFailedSchema,
} from '../packages/protocol/serverMessages';
import { WORLD_CLIENT_COMMAND_TYPES } from '../server/transport/roomBoundary';

type ClientMessageType = ClientMessage['type'];

function collectClientMessageTypes(): readonly ClientMessageType[] {
  // ZodDiscriminatedUnion exposes its option schemas via the public `.options`
  // property so the test stays exhaustive when a new command is added.
  return clientMessageSchema.options.map(
    (option) => (option.shape.type as { value: ClientMessageType }).value,
  );
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

  test('LearnSkillFailed schema accepts every reason its enum defines', () => {
    // Derive the reason list straight from the schema so this stays exhaustive.
    const reasons = learnSkillFailedReasonSchema.options;
    expect(reasons.length).toBeGreaterThan(0);
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
