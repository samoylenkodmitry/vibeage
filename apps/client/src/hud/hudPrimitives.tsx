import type { StatusEffect } from '../../../../packages/protocol/messages';
import type { PlayerEntity } from '../gameTypes';

export function Meter({
  label,
  value,
  max,
  className,
}: {
  label: string;
  value: number | undefined;
  max: number | undefined;
  className: string;
}) {
  return (
    <div className="meter-row">
      <span>{label}</span>
      <div className="meter-track">
        <div className={`meter-fill ${className}`} style={{ width: `${getMeterProgress(value, max)}%` }} />
      </div>
      <strong>{formatMeter(value, max)}</strong>
    </div>
  );
}

export function StatusPills({ effects }: { effects: StatusEffect[] }) {
  if (effects.length === 0) {
    return null;
  }

  return (
    <div className="status-pills" aria-label="Status effects">
      {effects.slice(0, 5).map((effect) => (
        <span key={effect.id} title={effect.sourceSkill}>
          {effect.type}
          {effect.stacks ? ` ${effect.stacks}` : ''}
        </span>
      ))}
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
