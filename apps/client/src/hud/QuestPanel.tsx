import { useMemo, useState } from 'react';
import { getMiniBossById } from '../../../../packages/content/miniBosses';
import { getMobZones } from '../../../../packages/content/mobLocations';
import { QUEST_NPCS } from '../../../../packages/content/npcs';
import { QUESTS, type QuestDef } from '../../../../packages/content/quests';
import { GAME_ZONES } from '../../../../packages/content/zones';
import type { PlayerEntity } from '../gameTypes';
import { useDraggablePanel } from './useDraggablePanel';

type QuestPanelProps = {
  player: PlayerEntity | null;
  onCancelQuest: (questId: string) => void;
  onAdvanceQuest: (questId: string) => void;
  onClaimQuestReward: (questId: string) => void;
  onShowMarker: (pos: { x: number; z: number } | null) => void;
};

export function QuestPanel({
  player,
  onCancelQuest,
  onAdvanceQuest,
  onClaimQuestReward,
  onShowMarker,
}: QuestPanelProps) {
  const panelRef = useDraggablePanel<HTMLElement>('quest');
  const activeIds = useMemo(() => Object.keys(player?.questState?.active ?? {}), [player?.questState]);
  const completed = player?.questState?.completed ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedQuest = selectedId ? QUESTS[selectedId] : null;
  const selectedEntry = selectedId ? player?.questState?.active?.[selectedId] : null;

  return (
    <section ref={panelRef} className="quest-panel" aria-label="Quests">
      <div className="panel-title">
        <strong>Quests</strong>
        <span>{activeIds.length} active · {completed.length} done</span>
      </div>
      <div className="quest-panel-body">
        <ul className="quest-list">
          {activeIds.length === 0 && (
            <li className="quest-list-empty">No active quests. Find an NPC with a quest mark.</li>
          )}
          {activeIds.map((id) => {
            const quest = QUESTS[id];
            const entry = player?.questState?.active?.[id];
            if (!quest || !entry) return null;
            const ready = entry.readyToClaim ?? false;
            return (
              <li
                key={id}
                className={`quest-list-item${selectedId === id ? ' quest-list-item--selected' : ''}${ready ? ' quest-list-item--ready' : ''}`}
              >
                <button type="button" className="quest-list-button" onClick={() => setSelectedId(id)}>
                  <strong>{quest.name}</strong>
                  <small>{quest.stages[entry.stageIndex]?.description ?? 'Complete!'}</small>
                </button>
              </li>
            );
          })}
        </ul>
        {selectedQuest && selectedEntry && (
          <QuestDetail
            quest={selectedQuest}
            entry={selectedEntry}
            onCancel={() => { onCancelQuest(selectedQuest.id); setSelectedId(null); }}
            onAdvance={() => onAdvanceQuest(selectedQuest.id)}
            onClaim={() => onClaimQuestReward(selectedQuest.id)}
            onShowMarker={onShowMarker}
          />
        )}
      </div>
    </section>
  );
}

function QuestDetail({
  quest,
  entry,
  onCancel,
  onAdvance,
  onClaim,
  onShowMarker,
}: {
  quest: QuestDef;
  entry: { stageIndex: number; progress: number; readyToClaim?: boolean };
  onCancel: () => void;
  onAdvance: () => void;
  onClaim: () => void;
  onShowMarker: (pos: { x: number; z: number } | null) => void;
}) {
  const stage = quest.stages[entry.stageIndex];
  const giver = QUEST_NPCS[quest.npcId];
  const markerPos = stage ? resolveStageMarker(stage, giver?.position ?? null) : null;
  const objectiveLabel = stage ? describeObjective(stage.objective, entry.progress) : '';
  const isLastStage = entry.stageIndex === quest.stages.length - 1;
  return (
    <div className="quest-detail">
      <header><strong>{quest.name}</strong></header>
      <p>{quest.description}</p>
      {giver && <small>From: {giver.name}</small>}
      <div className="quest-detail-stage">
        <strong>Stage {entry.stageIndex + 1}/{quest.stages.length}: {stage?.description}</strong>
        <small>{objectiveLabel}</small>
      </div>
      <div className="quest-detail-rewards">
        <small>
          Reward:
          {quest.reward.xp ? ` ${quest.reward.xp} XP` : ''}
          {quest.reward.gold ? ` · ${quest.reward.gold} gold` : ''}
          {quest.reward.items?.length ? ` · ${quest.reward.items.length} item(s)` : ''}
        </small>
      </div>
      <div className="quest-detail-actions">
        <button type="button" onClick={onCancel}>Cancel</button>
        {markerPos && (
          <button type="button" onClick={() => onShowMarker({ x: markerPos.x, z: markerPos.z })}>
            Show on map
          </button>
        )}
        {entry.readyToClaim ? (
          <button type="button" className="quest-claim" onClick={onClaim}>Claim reward</button>
        ) : (
          <button type="button" onClick={onAdvance}>
            {isLastStage ? 'Done' : 'Next'}
          </button>
        )}
      </div>
    </div>
  );
}

function describeObjective(
  objective: QuestDef['stages'][number]['objective'],
  progress: number,
): string {
  switch (objective.kind) {
    case 'kill':
      return `${progress}/${objective.count} ${objective.enemyType}s`;
    case 'kill_boss': {
      const boss = getMiniBossById(objective.bossId);
      return progress >= 1
        ? `${boss?.name ?? objective.bossId} slain — press Next`
        : `Slay ${boss?.name ?? objective.bossId}`;
    }
    case 'reach':
      return progress >= 1 ? 'At waypoint — press Next' : 'Travel to the marker';
    case 'talk':
      return progress >= 1 ? 'Spoke to NPC — press Next' : `Return to ${objective.npcId}`;
    case 'manual':
      return 'Manual step — press Next when ready';
    default:
      return '';
  }
}

/**
 * PR Z — pick the most useful map pin for the current quest stage.
 *  - explicit marker wins
 *  - reach → the waypoint
 *  - talk → that NPC's position
 *  - kill_boss → the boss's spawn coord (PR V)
 *  - kill → the first zone the mob spawns in (zone center)
 *  - manual / fallback → the quest giver
 */
function resolveStageMarker(
  stage: QuestDef['stages'][number],
  giverPos: { x: number; y: number; z: number } | null,
): { x: number; z: number } | null {
  if (stage.marker) return { x: stage.marker.x, z: stage.marker.z };
  const obj = stage.objective;
  if (obj.kind === 'reach') return { x: obj.position.x, z: obj.position.z };
  if (obj.kind === 'talk') {
    const npc = QUEST_NPCS[obj.npcId];
    if (npc) return { x: npc.position.x, z: npc.position.z };
  }
  if (obj.kind === 'kill_boss') {
    const boss = getMiniBossById(obj.bossId);
    const zone = boss ? GAME_ZONES.find((z) => z.miniBoss?.id === boss.id) : null;
    const pos = zone?.miniBoss?.position;
    if (pos) return { x: pos.x, z: pos.z };
  }
  if (obj.kind === 'kill') {
    const zones = getMobZones(obj.enemyType);
    if (zones.length > 0) return { x: zones[0].position.x, z: zones[0].position.z };
  }
  return giverPos ? { x: giverPos.x, z: giverPos.z } : null;
}
