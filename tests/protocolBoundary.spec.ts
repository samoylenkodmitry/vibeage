import { describe, expect, test } from 'vitest';
import { clientMessageSchema, type ClientMessage } from '../packages/protocol/clientMessages';
import {
  commandRejectedSchema,
  learnSkillFailedReasonSchema,
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

  // §52 #1 — LearnSkillFailed retired; the reason enum still lives
  // because it pins the server-side validation shape, but the wire
  // shape is now CommandRejected. These two cases now exercise that
  // every reason still parses on the envelope.
  test('CommandRejected accepts every LearnSkill reason (with targetId carrying the skillId)', () => {
    const reasons = learnSkillFailedReasonSchema.options;
    expect(reasons.length).toBeGreaterThan(0);
    for (const reason of reasons) {
      const parsed = commandRejectedSchema.safeParse({
        type: 'CommandRejected',
        commandType: 'LearnSkill',
        reason,
        targetId: 'fireball',
      });
      expect(parsed.success).toBe(true);
    }
  });

  test('CommandRejected accepts any reason string (intentionally — per-command enums live server-side)', () => {
    // The envelope is generic; per-command reason enums are validated
    // by handlers, not the schema. This is a regression-net for that
    // intentional shape: the schema does NOT pin per-command enums.
    const parsed = commandRejectedSchema.safeParse({
      type: 'CommandRejected',
      commandType: 'LearnSkill',
      reason: 'something_weird',
    });
    expect(parsed.success).toBe(true);
  });
});
