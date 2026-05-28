import { useMemo, useState } from 'react';
import {
  CLASS_SKILL_TREES,
  canLearnSkill,
  type CharacterClass,
} from '../../../../packages/content/classes';
import { SKILLS, classifySkill, isPassiveSkill, type SkillDef, type SkillId } from '../../../../packages/content/skills';
import { PASSIVE_SKILL_CONTRIBUTIONS } from '../../../../packages/content/classPassives';
import { STATS } from '../../../../packages/content/stats';
import type { Contribution } from '../../../../packages/sim/statContributions';
import { describeOffense } from './skillMechanics';
import { SKILL_DRAG_MIME } from './useActionBar';
import { useActionBarDrag } from './actionBarDrag';
import {
  getSpecializationsForClass,
  PROFICIENCY_LEVEL,
  SPECIALIZATION_UNLOCK_LEVEL,
} from '../../../../packages/content/specializations';
import { getEffectiveSkillStats } from '../../../../packages/sim/skillUpgrades';
import type { PlayerEntity } from '../gameTypes';
import { capitalize, DEFAULT_CLASS_NAME } from './textUtils';
import { useDraggablePanel } from './useDraggablePanel';

type SkillTreePanelProps = {
  player: PlayerEntity | null;
  onLearnSkill: (skillId: SkillId) => void;
  onUpgradeSkill: (skillId: SkillId) => void;
  rejections?: Record<string, string>;
};

export type Row = {
  skillId: SkillId;
  name: string;
  status: 'unlocked' | 'available' | 'locked';
  detail: string;
};

// §52 polish — covers both LearnSkill and UpgradeSkill reject
// reasons (the reducer routes both into `learnSkillRejections`,
// keyed by skillId, so one map answers for both).
const REJECTION_LABEL: Record<string, string> = {
  // LearnSkill enum values
  noSkillPoints: 'No skill points',
  levelTooLow: 'Level too low',
  missingPrereq: 'Missing prereq',
  unknownSkill: 'Unknown skill',
  wrongClass: 'Not for this class',
  alreadyKnown: 'Already known',
  // UpgradeSkill enum values (from `applySkillUpgrade`)
  skillNotLearned: 'Learn it first',
  noUpgradesAvailable: 'No upgrades',
  maxLevelReached: 'Max level',
  // Defensive: server also emits `playerNotFound` for both verbs in
  // a degenerate route; surface it rather than show the raw enum.
  playerNotFound: "Session error — rejoin",
};

export function SkillTreePanel({ player, onLearnSkill, onUpgradeSkill, rejections }: SkillTreePanelProps) {
  const panelRef = useDraggablePanel<HTMLElement>('skill-tree');
  const rows = useMemo(() => buildSkillRows(player), [player]);
  const className = player?.className ?? DEFAULT_CLASS_NAME;
  const skillPoints = player?.availableSkillPoints ?? 0;
  const skillLevels = player?.skillLevels ?? {};
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
            skillLevel={skillLevels[row.skillId] ?? 1}
            onToggleExpand={() => setExpandedId((prev) => (prev === row.skillId ? null : row.skillId))}
            onLearnSkill={onLearnSkill}
            onUpgradeSkill={onUpgradeSkill}
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
  skillLevel,
  onToggleExpand,
  onLearnSkill,
  onUpgradeSkill,
}: {
  row: Row;
  expanded: boolean;
  rejectLabel: string;
  skillPoints: number;
  skillLevel: number;
  onToggleExpand: () => void;
  onLearnSkill: (skillId: SkillId) => void;
  onUpgradeSkill: (skillId: SkillId) => void;
}) {
  const skill = SKILLS[row.skillId];
  const { beginDrag, consumeDragClick } = useActionBarDrag();
  const isPassive = isPassiveSkill(row.skillId);
  const canDragToBar = row.status === 'unlocked' && !isPassive;
  // Self-buff = a beneficial-only active skill (Bless, Shield Wall,
  // Evade…) that lands on you. Tagged so it reads as a buff, not an
  // attack, in the tree.
  const isSelfBuff = !isPassive && !!skill?.effects?.length && classifySkill(skill.effects) === 'beneficial';
  // maxLevel = base level 1 + N upgrade tiers (each tier description
  // lives in SKILLS[id].upgrades[i] and bumps the level by one).
  const maxLevel = 1 + (skill?.upgrades?.length ?? 0);
  const canUpgrade =
    row.status === 'unlocked'
    && skillLevel < maxLevel
    && skillPoints > 0;
  return (
    <li className={`skill-tree-row skill-tree-row--${row.status}${expanded ? ' skill-tree-row--expanded' : ''}`}>
      <button
        type="button"
        className="skill-tree-row-head"
        aria-expanded={expanded}
        onClick={(e) => {
          // Swallow the click that ends a touch drag-to-bar so the row
          // doesn't also expand/collapse.
          if (consumeDragClick()) {
            e.preventDefault();
            return;
          }
          onToggleExpand();
        }}
        draggable={canDragToBar}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'copy';
          e.dataTransfer.setData(SKILL_DRAG_MIME, JSON.stringify({ skillId: row.skillId }));
        }}
        onPointerDown={(e) => {
          if (canDragToBar) beginDrag({ kind: 'skill', id: row.skillId }, e, row.name);
        }}
        title={canDragToBar ? 'Drag to the action bar' : undefined}
      >
        <img className="skill-tree-row-icon" src={skill.icon} alt="" aria-hidden="true" />
        <strong>
          {row.name}
          {isPassive && <span className="skill-tag-kind skill-tag-kind--passive">Passive</span>}
          {isSelfBuff && <span className="skill-tag-kind skill-tag-kind--buff">Self-buff</span>}
          {row.status === 'unlocked' && skill?.upgrades?.length ? ` · Lv ${skillLevel}/${maxLevel}` : ''}
        </strong>
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
        {row.status === 'unlocked' && skill?.upgrades?.length ? (
          <button
            type="button"
            className="learn-skill-button"
            disabled={!canUpgrade}
            onClick={() => canUpgrade && onUpgradeSkill(row.skillId)}
          >
            {skillLevel >= maxLevel ? 'Max' : skillPoints > 0 ? 'Upgrade' : 'Need SP'}
          </button>
        ) : null}
        {row.status === 'unlocked' && !skill?.upgrades?.length && <span className="skill-tree-tag">Owned</span>}
        {row.status === 'locked' && <span className="skill-tree-tag skill-tree-tag--locked">Locked</span>}
      </div>
      {expanded && skill && <SkillDetail skill={skill} skillLevel={skillLevel} />}
    </li>
  );
}

function SkillDetail({ skill, skillLevel }: { skill: SkillDef; skillLevel: number }) {
  // Passives are never cast — the damage/range/mana/cast/cooldown grid
  // is all blank for them, which read as a broken skill. Show what the
  // passive actually does instead.
  if (isPassiveSkill(skill.id)) {
    return <PassiveDetail skill={skill} />;
  }
  // Show the *effective* numbers the engine will apply at this tier.
  // Headline values reflect the player's actual leveled skill, not
  // the base; the upgrade list below shows the per-tier deltas.
  const effective = getEffectiveSkillStats(skill.id, skillLevel);
  return (
    <div className="skill-tree-detail">
      <p className="skill-tree-detail-desc">{skill.description}</p>
      <dl className="skill-tree-detail-stats">
        {effective.dmg !== undefined && <Stat label="Damage" value={String(effective.dmg)} />}
        {effective.range !== undefined && <Stat label="Range" value={String(effective.range)} />}
        {skill.area !== undefined && <Stat label="Area" value={String(skill.area)} />}
        <Stat label="Mana" value={effective.manaCost > 0 ? String(effective.manaCost) : 'free'} />
        <Stat label="Cast" value={skill.castMs > 0 ? `${(skill.castMs / 1000).toFixed(1)}s` : 'instant'} />
        <Stat label="Cooldown" value={effective.cooldownMs > 0 ? `${(effective.cooldownMs / 1000).toFixed(1)}s` : '-'} />
      </dl>
      {describeOffense(skill.offense).map((line) => (
        <p key={line} className="skill-tree-offense">{line}</p>
      ))}
      {skill.upgrades?.length ? (
        <ul className="skill-tree-upgrade-list">
          {skill.upgrades.map((tier) => {
            const owned = skillLevel >= tier.level;
            return (
              <li
                key={tier.level}
                className={`skill-tree-upgrade${owned ? ' skill-tree-upgrade--owned' : ''}`}
              >
                <strong>Lv {tier.level}</strong>
                <small>{tier.description}</small>
                {owned && <span className="skill-tree-tag">Owned</span>}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function PassiveDetail({ skill }: { skill: SkillDef }) {
  const rows = PASSIVE_SKILL_CONTRIBUTIONS[skill.id] ?? [];
  return (
    <div className="skill-tree-detail">
      <p className="skill-tree-detail-desc">{skill.description}</p>
      <p className="skill-tree-passive-note">
        Passive — always active once learned. No cast, no cooldown; it shapes your stats directly.
      </p>
      {rows.length > 0 && (
        <ul className="skill-tree-passive-effects">
          {rows.map((row) => (
            <li key={`${row.source}:${row.stat}`}>
              <span>{STATS[row.stat]?.short ?? row.stat}</span>
              <strong>{formatContribution(row)}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Compact "+30%" / "+5" rendering of a passive's stat contribution. */
function formatContribution(c: Contribution): string {
  if (typeof c.value !== 'number') return '';
  if (c.op === 'mul') {
    const pct = Math.round((c.value - 1) * 100);
    return `${pct >= 0 ? '+' : '−'}${Math.abs(pct)}%`;
  }
  // crit chance is a 0..1 fraction; everyone else is a flat point value.
  if (c.stat === 'critChance') {
    const pct = Math.round(c.value * 100);
    return `${pct >= 0 ? '+' : '−'}${Math.abs(pct)}%`;
  }
  return `${c.value >= 0 ? '+' : '−'}${Math.abs(c.value)}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="skill-tree-detail-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

// Exported for §49/M3 PR015 unit tests; keeps the row-building
// logic testable without bringing in a DOM renderer.
export function buildSkillRows(player: PlayerEntity | null): Row[] {
  const className = (player?.className ?? DEFAULT_CLASS_NAME) as CharacterClass;
  const tree = CLASS_SKILL_TREES[className] ?? CLASS_SKILL_TREES.mage;
  const level = player?.level ?? 1;
  const unlocked = player?.unlockedSkills ?? [];
  const classRows: Row[] = Object.entries(tree.skillProgression).map(([skillId, req]) => {
    const id = skillId as SkillId;
    const skill = SKILLS[id];
    if (unlocked.includes(id)) {
      // Passives can't sit in the action bar — they're always on. The
      // old "In your bar" label was misleading for them.
      const detail = isPassiveSkill(id) ? 'Always active' : 'In your bar';
      return { skillId: id, name: skill?.name ?? id, status: 'unlocked', detail };
    }
    if (canLearnSkill(id, className, level, unlocked)) {
      return { skillId: id, name: skill?.name ?? id, status: 'available', detail: `Required Lv ${req.level}` };
    }
    // §49/M3 PR015 — concrete lock reason: tell the player what
    // they're missing in current values, not abstract requirements.
    // "Need Lv 7 (you're 4)" reads better than just "Lv 7".
    const parts: string[] = [];
    if (level < req.level) parts.push(`need Lv ${req.level} (you're ${level})`);
    const missingPrereqs = (req.requiredSkills ?? [])
      .filter((s) => !unlocked.includes(s as SkillId))
      .map((s) => SKILLS[s as SkillId]?.name ?? s);
    if (missingPrereqs.length) parts.push(`need ${missingPrereqs.join(', ')}`);
    return { skillId: id, name: skill?.name ?? id, status: 'locked', detail: parts.join(' · ') || `Lv ${req.level}` };
  });

  // Spec / proficiency skills: render all specs for the player's
  // class so the panel surfaces what's gated behind the future spec
  // pick. Rows that belong to a spec the player hasn't chosen show
  // as locked with a "spec: X" hint; rows for the active spec follow
  // the same level / SP gate as class skills.
  const specRows: Row[] = [];
  for (const spec of getSpecializationsForClass(className)) {
    const onThisSpec = player?.specializationId === spec.id;
    const buildRow = (skillId: SkillId, requiredLevel: number, tierLabel: string): Row => {
      const skill = SKILLS[skillId];
      if (unlocked.includes(skillId)) {
        return { skillId, name: skill?.name ?? skillId, status: 'unlocked', detail: `${spec.name} ${tierLabel}` };
      }
      // §49/M3 PR015 — concrete spec lock reason with the player's
      // current level + the spec they'd need to pick.
      if (!onThisSpec) {
        const needLevel = level < SPECIALIZATION_UNLOCK_LEVEL
          ? `Lv ${SPECIALIZATION_UNLOCK_LEVEL} then pick ${spec.name}`
          : `pick ${spec.name} at the spec terminal`;
        return { skillId, name: skill?.name ?? skillId, status: 'locked', detail: needLevel };
      }
      if (level < requiredLevel) {
        return { skillId, name: skill?.name ?? skillId, status: 'locked', detail: `need Lv ${requiredLevel} (you're ${level}) · ${spec.name} ${tierLabel}` };
      }
      return { skillId, name: skill?.name ?? skillId, status: 'available', detail: `Required Lv ${requiredLevel}` };
    };
    for (const sid of spec.specSkills ?? []) specRows.push(buildRow(sid, SPECIALIZATION_UNLOCK_LEVEL, 'spec'));
    for (const sid of spec.proficiencySkills ?? []) specRows.push(buildRow(sid, PROFICIENCY_LEVEL, 'proficient'));
  }
  return [...classRows, ...specRows];
}

/**
 * True if the player has spendable SP — i.e. ≥1 SP AND at least
 * one row is either 'available' (can learn now) or 'unlocked'
 * with a remaining upgrade tier. The SP badge on the Skills
 * panel toggle used to read availableSkillPoints raw, which
 * lit up green even when every skill was maxed and the player
 * had nothing to do with it — confusing onboarding signal.
 */
export function hasSpendableSkillPoints(player: PlayerEntity | null): boolean {
  if (!player) return false;
  if ((player.availableSkillPoints ?? 0) <= 0) return false;
  const rows = buildSkillRows(player);
  const skillLevels = player.skillLevels ?? {};
  for (const row of rows) {
    if (row.status === 'available') return true;
    if (row.status === 'unlocked') {
      const maxLevel = 1 + (SKILLS[row.skillId]?.upgrades?.length ?? 0);
      const level = skillLevels[row.skillId] ?? 1;
      if (level < maxLevel) return true;
    }
  }
  return false;
}
