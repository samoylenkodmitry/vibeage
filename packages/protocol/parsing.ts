import { z } from 'zod';
import { clientMessageSchema, type ClientMessage } from './clientMessages.js';
import { serverMessageSchema, type ServerMessage } from './serverMessages.js';

export function describeProtocolError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ');
}

export type ProtocolParseResult<T> =
  | { success: true; data: T; error?: never }
  | { success: false; data?: never; error: z.ZodError };

export function safeParseClientMessage(message: unknown): ProtocolParseResult<ClientMessage> {
  return clientMessageSchema.safeParse(message) as ProtocolParseResult<ClientMessage>;
}

export function safeParseServerMessage(message: unknown): ProtocolParseResult<ServerMessage> {
  return serverMessageSchema.safeParse(message) as ProtocolParseResult<ServerMessage>;
}
