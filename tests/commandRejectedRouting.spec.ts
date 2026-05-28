import { describe, expect, it } from 'vitest';
import { gameClientReducer, initialGameClientState, COMMAND_REJECTED_ROUTE } from '../apps/client/src/gameReducer';
import { REJECTABLE_COMMANDS } from '../packages/protocol/commandRejections';
import type { GameClientState, PlayerEntity } from '../apps/client/src/gameTypes';

/**
 * Archwork #3 sub-work 4 — table-driven CommandRejected routing.
 *
 * Every `RejectableCommand` maps to exactly one UI sink in
 * `COMMAND_REJECTED_ROUTE`. The table is the single source of truth
 * for client-side rejection UX:
 *
 *   - 'combatLog'      → red line via apply*RejectedVisualState
 *   - 'skillTreeChip'  → per-skill chip in state.learnSkillRejections
 *   - 'chatInline'     → state.lastChatError under the chat input
 *   - 'silent'         → no UX (server-internal commands)
 *
 * These tests pin the table's coverage + the per-sink behaviour so
 * a future refactor of the registry (sub-work 3 follow-ups) can't
 * silently drop a route.
 */

const ME = 'me';

function makePlayer(id: string): PlayerEntity {
  return {
    id, name: id, isAlive: true, level: 1,
    unlockedSkills: [], skillLevels: {},
    availableSkillPoints: 1,
  } as unknown as PlayerEntity;
}

const baseState: GameClientState = {
  ...initialGameClientState,
  connectionState: 'online' as const,
  myPlayerId: ME,
  players: { [ME]: makePlayer(ME) },
};

describe('COMMAND_REJECTED_ROUTE — coverage', () => {
  it('every RejectableCommand has a route', () => {
    for (const cmd of REJECTABLE_COMMANDS) {
      expect(COMMAND_REJECTED_ROUTE[cmd], `${cmd} missing from COMMAND_REJECTED_ROUTE`).toBeDefined();
    }
  });

  it('every routed sink is a recognised value', () => {
    const valid = new Set(['combatLog', 'skillTreeChip', 'chatInline', 'silent']);
    for (const cmd of REJECTABLE_COMMANDS) {
      expect(valid.has(COMMAND_REJECTED_ROUTE[cmd]), `${cmd} → ${COMMAND_REJECTED_ROUTE[cmd]}`).toBe(true);
    }
  });
});

describe('routeCommandRejected — behaviour per sink', () => {
  it("combatLog: CastReq rejection prepends a combat-log line", () => {
    const next = gameClientReducer(baseState, {
      type: 'serverMessage', now: 100,
      message: { type: 'CommandRejected', commandType: 'CastReq', reason: 'cooldown', requestId: 1 },
    });
    expect(next.combatLog.length).toBeGreaterThan(0);
    expect(next.combatLog[0].text).toMatch(/cast/i);
  });

  it("combatLog: ClaimQuestReward (quest verb) prepends a combat-log line", () => {
    const next = gameClientReducer(baseState, {
      type: 'serverMessage', now: 100,
      message: { type: 'CommandRejected', commandType: 'ClaimQuestReward', reason: 'notNearNpc' },
    });
    expect(next.combatLog.length).toBeGreaterThan(0);
  });

  it("combatLog: GmCommand rejection prepends a combat-log line", () => {
    const next = gameClientReducer(baseState, {
      type: 'serverMessage', now: 100,
      message: { type: 'CommandRejected', commandType: 'GmCommand', reason: 'notGm' },
    });
    expect(next.combatLog.length).toBeGreaterThan(0);
    expect(next.combatLog[0].text).toMatch(/GM command rejected/i);
  });

  it("skillTreeChip: LearnSkill rejection writes to state.learnSkillRejections keyed by targetId", () => {
    const next = gameClientReducer(baseState, {
      type: 'serverMessage', now: 100,
      message: { type: 'CommandRejected', commandType: 'LearnSkill', reason: 'levelTooLow', targetId: 'iceBolt' },
    });
    expect(next.learnSkillRejections.iceBolt).toBe('levelTooLow');
  });

  it("skillTreeChip: LearnSkill rejection without targetId is a silent drop (defensive)", () => {
    const next = gameClientReducer(baseState, {
      type: 'serverMessage', now: 100,
      message: { type: 'CommandRejected', commandType: 'LearnSkill', reason: 'levelTooLow' },
    });
    expect(next.learnSkillRejections).toEqual({});
  });

  it("chatInline: ChatRequest rejection populates state.lastChatError", () => {
    const next = gameClientReducer(baseState, {
      type: 'serverMessage', now: 100,
      message: { type: 'CommandRejected', commandType: 'ChatRequest', reason: 'rateLimited' },
    });
    expect(next.lastChatError).toEqual({ reason: 'rateLimited', at: 100 });
  });

  it("silent: SelectClass rejection produces no state change", () => {
    const next = gameClientReducer(baseState, {
      type: 'serverMessage', now: 100,
      message: { type: 'CommandRejected', commandType: 'SelectClass', reason: 'notGm' },
    });
    expect(next.combatLog).toEqual(baseState.combatLog);
    expect(next.learnSkillRejections).toEqual(baseState.learnSkillRejections);
    expect(next.lastChatError).toBe(baseState.lastChatError);
  });

});
