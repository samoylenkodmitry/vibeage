import { useMemo, useState, type ReactElement } from 'react';
import { getAvailableSkills } from '../../../../packages/content/classes';
import { SKILLS, type SkillId } from '../../../../packages/content/skills';
import { STARTER_PATH_GOALS } from '../../../../packages/protocol/messages';
import type { PlayerEntity, StarterProgress } from '../gameTypes';
import { useDraggablePanel } from './useDraggablePanel';

type StarterProgressPanelProps = {
  player: PlayerEntity | null;
  progress: StarterProgress;
  onLearnSkill: (skillId: SkillId) => void;
};

type QuestEntry = {
  id: string;
  title: string;
  status: string;
  renderDetails: () => ReactElement;
};

export function StarterProgressPanel({ player, progress, onLearnSkill }: StarterProgressPanelProps) {
  const panelRef = useDraggablePanel<HTMLElement>('starter');
  const nextSkill = useMemo(() => {
    if (!player || player.availableSkillPoints <= 0) {
      return null;
    }
    return getAvailableSkills(player.className, player.level, player.unlockedSkills)[0] ?? null;
  }, [player]);

  const quests = buildQuestList({ player, progress, nextSkill, onLearnSkill });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([quests[0]?.id].filter(Boolean) as string[]));

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <section ref={panelRef} className="starter-progress quest-panel" aria-label="Starter progress">
      <div className="panel-title">
        <strong>Quests</strong>
        <span>{quests.length}</span>
      </div>
      <ul className="quest-list">
        {quests.map((quest) => {
          const isOpen = expanded.has(quest.id);
          return (
            <li key={quest.id} className={`quest-item${isOpen ? ' quest-item--open' : ''}`}>
              <label className="quest-row">
                <input
                  type="checkbox"
                  checked={isOpen}
                  onChange={() => toggle(quest.id)}
                  aria-label={isOpen ? `Hide ${quest.title} details` : `Show ${quest.title} details`}
                />
                <span className="quest-title">{quest.title}</span>
                <small className="quest-status">{quest.status}</small>
              </label>
              {isOpen && <div className="quest-details">{quest.renderDetails()}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function buildQuestList({
  player,
  progress,
  nextSkill,
  onLearnSkill,
}: {
  player: PlayerEntity | null;
  progress: StarterProgress;
  nextSkill: SkillId | null;
  onLearnSkill: (skillId: SkillId) => void;
}): QuestEntry[] {
  const defeated = Math.min(progress.defeatedEnemies, STARTER_PATH_GOALS.defeatedEnemies);
  const gathered = Math.min(progress.lootPickups, STARTER_PATH_GOALS.lootPickups);
  const levelReached = Math.max(player?.level ?? 1, progress.levelReached);
  const starterStatus = progress.rewardGranted ? 'Rewarded' : progress.isComplete ? 'Complete' : 'Active';

  return [
    {
      id: 'starter-path',
      title: 'Starter Path',
      status: starterStatus,
      renderDetails: () => (
        <>
          <ObjectiveRow label="Defeat" value={defeated} max={STARTER_PATH_GOALS.defeatedEnemies} />
          <ObjectiveRow label="Gather" value={gathered} max={STARTER_PATH_GOALS.lootPickups} />
          <ObjectiveRow label="Reach L2" value={levelReached >= STARTER_PATH_GOALS.levelReached ? 1 : 0} max={1} />
          {nextSkill ? (
            <button type="button" className="learn-skill-button" onClick={() => onLearnSkill(nextSkill)}>
              Learn {SKILLS[nextSkill].name}
            </button>
          ) : (
            <small>{player?.availableSkillPoints ? 'No skill ready' : 'No skill points'}</small>
          )}
        </>
      ),
    },
  ];
}

function ObjectiveRow({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="objective-row">
      <span>{label}</span>
      <div className="meter-track">
        <div className="meter-fill meter-objective" style={{ width: `${getMeterProgress(value, max)}%` }} />
      </div>
      <strong>{value}/{max}</strong>
    </div>
  );
}

function getMeterProgress(value: number | undefined, max: number | undefined): number {
  if (!value || !max || max <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, (value / max) * 100));
}
