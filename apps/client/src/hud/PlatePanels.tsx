import type { GameClientState, PlayerEntity } from '../gameTypes';
import { Meter, StatusPills, formatMeter, getDistance, getMeterProgress, getTargetState, getTargetTone } from './hudPrimitives';
import { useDraggablePanel } from './useDraggablePanel';

export function VitalsStrip({
  player,
  selected,
  onSelectSelf,
}: {
  player: PlayerEntity | null;
  selected?: boolean;
  onSelectSelf?: () => void;
}) {
  const xpProgress = getMeterProgress(player?.experience, player?.experienceToNextLevel);
  const clickable = Boolean(player && onSelectSelf);
  return (
    <section
      className={`vitals-strip${selected ? ' vitals-strip--selected' : ''}${clickable ? ' vitals-strip--clickable' : ''}`}
      aria-label="Vitals"
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onSelectSelf}
      onKeyDown={(event) => {
        if (clickable && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onSelectSelf?.();
        }
      }}
    >
      <div className="vitals-header">
        <strong>{player?.name ?? 'Hero'}</strong>
        <span>Lv {player?.level ?? 1}</span>
      </div>
      <Meter label="HP" value={player?.health} max={player?.maxHealth} className="meter-hp" />
      <Meter label="MP" value={player?.mana} max={player?.maxMana} className="meter-mp" />
      <div className="meter-row">
        <span>XP</span>
        <div className="meter-track">
          <div className="meter-fill meter-xp" style={{ width: `${xpProgress}%` }} />
        </div>
        <strong>{formatMeter(player?.experience, player?.experienceToNextLevel)}</strong>
      </div>
    </section>
  );
}

export function TargetPanel({
  player,
  enemy,
  selfTargeted,
  onClose,
}: {
  player: PlayerEntity | null;
  enemy: GameClientState['enemies'][string] | null;
  selfTargeted?: boolean;
  onClose?: () => void;
}) {
  const panelRef = useDraggablePanel<HTMLElement>('target');
  if (selfTargeted && player) {
    return renderSelfTargetPanel(panelRef, player, onClose);
  }
  if (enemy) {
    return renderEnemyTargetPanel(panelRef, player, enemy, onClose);
  }
  return null;
}

function renderSelfTargetPanel(
  panelRef: React.RefObject<HTMLElement | null>,
  player: PlayerEntity,
  onClose?: () => void,
) {
  const healthRatio = player.health / Math.max(1, player.maxHealth);
  const tone = getTargetTone(player.isAlive, healthRatio);
  return (
    <section ref={panelRef} className={`hud hud-target target-${tone}`} aria-label="Target">
      <div className="panel-title">
        <strong>{player.name} (You)</strong>
        <span>Lv {player.level}</span>
        {onClose && (
          <button type="button" className="panel-close" aria-label="Clear target" onClick={onClose}>×</button>
        )}
      </div>
      <Meter label="HP" value={player.health} max={player.maxHealth} className="meter-hp" />
      <Meter label="MP" value={player.mana} max={player.maxMana} className="meter-mp" />
      <div className="target-meta">
        <span>{getTargetState(player.isAlive, healthRatio)}</span>
        <span>0.0m</span>
      </div>
      <StatusPills effects={player.statusEffects ?? []} />
    </section>
  );
}

function renderEnemyTargetPanel(
  panelRef: React.RefObject<HTMLElement | null>,
  player: PlayerEntity | null,
  enemy: NonNullable<GameClientState['enemies'][string]>,
  onClose?: () => void,
) {
  const distance = player ? getDistance(player.position, enemy.position) : null;
  const healthRatio = enemy.health / Math.max(1, enemy.maxHealth);
  return (
    <section ref={panelRef} className={`hud hud-target target-${getTargetTone(enemy.isAlive, healthRatio)}`} aria-label="Target">
      <div className="panel-title">
        <strong>{enemy.name}</strong>
        <span>Level {enemy.level}</span>
        {onClose && (
          <button type="button" className="panel-close" aria-label="Clear target" onClick={onClose}>×</button>
        )}
      </div>
      <Meter label="HP" value={enemy.health} max={enemy.maxHealth} className="meter-enemy" />
      <div className="target-meta">
        <span>{getTargetState(enemy.isAlive, healthRatio)}</span>
        <span>{distance === null ? '-' : `${distance.toFixed(1)}m`}</span>
      </div>
      <StatusPills effects={enemy.statusEffects ?? []} />
    </section>
  );
}
