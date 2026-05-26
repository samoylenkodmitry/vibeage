import { useEffect, useState } from 'react';
import type { StatusEffect } from '../../../../packages/protocol/messages';
import { EffectTooltip } from './EffectTooltip';
import { useTooltipTrigger } from './useTooltipTrigger';
import { openWikiAt } from './wikiNavBus';
import {
  effectLabel,
  effectRemainingFraction,
  effectRemainingMs,
  isBeneficialEffect,
} from './effectMeta';

/**
 * Live readout of the buffs / debuffs currently on the player — the
 * "show me what's affecting me on a panel" the bare status pills only
 * hinted at. Each row names the effect, the value it carries, and a
 * depleting timer bar with the seconds left, split into buffs vs
 * debuffs so a self-cast Shield / Bless reads at a glance.
 */
export function ActiveEffects({ effects }: { effects: StatusEffect[] }) {
  const now = useTickingNow(effects.length > 0);
  const tooltip = useTooltipTrigger<StatusEffect>();
  // The server prunes expired effects, but a client tick can race
  // ahead of the next snapshot — drop anything already at 0.
  const visible = effects.filter((e) => {
    const remaining = effectRemainingMs(e, now);
    return remaining === null || remaining > 0;
  });
  if (visible.length === 0) return null;

  const buffs = visible.filter((e) => isBeneficialEffect(e.type));
  const debuffs = visible.filter((e) => !isBeneficialEffect(e.type));

  return (
    <div className="active-effects" aria-label="Active effects">
      <div className="active-effects-title">Active Effects</div>
      {buffs.length > 0 && <EffectGroup tone="buff" effects={buffs} now={now} tooltip={tooltip} />}
      {debuffs.length > 0 && <EffectGroup tone="debuff" effects={debuffs} now={now} tooltip={tooltip} />}
      {tooltip.info && (
        <EffectTooltip
          effect={tooltip.info.payload}
          clientX={tooltip.info.clientX}
          clientY={tooltip.info.clientY}
        />
      )}
    </div>
  );
}

type TooltipApi = ReturnType<typeof useTooltipTrigger<StatusEffect>>;

function EffectGroup({
  tone, effects, now, tooltip,
}: {
  tone: 'buff' | 'debuff';
  effects: StatusEffect[];
  now: number;
  tooltip: TooltipApi;
}) {
  return (
    <ul className={`active-effects-group active-effects-group--${tone}`}>
      {effects.map((effect) => (
        <EffectRow key={effect.id} tone={tone} effect={effect} now={now} tooltip={tooltip} />
      ))}
    </ul>
  );
}

function EffectRow({
  tone, effect, now, tooltip,
}: {
  tone: 'buff' | 'debuff';
  effect: StatusEffect;
  now: number;
  tooltip: TooltipApi;
}) {
  const remainingMs = effectRemainingMs(effect, now);
  const fraction = effectRemainingFraction(effect, now);
  return (
    <li className={`active-effect-row active-effect-row--${tone}`}>
      <button
        type="button"
        className="active-effect-button"
        onClick={(e) => { e.stopPropagation(); openWikiAt('effects', effect.type); }}
        title="Open in Wiki"
        {...tooltip.triggerProps(effect)}
      >
        <span className="active-effect-name">{effectLabel(effect.type)}</span>
        <span className="active-effect-value">{formatEffectValue(effect)}</span>
        {remainingMs !== null && (
          <span className="active-effect-remaining">{formatRemaining(remainingMs)}</span>
        )}
        <span className="active-effect-bar" aria-hidden>
          <span className="active-effect-bar-fill" style={{ width: `${Math.round(fraction * 100)}%` }} />
        </span>
      </button>
    </li>
  );
}

/** Percent-flavoured effects read as "+25%"; flat ones show the raw value. */
function formatEffectValue(effect: StatusEffect): string {
  const v = effect.value ?? 0;
  switch (effect.type) {
    case 'bless':
    case 'speed_boost':
    case 'evasion':
      return `+${v}%`;
    case 'slow':
      return `−${v}%`;
    case 'shield':
      return `${Math.round(v)}`;
    default:
      return v ? `${v}` : '';
  }
}

function formatRemaining(ms: number): string {
  const s = ms / 1000;
  return s >= 10 ? `${Math.round(s)}s` : `${s.toFixed(1)}s`;
}

/**
 * Re-renders ~4×/s so the timer bars deplete smoothly. Only ticks
 * while there are effects to show — idle when the list is empty.
 */
function useTickingNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}
