import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getEffectLabel } from '../../../../packages/content/effects';
import { SKILLS, type SkillId } from '../../../../packages/content/skills';
import { getEffectiveSkillStats } from '../../../../packages/sim/skillUpgrades';

type SkillTooltipProps = {
  skillId: SkillId;
  clientX: number;
  clientY: number;
  /** Player's current upgrade tier for this skill (defaults to 1). */
  skillLevel?: number;
};

export function SkillTooltip({ skillId, clientX, clientY, skillLevel = 1 }: SkillTooltipProps) {
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
  const effective = getEffectiveSkillStats(skillId, skillLevel);
  const lvSuffix = skillLevel > 1 ? ` (Lv ${skillLevel})` : '';
  const rows: Array<[string, string]> = [];
  if (effective.dmg) rows.push([`Damage${lvSuffix}`, String(effective.dmg)]);
  if (effective.range !== undefined) rows.push(['Range', String(effective.range)]);
  if (skill.area !== undefined) rows.push(['Area', String(skill.area)]);
  rows.push([`Mana${lvSuffix}`, effective.manaCost > 0 ? String(effective.manaCost) : 'free']);
  rows.push(['Cast', skill.castMs > 0 ? `${(skill.castMs / 1000).toFixed(1)}s` : 'instant']);
  if (effective.cooldownMs > 0) rows.push([`Cooldown${lvSuffix}`, `${(effective.cooldownMs / 1000).toFixed(1)}s`]);
  if (skill.autoRepeat) rows.push(['Auto-repeat', 'on']);

  // Render via a portal anchored to document.body so the tooltip's
  // position: fixed is relative to the viewport — NOT to a transformed
  // ancestor (.skill-bar uses translateX(-50%) and would otherwise
  // become the new containing block, breaking the placement).
  if (typeof document === 'undefined') {
    return null;
  }
  return createPortal(
    <div
      ref={ref}
      className="skill-tooltip"
      role="tooltip"
      style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 9999 }}
    >
      <header>
        <strong>{skill.name}</strong>
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
            return (
              <span key={index}>
                {getEffectLabel(effect.type)}
                {effect.value ? ` · ${effect.value}` : ''}
                {effDuration ? ` · ${(effDuration / 1000).toFixed(1)}s` : ''}
              </span>
            );
          })}
        </footer>
      ) : null}
    </div>,
    document.body,
  );
}
