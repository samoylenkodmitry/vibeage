import { describe, expect, it } from 'vitest';
import { onLearnSkill } from '../server/players/playerSkills';
import { applySkillUpgrade } from '../server/players/playerIdentity';
import { createTransientPlayer } from '../server/playerFactory';
import { createGameState } from '../server/gameState';
import { upsertActivePlayerSession } from '../server/players/playerSession';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { ServerMessage } from '../packages/protocol/messages';

/**
 * §4 / §52 — CommandRejected rollout for skill commands. Sibling of
 * `commandRejectedInventory.spec.ts`. Locks down:
 *
 *   - LearnSkill emits BOTH the legacy `LearnSkillFailed` and the
 *     new structured `CommandRejected` envelope, with `clientSeq`
 *     echoed back as `requestId`.
 *   - applySkillUpgrade returns a discriminated union with concrete
 *     reasons; the router converts each into a CommandRejected.
 */

function setupPlayer() {
  const state = createGameState();
  const player = createTransientPlayer('s1', 'tester');
  player.level = 10;
  player.availableSkillPoints = 3;
  upsertActivePlayerSession(state, new SpatialHashGrid(), player);
  return { state, player };
}

function captureMessages() {
  const all: ServerMessage[] = [];
  const direct = {
    send: (msg: ServerMessage) => { all.push(msg); },
  };
  return { all, direct };
}

function noopOutbound() {
  return { publish: () => undefined };
}

describe('CommandRejected — LearnSkill (§4 / §52)', () => {
  it('emits BOTH legacy LearnSkillFailed AND CommandRejected on a rejected learn', () => {
    const { state, player } = setupPlayer();
    const { all, direct } = captureMessages();
    onLearnSkill(
      { id: player.socketId! },
      direct,
      noopOutbound(),
      state,
      // Mage default; trying to learn a warrior-tree skill should be a wrong-class reject.
      { type: 'LearnSkill', skillId: 'powerStrike', clientSeq: 11 },
    );
    const legacy = all.find((m) => m.type === 'LearnSkillFailed');
    const rejected = all.find((m) => m.type === 'CommandRejected');
    expect(legacy, 'legacy LearnSkillFailed kept for migration').toBeDefined();
    expect(rejected, 'new CommandRejected envelope emitted').toBeDefined();
    if (rejected?.type === 'CommandRejected') {
      expect(rejected.commandType).toBe('LearnSkill');
      expect(rejected.reason).toBe('wrongClass');
      expect(rejected.requestId).toBe(11);
    }
  });

  it('omits requestId when the client did not supply clientSeq', () => {
    const { state, player } = setupPlayer();
    const { all, direct } = captureMessages();
    onLearnSkill(
      { id: player.socketId! },
      direct,
      noopOutbound(),
      state,
      { type: 'LearnSkill', skillId: 'powerStrike' },
    );
    const rejected = all.find((m) => m.type === 'CommandRejected');
    expect(rejected, 'new CommandRejected envelope emitted').toBeDefined();
    if (rejected?.type === 'CommandRejected') expect(rejected.requestId).toBeUndefined();
  });
});

describe('applySkillUpgrade — discriminated rejection (§4 / §52)', () => {
  it('returns { ok: false, reason: "skillNotLearned" } when the skill is not in unlockedSkills', () => {
    const { player } = setupPlayer();
    player.unlockedSkills = [];
    const result = applySkillUpgrade(player, 'fireball', noopOutbound());
    expect(result).toEqual({ ok: false, reason: 'skillNotLearned' });
  });

  it('returns { ok: false, reason: "noSkillPoints" } when the player has none', () => {
    const { player } = setupPlayer();
    player.unlockedSkills = ['fireball'];
    player.availableSkillPoints = 0;
    const result = applySkillUpgrade(player, 'fireball', noopOutbound());
    expect(result).toEqual({ ok: false, reason: 'noSkillPoints' });
  });

  it('returns { ok: true } on a successful upgrade and increments skillLevels', () => {
    const { player } = setupPlayer();
    player.unlockedSkills = ['fireball'];
    player.availableSkillPoints = 1;
    player.skillLevels = { fireball: 1 };
    const result = applySkillUpgrade(player, 'fireball', noopOutbound());
    expect(result).toEqual({ ok: true });
    expect(player.skillLevels?.fireball).toBe(2);
    expect(player.availableSkillPoints).toBe(0);
  });
});
