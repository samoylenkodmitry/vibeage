import { describe, expect, it } from 'vitest';
import { applyClaimQuestReward } from '../server/players/playerQuests';
import { createTransientPlayer } from '../server/playerFactory';
import { QUEST_NPCS } from '../packages/content/npcs';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

// §49/M6 — quest claim toast. On a successful claim the server
// emits a system ChatBroadcast with the reward summary so the
// player sees what they just got without watching gold + bag tick.

function makeClaimReadyPlayer(): PlayerState {
  const player = createTransientPlayer('claim-socket', 'Claimer');
  const galen = QUEST_NPCS.warden_galen;
  player.position = { x: galen.position.x, y: galen.position.y, z: galen.position.z };
  // rats_in_the_cellar has 2 stages; we'll claim it.
  player.questState = {
    active: { rats_in_the_cellar: { stageIndex: 1, progress: 1, readyToClaim: true } },
    completed: [],
  };
  return player;
}

describe('applyClaimQuestReward emits a system ChatBroadcast', () => {
  it('broadcasts ✓ Quest — reward summary on success', () => {
    const player = makeClaimReadyPlayer();
    const events: OutboundEvent[] = [];
    const outbound: OutboundEventSink = { publish: (e) => events.push(e) };

    const ok = applyClaimQuestReward(player, 'rats_in_the_cellar', outbound, Date.now());

    expect(ok).toBe(true);
    const chat = events.find((e) => e.type === 'serverMessage' && (e.message as { type?: string }).type === 'ChatBroadcast') as
      | { type: 'serverMessage'; message: { type: 'ChatBroadcast'; fromId: string; fromName: string; text: string; scope: string } }
      | undefined;
    expect(chat).toBeDefined();
    expect(chat!.message.fromId).toBe('system');
    expect(chat!.message.fromName).toBe('Quest');
    expect(chat!.message.text).toContain('✓ Rats in the Cellar');
    expect(chat!.message.text).toContain('120 XP');
    expect(chat!.message.text).toContain('25g');
  });

  it('does not broadcast when the claim fails (not near NPC)', () => {
    const player = makeClaimReadyPlayer();
    player.position = { x: 9999, y: 0, z: 9999 };
    const events: OutboundEvent[] = [];
    const outbound: OutboundEventSink = { publish: (e) => events.push(e) };

    const ok = applyClaimQuestReward(player, 'rats_in_the_cellar', outbound, Date.now());

    expect(ok).toBe(false);
    const chat = events.find((e) => e.type === 'serverMessage' && (e.message as { type?: string }).type === 'ChatBroadcast');
    expect(chat).toBeUndefined();
  });
});
