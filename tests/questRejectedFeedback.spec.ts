import { describe, expect, it } from 'vitest';
import {
  applyQuestRejectedVisualState,
  QUEST_VERB_COMMANDS,
} from '../apps/client/src/clientVisualState';
import type { GameClientState } from '../apps/client/src/gameTypes';
import type { ServerMessage } from '../packages/protocol/messages';

/**
 * §52 playtest follow-up — surface quest-verb CommandRejecteds in
 * the combat log so a player who clicks Claim/Next/Cancel and gets
 * nothing back sees *why* (out of range, not ready, …) instead of
 * thinking the button is broken.
 *
 * These tests pin the message copy + the set of commandTypes that
 * route through this feedback path. New quest verbs added to the
 * set without copy will fall through to a generic "Quest action
 * failed: <type> (<reason>)." string — proven by the last case.
 */

function emptyState(): GameClientState {
  return {
    enemies: {}, players: {}, combatLog: [],
  } as unknown as GameClientState;
}

type RejectMsg = ServerMessage & { type: 'CommandRejected' };
function rejectMsg(commandType: RejectMsg['commandType'], reason: string): RejectMsg {
  return { type: 'CommandRejected', commandType, reason };
}

describe('QUEST_VERB_COMMANDS', () => {
  it('contains the four quest commands the server emits rejections for', () => {
    expect(QUEST_VERB_COMMANDS.has('AcceptQuest')).toBe(true);
    expect(QUEST_VERB_COMMANDS.has('CancelQuest')).toBe(true);
    expect(QUEST_VERB_COMMANDS.has('AdvanceQuest')).toBe(true);
    expect(QUEST_VERB_COMMANDS.has('ClaimQuestReward')).toBe(true);
  });
  it('does NOT contain unrelated CommandRejected types (those have their own UI)', () => {
    expect(QUEST_VERB_COMMANDS.has('BuyFromVendor')).toBe(false);
    expect(QUEST_VERB_COMMANDS.has('EquipItem')).toBe(false);
    expect(QUEST_VERB_COMMANDS.has('GmCommand')).toBe(false);
  });
});

describe('applyQuestRejectedVisualState — combat-log copy', () => {
  it('claim out of range → "Walk back to the quest giver…" so the player knows where to go', () => {
    const next = applyQuestRejectedVisualState(emptyState(), rejectMsg('ClaimQuestReward', 'notNearNpc'), 0);
    expect(next.combatLog[0].text).toBe('Walk back to the quest giver to claim the reward.');
  });
  it('claim before ready → "That quest isn\'t ready to turn in yet."', () => {
    const next = applyQuestRejectedVisualState(emptyState(), rejectMsg('ClaimQuestReward', 'notReady'), 0);
    expect(next.combatLog[0].text).toBe("That quest isn't ready to turn in yet.");
  });
  it('claim with no entry → "That quest isn\'t active."', () => {
    const next = applyQuestRejectedVisualState(emptyState(), rejectMsg('ClaimQuestReward', 'notActive'), 0);
    expect(next.combatLog[0].text).toBe("That quest isn't active.");
  });
  it('advance with stage incomplete → "The objective isn\'t complete yet."', () => {
    const next = applyQuestRejectedVisualState(emptyState(), rejectMsg('AdvanceQuest', 'noEffect'), 0);
    expect(next.combatLog[0].text).toBe("The objective isn't complete yet.");
  });
  it('falls through to generic copy for an unknown reason — does not throw', () => {
    const next = applyQuestRejectedVisualState(emptyState(), rejectMsg('ClaimQuestReward', 'weirdNewReason'), 0);
    expect(next.combatLog[0].text).toContain('Quest action failed: ClaimQuestReward');
    expect(next.combatLog[0].text).toContain('weirdNewReason');
  });
});
