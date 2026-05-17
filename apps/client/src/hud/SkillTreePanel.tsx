import { useMemo, useState } from 'react';
import {
  CLASS_SKILL_TREES,
  canLearnSkill,
  type CharacterClass,
} from '../../../../packages/content/classes';
import { SKILLS, type SkillDef, type SkillId } from '../../../../packages/content/skills';
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
  const [expandedId, setExpandedId] = useState<SkillId | null>(null);

  return (
    <section ref={panelRef} className="skill-tree-panel" aria-label="Skill tree">
      <div className="panel-title">
        <strong>{capitalize(className)} Skills</strong>
        <span>{skillPoints} SP</span>
      </div>
      <ul className="skill-tree-list">
        {rows.map((row) => (
          <SkillRow
            key={row.skillId}
            row={row}
            expanded={expandedId === row.skillId}
            rejectLabel={rejections?.[row.skillId] ? (REJECTION_LABEL[rejections[row.skillId]] ?? rejections[row.skillId]) : ''}
            skillPoints={skillPoints}
            onToggleExpand={() => setExpandedId((prev) => (prev === row.skillId ? null : row.skillId))}
            onLearnSkill={onLearnSkill}
          />
        ))}
      </ul>
    </section>
  );
}

function SkillRow({
  row,
  expanded,
  rejectLabel,
  skillPoints,
  onToggleExpand,
  onLearnSkill,
}: {
  row: Row;
  expanded: boolean;
  rejectLabel: string;
  skillPoints: number;
  onToggleExpand: () => void;
  onLearnSkill: (skillId: SkillId) => void;
}) {
  const skill = SKILLS[row.skillId];
  return (
    <li className={`skill-tree-row skill-tree-row--${row.status}${expanded ? ' skill-tree-row--expanded' : ''}`}>
      <button
        type="button"
        className="skill-tree-row-head"
        aria-expanded={expanded}
        onClick={onToggleExpand}
      >
        <strong>{row.name}</strong>
        <small>{row.detail}</small>
        <span className="skill-tree-chevron" aria-hidden>{expanded ? '▾' : '▸'}</span>
      </button>
      <div className="skill-tree-row-status">
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
      </div>
      {expanded && skill && <SkillDetail skill={skill} />}
    </li>
  );
}

function SkillDetail({ skill }: { skill: SkillDef }) {
  return (
    <div className="skill-tree-detail">
      <p className="skill-tree-detail-desc">{skill.description}</p>
      <dl className="skill-tree-detail-stats">
        {skill.dmg !== undefined && <Stat label="Damage" value={String(skill.dmg)} />}
        {skill.range !== undefined && <Stat label="Range" value={`${skill.range}m`} />}
        {skill.area !== undefined && <Stat label="Area" value={`${skill.area}m`} />}
        <Stat label="Mana" value={skill.manaCost > 0 ? String(skill.manaCost) : 'free'} />
        <Stat label="Cast" value={skill.castMs > 0 ? `${(skill.castMs / 1000).toFixed(1)}s` : 'instant'} />
        <Stat label="Cooldown" value={skill.cooldownMs > 0 ? `${(skill.cooldownMs / 1000).toFixed(1)}s` : '-'} />
      </dl>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="skill-tree-detail-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
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
