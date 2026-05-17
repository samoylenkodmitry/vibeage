import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { StatusEffect } from '../../../../packages/protocol/messages';

type EffectTooltipProps = {
  effect: StatusEffect;
  clientX: number;
  clientY: number;
};

const EFFECT_LABEL: Record<string, string> = {
  damage: 'Damage',
  heal: 'Heal over time',
  stun: 'Stun',
  slow: 'Slow',
  dot: 'Bleed',
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

const EFFECT_DESCRIPTION: Record<string, string> = {
  damage: 'Inflicts a flat amount of damage on application.',
  heal: 'Restores health.',
  stun: 'Locks movement, casting, and attacks for the duration.',
  slow: 'Reduces movement speed by the listed percentage.',
  dot: 'Ticks damage every second over the duration.',
  burn: 'Fire damage tick — fire-weak enemies take more.',
  poison: 'Poison damage tick — ignores armor.',
  waterWeakness: 'Target takes the listed % more damage from water attacks.',
  freeze: 'Target is locked solid; cannot act.',
  shield: 'Absorbs incoming damage up to the listed amount, then breaks.',
  bless: 'Increases the caster’s outgoing damage by the listed percent.',
  dispel: 'Strips a negative status effect (handled on apply, no duration).',
  taunt: 'Forces the target enemy to attack the caster for the duration.',
  knockback: 'Pushes the target back the listed distance.',
  evasion: 'Increases dodge chance by the listed percent.',
  invisible: 'Breaks enemy aggro and hides the player from their searches.',
  transform: 'Converts the target into stone (or equivalent) for the duration.',
};

export function EffectTooltip({ effect, clientX, clientY }: EffectTooltipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>(() => ({
    left: Math.max(8, clientX),
    top: Math.max(8, clientY - 12),
  }));

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
  }, [clientX, clientY, effect.id]);

  if (typeof document === 'undefined') {
    return null;
  }

  const label = EFFECT_LABEL[effect.type] ?? effect.type;
  const description = EFFECT_DESCRIPTION[effect.type] ?? '';
  const remainingMs = Math.max(0, (effect.startTimeTs ?? 0) + (effect.durationMs ?? 0) - Date.now());

  return createPortal(
    <div
      ref={ref}
      className="skill-tooltip"
      role="tooltip"
      style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 9999 }}
    >
      <header>
        <strong>{label}</strong>
        {effect.stacks && effect.stacks > 1 ? <span className="skill-tooltip-flag">×{effect.stacks}</span> : null}
      </header>
      {description && <p>{description}</p>}
      <ul>
        {effect.value !== undefined && <li><span>Value</span><strong>{effect.value}</strong></li>}
        {effect.durationMs !== undefined && (
          <li><span>Duration</span><strong>{(effect.durationMs / 1000).toFixed(1)}s</strong></li>
        )}
        {effect.durationMs !== undefined && (
          <li><span>Remaining</span><strong>{(remainingMs / 1000).toFixed(1)}s</strong></li>
        )}
        {effect.sourceSkill && <li><span>Source</span><strong>{effect.sourceSkill}</strong></li>}
      </ul>
    </div>,
    document.body,
  );
}
