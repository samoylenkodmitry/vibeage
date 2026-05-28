import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { StatusEffect } from '../../../../packages/protocol/messages';
import { EFFECT_DESCRIPTION, EFFECT_LABEL, effectIcon } from './effectMeta';

type EffectTooltipProps = {
  effect: StatusEffect;
  clientX: number;
  clientY: number;
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
  const icon = effectIcon(effect.type);
  // Only compute a remaining count when we actually have both a start
  // timestamp and a duration; otherwise the previous code printed
  // 'Remaining: 0.0s' for any non-timed effect because startTimeTs
  // defaulted to 0 and that's "expired" by today's clock.
  const hasTimedRemaining = effect.startTimeTs !== undefined && effect.durationMs !== undefined;
  const remainingMs = hasTimedRemaining
    ? Math.max(0, (effect.startTimeTs ?? 0) + (effect.durationMs ?? 0) - Date.now())
    : null;

  return createPortal(
    <div
      ref={ref}
      className="skill-tooltip"
      role="tooltip"
      style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 9999 }}
    >
      <header>
        <span className="skill-tooltip-title">
          {icon && <img className="skill-tooltip-icon" src={icon} alt="" aria-hidden="true" />}
          <strong>{label}</strong>
        </span>
        {effect.stacks && effect.stacks > 1 ? <span className="skill-tooltip-flag">×{effect.stacks}</span> : null}
      </header>
      {description && <p>{description}</p>}
      <ul>
        {effect.value !== undefined && <li><span>Value</span><strong>{effect.value}</strong></li>}
        {effect.durationMs !== undefined && (
          <li><span>Duration</span><strong>{(effect.durationMs / 1000).toFixed(1)}s</strong></li>
        )}
        {remainingMs !== null && (
          <li><span>Remaining</span><strong>{(remainingMs / 1000).toFixed(1)}s</strong></li>
        )}
        {effect.sourceSkill && <li><span>Source</span><strong>{effect.sourceSkill}</strong></li>}
      </ul>
    </div>,
    document.body,
  );
}
