import { useMemo } from 'react';
import { INTERACTION_RANGE, QUEST_NPCS, type QuestNpcDef } from '../../../../packages/content/npcs';
import { formatRewardSummary, getQuestsOfferedBy, type QuestDef } from '../../../../packages/content/quests';
import { getVendorByNpcId } from '../../../../packages/content/vendors';
import type { PlayerEntity } from '../gameTypes';

type NpcDialogProps = {
  player: PlayerEntity | null;
  onTalkNpc: (npcId: string) => void;
  onAcceptQuest: (questId: string) => void;
  onBrowseVendor?: (vendorId: string) => void;
};

/**
 * Floating dialog that appears when the player stands within
 * INTERACTION_RANGE of any quest-giving NPC. Shows the NPC's
 * offered quests filtered by player level and quest state (hides
 * already-active or completed quests). Accept button sends
 * AcceptQuest to the server. The dialog auto-hides on walk-away.
 *
 * Pure UI — list of quests comes from QUESTS data, gated by
 * minLevel + the player's questState.
 */
export function NpcDialog({ player, onTalkNpc, onAcceptQuest, onBrowseVendor }: NpcDialogProps) {
  const nearbyNpc = useMemo(() => findNearbyNpc(player), [player?.position]);
  if (!player || !nearbyNpc) return null;
  const offered = getQuestsOfferedBy(nearbyNpc.id);
  const active = player.questState?.active ?? {};
  const completed = player.questState?.completed ?? [];
  const available = offered.filter((q) => !active[q.id] && !completed.includes(q.id) && player.level >= q.minLevel);
  const activeHere = offered.filter((q) => active[q.id]);
  const vendor = getVendorByNpcId(nearbyNpc.id);
  return (
    <section className="npc-dialog" aria-label={`Dialog with ${nearbyNpc.name}`}>
      <header>
        <strong>{nearbyNpc.name}</strong>
        <small>{nearbyNpc.title}</small>
      </header>
      <button type="button" onClick={() => onTalkNpc(nearbyNpc.id)} className="npc-dialog-talk">Greet</button>
      {vendor && onBrowseVendor && (
        <button type="button" onClick={() => onBrowseVendor(vendor.id)} className="npc-dialog-talk">Browse Wares</button>
      )}
      {available.length > 0 && (
        <div className="npc-dialog-section">
          <div className="npc-dialog-label">Offered</div>
          {available.map((q) => <OfferedRow key={q.id} quest={q} onAccept={() => onAcceptQuest(q.id)} />)}
        </div>
      )}
      {activeHere.length > 0 && (
        <div className="npc-dialog-section">
          <div className="npc-dialog-label">In Progress</div>
          {activeHere.map((q) => {
            const entry = active[q.id];
            return (
              <div key={q.id} className="npc-dialog-row">
                <strong>{q.name}</strong>
                <small>
                  Stage {entry.stageIndex + 1}/{q.stages.length}
                  {entry.readyToClaim ? ' · ready to claim' : ''}
                </small>
              </div>
            );
          })}
        </div>
      )}
      {available.length === 0 && activeHere.length === 0 && !vendor && (
        <small className="npc-dialog-empty">Nothing for you right now.</small>
      )}
    </section>
  );
}

function OfferedRow({ quest, onAccept }: { quest: QuestDef; onAccept: () => void }) {
  const rewardSummary = formatRewardSummary(quest.reward);
  return (
    <div className="npc-dialog-row">
      <strong>{quest.name}</strong>
      <small>{quest.description}</small>
      {rewardSummary && <small className="npc-dialog-reward">Reward: {rewardSummary}</small>}
      <button type="button" onClick={onAccept}>Accept</button>
    </div>
  );
}

function findNearbyNpc(player: PlayerEntity | null): QuestNpcDef | null {
  if (!player) return null;
  for (const npc of Object.values(QUEST_NPCS)) {
    const dx = npc.position.x - player.position.x;
    const dz = npc.position.z - player.position.z;
    if (Math.hypot(dx, dz) <= INTERACTION_RANGE) return npc;
  }
  return null;
}

