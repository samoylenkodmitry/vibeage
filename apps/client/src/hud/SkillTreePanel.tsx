import { useMemo } from 'react';
import {
  CLASS_SKILL_TREES,
  canLearnSkill,
  type CharacterClass,
} from '../../../../packages/content/classes';
import { SKILLS, type SkillId } from '../../../../packages/content/skills';
import type { PlayerEntity } from '../gameTypes';
import { capitalize, DEFAULT_CLASS_NAME } from './textUtils';
import { useDraggablePanel } from './useDraggablePanel';

type SkillTreePanelProps = {
  player: PlayerEntity | null;
  onLearnSkill: (skillId: SkillId) => void;
  rejections?: Record<string, string>;
};

type Row = {
  skillId: SkillId;
  name: string;
  status: 'unlocked' | 'available' | 'locked';
  detail: string;
};

const REJECTION_LABEL: Record<string, string> = {
  noSkillPoints: 'No skill points',
  levelTooLow: 'Level too low',
  missingPrereq: 'Missing prereq',
  unknownSkill: 'Unknown skill',
  wrongClass: 'Not for this class',
  alreadyKnown: 'Already known',
};

export function SkillTreePanel({ player, onLearnSkill, rejections }: SkillTreePanelProps) {
  const panelRef = useDraggablePanel<HTMLElement>('skill-tree');
  const rows = useMemo(() => buildSkillRows(player), [player]);
  const className = player?.className ?? DEFAULT_CLASS_NAME;
  const skillPoints = player?.availableSkillPoints ?? 0;

  return (
    <section ref={panelRef} className="skill-tree-panel" aria-label="Skill tree">
      <div className="panel-title">
        <strong>{capitalize(className)} Skills</strong>
        <span>{skillPoints} SP</span>
      </div>
      <ul className="skill-tree-list">
        {rows.map((row) => {
          const rejectReason = rejections?.[row.skillId];
          const rejectLabel = rejectReason ? (REJECTION_LABEL[rejectReason] ?? rejectReason) : '';
          return (
            <li key={row.skillId} className={`skill-tree-row skill-tree-row--${row.status}`}>
              <div className="skill-tree-row-head">
                <strong>{row.name}</strong>
                <small>{row.detail}</small>
              </div>
              {rejectLabel && <small className="skill-tree-reject">{rejectLabel}</small>}
              {row.status === 'available' && (
                <button
                  type="button"
                  className="learn-skill-button"
                  disabled={skillPoints <= 0}
                  onClick={() => onLearnSkill(row.skillId)}
                >
                  {skillPoints > 0 ? 'Learn' : 'Need SP'}
                </button>
              )}
              {row.status === 'unlocked' && <span className="skill-tree-tag">Owned</span>}
              {row.status === 'locked' && <span className="skill-tree-tag skill-tree-tag--locked">Locked</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function buildSkillRows(player: PlayerEntity | null): Row[] {
  const className = (player?.className ?? DEFAULT_CLASS_NAME) as CharacterClass;
  const tree = CLASS_SKILL_TREES[className] ?? CLASS_SKILL_TREES.mage;
  const level = player?.level ?? 1;
  const unlocked = player?.unlockedSkills ?? [];
  return Object.entries(tree.skillProgression).map(([skillId, req]) => {
    const id = skillId as SkillId;
    const skill = SKILLS[id];
    if (unlocked.includes(id)) {
      return { skillId: id, name: skill?.name ?? id, status: 'unlocked', detail: 'In your bar' };
    }
    if (canLearnSkill(id, className, level, unlocked)) {
      return { skillId: id, name: skill?.name ?? id, status: 'available', detail: `Required Lv ${req.level}` };
    }
    const reqSkills = req.requiredSkills?.length ? ` · needs ${req.requiredSkills.join(', ')}` : '';
    return { skillId: id, name: skill?.name ?? id, status: 'locked', detail: `Lv ${req.level}${reqSkills}` };
  });
}

