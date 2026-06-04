import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { getEffectLabel } from '../../../../packages/content/effects';
import { SKILLS, type SkillDef, type SkillId } from '../../../../packages/content/skills';
import { getEffectiveSkillStats } from '../../../../packages/sim/skillUpgrades';
import { describeOffense, describeReactions, describeSkillPlayPattern } from './skillMechanics';
import { openWikiAt } from './wikiNavBus';
import type { PlayerEntity } from '../gameTypes';

type SkillTooltipProps = {
  skillId: SkillId;
  clientX: number;
  clientY: number;
  /** Player's current upgrade tier for this skill (defaults to 1). */
  skillLevel?: number;
  player?: PlayerEntity | null;
  /**
   * PR JJ — pointer-enter/leave handlers from the parent's
   * useTooltipTrigger.hoverHandlers. Keeps the tooltip open while the
   * cursor sits inside it so the wiki link is actually clickable.
   */
  hoverHandlers?: {
    onPointerEnter: () => void;
    onPointerLeave: () => void;
  };
};

type TooltipRow = [string, string];
type EffectiveSkillStats = ReturnType<typeof getEffectiveSkillStats>;

export function SkillTooltip({ skillId, clientX, clientY, skillLevel = 1, player, hoverHandlers }: SkillTooltipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>(() => ({
    left: Math.max(8, clientX),
    top: Math.max(8, clientY - 12),
  }));
  const skill = SKILLS[skillId];

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(
      Math.max(margin, clientX),
      Math.max(margin, window.innerWidth - rect.width - margin),
    );
    const top = Math.min(
      Math.max(margin, clientY - rect.height - 12),
      Math.max(margin, window.innerHeight - rect.height - margin),
    );
    setPos({ left, top });
  }, [clientX, clientY, skillId]);

  if (!skill) {
    return null;
  }

  // Effective values fold in the player's upgrade tier so a leveled
  // Fireball tooltip shows the actual hit number, not the base.
  // Use `!== undefined` not truthiness so a leveled-down 0 (rare,
  // but possible with future modifiers) still renders. Nullish-
  // coalesce numeric properties so a partial SkillDef (older
  // saved content) doesn't render NaN.
  const effective = getEffectiveSkillStats(skillId, skillLevel, player ?? undefined);
  const rows = buildTooltipRows(skill, effective, skillLevel);

  // Render via a portal anchored to document.body so the tooltip's
  // position: fixed is relative to the viewport — NOT to a transformed
  // ancestor (.skill-bar uses translateX(-50%) and would otherwise
  // become the new containing block, breaking the placement).
  if (typeof document === 'undefined') {
    return null;
  }
  return createPortal(
    <SkillTooltipPanel
      tooltipRef={ref}
      skill={skill}
      rows={rows}
      effective={effective}
      pos={pos}
      hoverHandlers={hoverHandlers}
    />,
    document.body,
  );
}

function buildTooltipRows(skill: SkillDef, effective: EffectiveSkillStats, skillLevel: number): TooltipRow[] {
  const lvSuffix = skillLevel > 1 ? ` (Lv ${skillLevel})` : '';
  const castMs = skill.castMs ?? 0;
  const rows: TooltipRow[] = [];
  if (effective.dmg !== undefined) rows.push([`Damage${lvSuffix}`, String(effective.dmg)]);
  if (effective.range !== undefined) rows.push([`Range${lvSuffix}`, String(effective.range)]);
  if (effective.area !== undefined) rows.push([`Area${lvSuffix}`, String(effective.area)]);
  rows.push([`Mana${lvSuffix}`, effective.manaCost > 0 ? String(effective.manaCost) : 'free']);
  rows.push(['Cast', castMs > 0 ? `${(castMs / 1000).toFixed(1)}s` : 'instant']);
  if (effective.cooldownMs > 0) rows.push([`Cooldown${lvSuffix}`, `${(effective.cooldownMs / 1000).toFixed(1)}s`]);
  if (skill.autoRepeat) rows.push(['Auto-repeat', 'on']);
  return rows;
}

function SkillTooltipPanel({
  tooltipRef,
  skill,
  rows,
  effective,
  pos,
  hoverHandlers,
}: {
  tooltipRef: RefObject<HTMLDivElement | null>;
  skill: SkillDef;
  rows: TooltipRow[];
  effective: EffectiveSkillStats;
  pos: { left: number; top: number };
  hoverHandlers: SkillTooltipProps['hoverHandlers'];
}) {
  return (
    <div
      ref={tooltipRef}
      className="skill-tooltip"
      role="tooltip"
      style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 9999 }}
      onPointerEnter={hoverHandlers?.onPointerEnter}
      onPointerLeave={hoverHandlers?.onPointerLeave}
    >
      <header>
        <span className="skill-tooltip-title">
          <img className="skill-tooltip-icon" src={skill.icon} alt="" aria-hidden="true" />
          <strong>{skill.name}</strong>
        </span>
        {skill.requiresTarget ? <span className="skill-tooltip-flag">target</span> : <span className="skill-tooltip-flag skill-tooltip-flag--self">self</span>}
      </header>
      <p>{skill.description}</p>
      <ul>
        {rows.map(([label, value]) => (
          <li key={label}><span>{label}</span><strong>{value}</strong></li>
        ))}
      </ul>
      {skill.effects?.length ? (
        <footer>
          {skill.effects.map((effect, index) => {
            const effDuration = effective.effectDurationsMs[index];
            const effValue = effective.effectValues[index] ?? effect.value;
            return (
              <span key={index}>
                {getEffectLabel(effect.type)}
                {effValue ? ` · ${effValue}` : ''}
                {effDuration ? ` · ${(effDuration / 1000).toFixed(1)}s` : ''}
              </span>
            );
          })}
        </footer>
      ) : null}
      {describeOffense(skill.offense).map((line) => (
        <p key={line} className="skill-tooltip-offense">{line}</p>
      ))}
      {describeReactions(skill.reactions).map((line) => (
        <p key={line} className="skill-tooltip-offense">{line}</p>
      ))}
      {describeSkillPlayPattern(skill).map((line) => (
        <p key={line} className="skill-tooltip-offense">{line}</p>
      ))}
      <button
        type="button"
        className="tooltip-wiki-link"
        onClick={(e) => { e.stopPropagation(); openWikiAt('skills', skill.id); }}
        title="Open in Wiki"
      >Open in Wiki →</button>
    </div>
  );
}
