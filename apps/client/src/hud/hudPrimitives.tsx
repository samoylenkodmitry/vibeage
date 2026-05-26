import type { StatusEffect } from '../../../../packages/protocol/messages';
import type { PlayerEntity } from '../gameTypes';
import { EffectTooltip } from './EffectTooltip';
import { useTooltipTrigger } from './useTooltipTrigger';
import { openWikiAt } from './wikiNavBus';

export function Meter({
  label,
  value,
  max,
  className,
  shield = 0,
}: {
  label: string;
  value: number | undefined;
  max: number | undefined;
  className: string;
  /** Active shield absorb (HP-bar overshield). Shown as a gold segment + `+N` readout. */
  shield?: number;
}) {
  const hpPct = getMeterProgress(value, max);
  // Shield rides in the empty space to the right of HP (it absorbs
  // before HP, and drains first). Clamped so it never overflows the
  // track; any excess beyond the bar still shows in the `+N` readout.
  const shieldPct = shield > 0 && max && max > 0
    ? Math.min(100 - hpPct, (shield / max) * 100)
    : 0;
  return (
    <div className="meter-row">
      <span>{label}</span>
      <div className="meter-track">
        <div className={`meter-fill ${className}`} style={{ width: `${hpPct}%` }} />
        {shieldPct > 0 && (
          <div className="meter-shield" style={{ left: `${hpPct}%`, width: `${shieldPct}%` }} aria-hidden="true" />
        )}
      </div>
      <strong>{formatMeter(value, max)}{shield > 0 ? ` +${Math.round(shield)}` : ''}</strong>
    </div>
  );
}

export function StatusPills({ effects }: { effects: StatusEffect[] }) {
  const tooltip = useTooltipTrigger<StatusEffect>();
  if (effects.length === 0) {
    return null;
  }

  return (
    <div className="status-pills" aria-label="Status effects">
      {effects.slice(0, 5).map((effect) => (
        <button
          key={effect.id}
          type="button"
          className="status-pill"
          // PR CC — tap a buff / debuff pill to open the Wiki Effects
          // entry for that effect type. Tooltip stays on hover /
          // long-press; click is the deep-link.
          onClick={(e) => { e.stopPropagation(); openWikiAt('effects', effect.type); }}
          title="Open in Wiki"
          {...tooltip.triggerProps(effect)}
        >
          {effect.type}
          {effect.stacks ? ` ${effect.stacks}` : ''}
        </button>
      ))}
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

export function formatMeter(value = 0, max = 0): string {
  return `${Math.round(value)}/${Math.round(max)}`;
}

export function getMeterProgress(value = 0, max = 0): number {
  if (max <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (value / max) * 100));
}

export function getTargetState(isAlive: boolean, healthRatio: number): string {
  if (!isAlive) {
    return 'Defeated';
  }

  if (healthRatio <= 0.35) {
    return 'Weak';
  }

  return 'Engaged';
}

export function getTargetTone(isAlive: boolean, healthRatio: number): 'defeated' | 'weak' | 'engaged' {
  if (!isAlive) {
    return 'defeated';
  }

  if (healthRatio <= 0.35) {
    return 'weak';
  }

  return 'engaged';
}

export function getDistance(a: PlayerEntity['position'], b: PlayerEntity['position']): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
