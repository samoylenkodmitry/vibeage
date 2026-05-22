import { describe, expect, it } from 'vitest';
import { QUEST_NPCS } from '../packages/content/npcs';
import { QUESTS } from '../packages/content/quests';
import {
  applyAcceptQuest,
  applyAdvanceQuest,
  applyCancelQuest,
  applyClaimQuestReward,
  onEnemyKilledForQuests,
  onTalkedToNpcForQuests,
} from '../server/players/playerQuests';
import { createTransientPlayer } from '../server/playerFactory';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';

function captureOutbound(): { events: OutboundEvent[]; sink: OutboundEventSink } {
  const events: OutboundEvent[] = [];
  return { events, sink: { publish: (e) => { events.push(e); } } };
}

function freshPlayerAt(npcId: string) {
  const player = createTransientPlayer('s1', 'tester');
  player.level = 20;
  const npc = QUEST_NPCS[npcId];
  if (npc) player.position = { ...npc.position };
  return player;
}

describe('quest catalog coverage', () => {
  it('every quest references an existing NPC', () => {
    for (const quest of Object.values(QUESTS)) {
      expect(QUEST_NPCS[quest.npcId], `quest ${quest.id} → ${quest.npcId}`).toBeDefined();
    }
  });
  it('every quest has at least one stage', () => {
    for (const quest of Object.values(QUESTS)) {
      expect(quest.stages.length, `quest ${quest.id}`).toBeGreaterThan(0);
    }
  });
  it('every kill_boss objective resolves to a known mini-boss', async () => {
    const { MINI_BOSSES } = await import('../packages/content/miniBosses');
    for (const quest of Object.values(QUESTS)) {
      for (const stage of quest.stages) {
        if (stage.objective.kind === 'kill_boss') {
          expect(
            MINI_BOSSES[stage.objective.bossId],
            `quest ${quest.id} stage ${stage.id} → unknown boss ${stage.objective.bossId}`,
          ).toBeDefined();
        }
      }
    }
  });
  it('every quest reward item resolves to a known ITEM', async () => {
    const { ITEMS } = await import('../packages/content/items');
    for (const quest of Object.values(QUESTS)) {
      for (const reward of quest.reward.items ?? []) {
        expect(ITEMS[reward.itemId], `quest ${quest.id} → unknown reward item ${reward.itemId}`).toBeDefined();
      }
    }
  });
});

describe('quest flow: kill -> talk -> claim', () => {
  it('completes the rats_in_the_cellar arc end-to-end', () => {
    const player = freshPlayerAt('warden_galen');
    const { sink } = captureOutbound();

    expect(applyAcceptQuest(player, 'rats_in_the_cellar', sink)).toBe(true);
    const entry = () => player.questState!.active['rats_in_the_cellar'];
    expect(entry().stageIndex).toBe(0);

    // 3 goblin kills advance the counter; stage advance once met.
    onEnemyKilledForQuests(player, 'goblin', sink);
    onEnemyKilledForQuests(player, 'goblin', sink);
    onEnemyKilledForQuests(player, 'goblin', sink);
    expect(entry().progress).toBe(3);
    expect(applyAdvanceQuest(player, 'rats_in_the_cellar', sink)).toBe(true);
    expect(entry().stageIndex).toBe(1);

    // Talk-objective auto-progress + advance becomes claim-ready.
    onTalkedToNpcForQuests(player, 'warden_galen', sink);
    expect(applyAdvanceQuest(player, 'rats_in_the_cellar', sink)).toBe(true);
    expect(entry().readyToClaim).toBe(true);

    // Claim grants xp and moves quest to completed.
    const xpBefore = player.experience;
    expect(applyClaimQuestReward(player, 'rats_in_the_cellar', sink)).toBe(true);
    expect(player.questState!.active['rats_in_the_cellar']).toBeUndefined();
    expect(player.questState!.completed).toContain('rats_in_the_cellar');
    expect(player.experience).toBeGreaterThan(xpBefore);
  });

  it('a second claim of the same quest does NOT double-grant rewards', () => {
    // ROADMAP L885 — quest rollback protection against duplicate
    // rewards. Once a claim removes the quest from `active` and
    // pushes to `completed`, a hostile or replayed ClaimQuestReward
    // for the same quest must not re-grant XP or items.
    const player = freshPlayerAt('warden_galen');
    const { sink } = captureOutbound();
    applyAcceptQuest(player, 'rats_in_the_cellar', sink);
    onEnemyKilledForQuests(player, 'goblin', sink);
    onEnemyKilledForQuests(player, 'goblin', sink);
    onEnemyKilledForQuests(player, 'goblin', sink);
    applyAdvanceQuest(player, 'rats_in_the_cellar', sink);
    onTalkedToNpcForQuests(player, 'warden_galen', sink);
    applyAdvanceQuest(player, 'rats_in_the_cellar', sink);

    // First claim succeeds + records XP.
    expect(applyClaimQuestReward(player, 'rats_in_the_cellar', sink)).toBe(true);
    const xpAfterFirst = player.experience;
    const goldAfterFirst = player.gold ?? 0;

    // Second claim returns false (no active entry) AND no further
    // mutation to xp / gold. The quest is in completed[], not active{},
    // so the readyToClaim gate fails fast.
    expect(applyClaimQuestReward(player, 'rats_in_the_cellar', sink)).toBe(false);
    expect(player.experience).toBe(xpAfterFirst);
    expect(player.gold ?? 0).toBe(goldAfterFirst);
    expect(player.questState!.completed).toContain('rats_in_the_cellar');
  });

  it('rejects accept when the player is not near the giver', () => {
    const player = createTransientPlayer('s2', 'tester2');
    player.level = 20;
    player.position = { x: 9999, y: 0, z: 9999 };
    const { sink } = captureOutbound();
    expect(applyAcceptQuest(player, 'rats_in_the_cellar', sink)).toBe(false);
  });

  it('cancel removes the quest from active', () => {
    const player = freshPlayerAt('warden_galen');
    const { sink } = captureOutbound();
    applyAcceptQuest(player, 'rats_in_the_cellar', sink);
    expect(applyCancelQuest(player, 'rats_in_the_cellar', sink)).toBe(true);
    expect(player.questState!.active['rats_in_the_cellar']).toBeUndefined();
  });

  it('advance is a no-op when the objective is not yet met', () => {
    const player = freshPlayerAt('warden_galen');
    const { sink } = captureOutbound();
    applyAcceptQuest(player, 'rats_in_the_cellar', sink);
    // No goblin kills yet — advance must refuse.
    expect(applyAdvanceQuest(player, 'rats_in_the_cellar', sink)).toBe(false);
  });

  it('kill hook ignores non-matching enemy types', () => {
    const player = freshPlayerAt('warden_galen');
    const { sink } = captureOutbound();
    applyAcceptQuest(player, 'rats_in_the_cellar', sink);
    onEnemyKilledForQuests(player, 'dragon', sink);
    expect(player.questState!.active['rats_in_the_cellar'].progress).toBe(0);
  });
});

describe('boss-hunt quest objective', () => {
  it('kill_boss ticks only when bossId matches', () => {
    const player = freshPlayerAt('bounty_broker_mira');
    const { sink } = captureOutbound();
    applyAcceptQuest(player, 'bounty_grakk', sink);
    const entry = () => player.questState!.active['bounty_grakk'];

    // A goblin (not the boss) doesn't progress the stage.
    onEnemyKilledForQuests(player, 'goblin', sink);
    expect(entry().progress).toBe(0);

    // Slaying a goblin with the wrong bossId still doesn't progress.
    onEnemyKilledForQuests(player, 'goblin', sink, 'old_greyfang');
    expect(entry().progress).toBe(0);

    // Slay Grakk — kill_boss bossId matches.
    onEnemyKilledForQuests(player, 'goblin', sink, 'grakk');
    expect(entry().progress).toBe(1);

    // Second kill is idempotent (kill_boss count is always 1).
    onEnemyKilledForQuests(player, 'goblin', sink, 'grakk');
    expect(entry().progress).toBe(1);

    // Stage 1 (talk back to Mira) auto-progresses on talk, then claim.
    expect(applyAdvanceQuest(player, 'bounty_grakk', sink)).toBe(true);
    expect(entry().stageIndex).toBe(1);
    onTalkedToNpcForQuests(player, 'bounty_broker_mira', sink);
    expect(applyAdvanceQuest(player, 'bounty_grakk', sink)).toBe(true);
    expect(entry().readyToClaim).toBe(true);
  });
});

describe('AcceptQuest rejection feedback (§49/M2)', () => {
  function feedbackText(events: OutboundEvent[]): string | null {
    for (const e of events) {
      if (e.type !== 'directServerMessage') continue;
      if (e.message.type !== 'ChatBroadcast') continue;
      if (e.message.fromId !== 'system') continue;
      return e.message.text;
    }
    return null;
  }

  it('sends a "too far" chat when the player is not near the NPC', () => {
    const player = freshPlayerAt('warden_galen');
    // Move 1000 metres away so the interaction check fails.
    player.position = { x: player.position.x + 1000, y: 0.5, z: player.position.z };
    const { events, sink } = captureOutbound();
    expect(applyAcceptQuest(player, 'rats_in_the_cellar', sink)).toBe(false);
    expect(feedbackText(events)).toMatch(/too far/i);
  });

  it('sends a "need level" chat when the player is under the minLevel', () => {
    const player = freshPlayerAt('bounty_broker_mira');
    player.level = 1;
    const { events, sink } = captureOutbound();
    expect(applyAcceptQuest(player, 'bounty_grakk', sink)).toBe(false);
    expect(feedbackText(events)).toMatch(/level/i);
  });
});
