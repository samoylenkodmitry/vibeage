import { useMemo } from 'react';
import { getAvailableSkills } from '../../../../packages/content/classes';
import { SKILLS, type SkillId } from '../../../../packages/content/skills';
import { STARTER_PATH_GOALS } from '../../../../packages/protocol/messages';
import type { PlayerEntity, StarterProgress } from '../gameTypes';

type StarterProgressPanelProps = {
  player: PlayerEntity | null;
  progress: StarterProgress;
  onLearnSkill: (skillId: SkillId) => void;
};

export function StarterProgressPanel({ player, progress, onLearnSkill }: StarterProgressPanelProps) {
  const nextSkill = useMemo(() => {
    if (!player || player.availableSkillPoints <= 0) {
      return null;
    }

    return getAvailableSkills(player.className, player.level, player.unlockedSkills)[0] ?? null;
  }, [player]);
  const defeated = Math.min(progress.defeatedEnemies, STARTER_PATH_GOALS.defeatedEnemies);
  const gathered = Math.min(progress.lootPickups, STARTER_PATH_GOALS.lootPickups);
  const levelReached = Math.max(player?.level ?? 1, progress.levelReached);
  const status = progress.rewardGranted ? 'Rewarded' : progress.isComplete ? 'Complete' : 'Active';

  return (
    <section className="starter-progress" aria-label="Starter progress">
      <div className="panel-title">
        <strong>Starter Path</strong>
        <span>{status}</span>
      </div>
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
    </section>
  );
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
