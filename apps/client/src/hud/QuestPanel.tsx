import { useMemo, useState } from 'react';
import { getMiniBossById } from '../../../../packages/content/miniBosses';
import { QUEST_NPCS } from '../../../../packages/content/npcs';
import { QUESTS, type QuestDef } from '../../../../packages/content/quests';
import type { PlayerEntity } from '../gameTypes';
import { resolveStageMarker } from './questMarkers';
import { useDraggablePanel } from './useDraggablePanel';

type QuestPanelProps = {
  player: PlayerEntity | null;
  trackedQuestId?: string | null;
  onCancelQuest: (questId: string) => void;
  onAdvanceQuest: (questId: string) => void;
  onClaimQuestReward: (questId: string) => void;
  onShowMarker: (pos: { x: number; z: number } | null) => void;
  onSetTrackedQuest?: (questId: string | null) => void;
};

export function QuestPanel({
  player,
  trackedQuestId,
  onCancelQuest,
  onAdvanceQuest,
  onClaimQuestReward,
  onShowMarker,
  onSetTrackedQuest,
}: QuestPanelProps) {
  const panelRef = useDraggablePanel<HTMLElement>('quest');
  const activeIds = useMemo(() => Object.keys(player?.questState?.active ?? {}), [player?.questState]);
  const completed = player?.questState?.completed ?? [];
  // Selection state in the panel doubles as the "tracked quest" for
  // the heads-up strip. Default to whatever the strip is already
  // tracking so opening the panel doesn't reset the user's choice.
  const [selectedId, setSelectedId] = useState<string | null>(trackedQuestId ?? null);
  const selectQuest = (id: string) => {
    setSelectedId(id);
    onSetTrackedQuest?.(id);
  };
  const selectedQuest = selectedId ? QUESTS[selectedId] : null;
  const selectedEntry = selectedId ? player?.questState?.active?.[selectedId] : null;

  return (
    <section ref={panelRef} className="quest-panel" aria-label="Quests">
      <div className="panel-title">
        <strong>Quests</strong>
        <span>{activeIds.length} active · {completed.length} done</span>
      </div>
      <div className="quest-panel-body">
        {/* §52 playtest — selected quest detail (with actions) renders
            ABOVE the quest list so Next / Claim / Cancel / Show-on-map
            stay visible no matter how long the active-quest list grows.
            Pre-this PR the detail sat below the list and tall lists
            pushed the action row off-screen. */}
        {selectedQuest && selectedEntry && (
          <QuestDetail
            quest={selectedQuest}
            entry={selectedEntry}
            onCancel={() => {
              onCancelQuest(selectedQuest.id);
              setSelectedId(null);
              onSetTrackedQuest?.(null);
            }}
            onAdvance={() => onAdvanceQuest(selectedQuest.id)}
            onClaim={() => onClaimQuestReward(selectedQuest.id)}
            onShowMarker={onShowMarker}
          />
        )}
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
                <button type="button" className="quest-list-button" onClick={() => selectQuest(id)}>
                  <strong>{quest.name}</strong>
                  <small>{quest.stages[entry.stageIndex]?.description ?? 'Complete!'}</small>
                </button>
              </li>
            );
          })}
        </ul>
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
      {/* §52 playtest — actions row first so it's the first thing the
          player sees when they open the panel + first child of the
          sticky-top container. */}
      <div className="quest-detail-actions">
        {entry.readyToClaim ? (
          <button type="button" className="quest-claim" onClick={onClaim}>Claim reward</button>
        ) : (
          <button type="button" className="quest-advance" onClick={onAdvance}>
            {isLastStage ? 'Done' : 'Next'}
          </button>
        )}
        {markerPos && (
          <button type="button" onClick={() => onShowMarker({ x: markerPos.x, z: markerPos.z })}>
            Show on map
          </button>
        )}
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
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

