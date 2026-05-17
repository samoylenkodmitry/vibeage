import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SKILLS, type SkillId } from '../../../../packages/content/skills';

const EFFECT_LABEL: Record<string, string> = {
  damage: 'Damage',
  heal: 'Heal',
  stun: 'Stun',
  slow: 'Slow',
  dot: 'Bleed (DoT)',
  burn: 'Burn',
  poison: 'Poison',
  waterWeakness: 'Water weakness',
  freeze: 'Freeze',
  shield: 'Shield',
  bless: 'Bless',
  dispel: 'Dispel',
  taunt: 'Taunt',
  knockback: 'Knockback',
  evasion: 'Evasion',
  invisible: 'Invisible',
  transform: 'Transform',
};

type SkillTooltipProps = {
  skillId: SkillId;
  clientX: number;
  clientY: number;
};

export function SkillTooltip({ skillId, clientX, clientY }: SkillTooltipProps) {
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

  const rows: Array<[string, string]> = [];
  if (skill.dmg) rows.push(['Damage', String(skill.dmg)]);
  if (skill.range !== undefined) rows.push(['Range', String(skill.range)]);
  if (skill.area !== undefined) rows.push(['Area', String(skill.area)]);
  rows.push(['Mana', skill.manaCost > 0 ? String(skill.manaCost) : 'free']);
  rows.push(['Cast', skill.castMs > 0 ? `${(skill.castMs / 1000).toFixed(1)}s` : 'instant']);
  if (skill.cooldownMs > 0) rows.push(['Cooldown', `${(skill.cooldownMs / 1000).toFixed(1)}s`]);
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
          {skill.effects.map((effect, index) => (
            <span key={index}>
              {EFFECT_LABEL[effect.type] ?? effect.type}
              {effect.value ? ` · ${effect.value}` : ''}
              {effect.durationMs ? ` · ${(effect.durationMs / 1000).toFixed(1)}s` : ''}
            </span>
          ))}
        </footer>
      ) : null}
    </div>,
    document.body,
  );
}
