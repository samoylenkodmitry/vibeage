import { useEffect, useMemo, useRef, useState } from 'react';
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
 * INTERACTION_RANGE of any quest-giving NPC.
 *
 * §52 playtest follow-up — explicit close via × button / Escape /
 * outside-click. Dismiss is per-NPC: re-entering range of the same
 * NPC re-opens, and a different NPC always opens fresh.
 */
export function NpcDialog({ player, onTalkNpc, onAcceptQuest, onBrowseVendor }: NpcDialogProps) {
  const nearbyNpc = useMemo(() => findNearbyNpc(player), [player?.position]);
  const [dismissedNpcId, setDismissedNpcId] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!nearbyNpc || nearbyNpc.id !== dismissedNpcId) setDismissedNpcId(null);
  }, [nearbyNpc, dismissedNpcId]);

  const isShown = Boolean(nearbyNpc) && nearbyNpc?.id !== dismissedNpcId;

  useEffect(() => {
    if (!isShown || !nearbyNpc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDismissedNpcId(nearbyNpc.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isShown, nearbyNpc]);

  useEffect(() => {
    if (!isShown || !nearbyNpc) return;
    const onPointer = (e: PointerEvent) => {
      const node = sectionRef.current;
      if (!node) return;
      if (e.target instanceof Node && node.contains(e.target)) return;
      setDismissedNpcId(nearbyNpc.id);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [isShown, nearbyNpc]);

  if (!player || !nearbyNpc || !isShown) return null;

  const offered = getQuestsOfferedBy(nearbyNpc.id);
  const active = player.questState?.active ?? {};
  const completed = player.questState?.completed ?? [];
  const available = offered.filter((q) => !active[q.id] && !completed.includes(q.id) && player.level >= q.minLevel);
  const activeHere = offered.filter((q) => active[q.id]);
  const vendor = getVendorByNpcId(nearbyNpc.id);
  return (
    <section
      ref={sectionRef}
      className="npc-dialog"
      aria-label={`Dialog with ${nearbyNpc.name}`}
    >
      <header>
        <strong>{nearbyNpc.name}</strong>
        <small>{nearbyNpc.title}</small>
        <button
          type="button"
          className="npc-dialog-close"
          aria-label="Close dialog"
          onClick={() => setDismissedNpcId(nearbyNpc.id)}
        >
          ×
        </button>
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

