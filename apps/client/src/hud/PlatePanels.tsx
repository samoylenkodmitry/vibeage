import type { GameClientState, PlayerEntity } from '../gameTypes';
import { Meter, StatusPills, formatMeter, getDistance, getMeterProgress, getTargetState, getTargetTone } from './hudPrimitives';
import { useDraggablePanel } from './useDraggablePanel';
import { openWikiAt } from './wikiNavBus';

export type SelectedTargetView = {
  selfSelected: boolean;
  selectedEnemy: GameClientState['enemies'][string] | null;
  selectedOtherPlayer: PlayerEntity | null;
  targetIsAlive: boolean;
};

export function resolveSelectedTarget(state: GameClientState, player: PlayerEntity | null): SelectedTargetView {
  const selfSelected = Boolean(player && state.selectedTargetId === player.id);
  const id = state.selectedTargetId;
  const selectedEnemy = id && !selfSelected ? state.enemies[id] ?? null : null;
  const selectedOtherPlayer = id && !selfSelected && !selectedEnemy ? state.players[id] ?? null : null;
  const targetIsAlive = selfSelected
    ? Boolean(player?.isAlive)
    : Boolean(selectedEnemy?.isAlive || selectedOtherPlayer?.isAlive);
  return { selfSelected, selectedEnemy, selectedOtherPlayer, targetIsAlive };
}

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
      <div className={`meter-row${xpProgress >= 90 ? ' meter-row--near-levelup' : ''}`}>
        <span>XP</span>
        <div className="meter-track">
          <div className="meter-fill meter-xp" style={{ width: `${xpProgress}%` }} />
        </div>
        <strong>{formatMeter(player?.experience, player?.experienceToNextLevel)}</strong>
      </div>
      <div className="vitals-gold" aria-label="Gold">
        <span>Gold</span>
        <strong>{(player?.gold ?? 0).toLocaleString()}</strong>
      </div>
    </section>
  );
}

export function TargetPanel({
  player,
  enemy,
  otherPlayer,
  selfTargeted,
  onClose,
}: {
  player: PlayerEntity | null;
  enemy: GameClientState['enemies'][string] | null;
  otherPlayer?: PlayerEntity | null;
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
  if (otherPlayer) {
    return renderOtherPlayerTargetPanel(panelRef, player, otherPlayer, onClose);
  }
  return null;
}

function renderOtherPlayerTargetPanel(
  panelRef: React.RefObject<HTMLElement | null>,
  selfPlayer: PlayerEntity | null,
  target: PlayerEntity,
  onClose?: () => void,
) {
  const healthRatio = target.health / Math.max(1, target.maxHealth);
  const tone = getTargetTone(target.isAlive, healthRatio);
  const distance = selfPlayer ? getDistance(selfPlayer.position, target.position) : null;
  return (
    <section ref={panelRef} className={`hud hud-target target-${tone}`} aria-label="Target">
      <div className="panel-title">
        <strong>{target.name}</strong>
        <span>Lv {target.level}</span>
        {onClose && (
          <button type="button" className="panel-close" aria-label="Clear target" onClick={onClose}>×</button>
        )}
      </div>
      <Meter label="HP" value={target.health} max={target.maxHealth} className="meter-enemy" />
      <div className="target-meta">
        <span>{getTargetState(target.isAlive, healthRatio)} · player</span>
        <span>{distance === null ? '-' : `${distance.toFixed(1)}m`}</span>
      </div>
      <StatusPills effects={target.statusEffects ?? []} />
    </section>
  );
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
  // PR V — name doubles as a Wiki deep-link. Mini-bosses jump to the
  // Bosses tab (where their lore + signature live), normal mobs to
  // the Mobs tab.
  const openInWiki = () => enemy.isMiniBoss && enemy.bossId
    ? openWikiAt('bosses', enemy.bossId)
    : openWikiAt('mobs', enemy.type);
  return (
    <section ref={panelRef} className={`hud hud-target target-${getTargetTone(enemy.isAlive, healthRatio)}`} aria-label="Target">
      <div className="panel-title">
        <button
          type="button"
          className="panel-title-link"
          onClick={openInWiki}
          title="Open in Wiki"
        >
          <strong>{enemy.name}</strong>
        </button>
        <span className={`enemy-level enemy-level--${enemyLevelTone(player?.level ?? 1, enemy.level)}`}>
          Level {enemy.level}
        </span>
        {onClose && (
          <button type="button" className="panel-close" aria-label="Clear target" onClick={onClose}>×</button>
        )}
      </div>
      <Meter label="HP" value={enemy.health} max={enemy.maxHealth} className="meter-enemy" />
      <div className="target-meta">
        <span>{getTargetState(enemy.isAlive, healthRatio)}</span>
        {enemy.isAlive && enemy.aiState && (
          <span
            className={`enemy-ai-state enemy-ai-state--${enemy.aiState}`}
            title={`AI: ${enemy.aiState}`}
            data-testid="enemy-ai-state"
          >
            {formatAiState(enemy.aiState)}
          </span>
        )}
        <span>{distance === null ? '-' : `${distance.toFixed(1)}m`}</span>
      </div>
      <StatusPills effects={enemy.statusEffects ?? []} />
    </section>
  );
}

/**
 * Map server aiState values to short human-readable labels. Unknown
 * states fall through to the raw value so a future server-side AI
 * addition surfaces (instead of silently being hidden).
 */
export function formatAiState(state: string): string {
  switch (state) {
    case 'idle': return 'Idle';
    case 'patrolling': return 'Patrol';
    case 'chasing': return 'Chasing';
    case 'attacking': return 'Attacking';
    case 'returning': return 'Returning';
    default: return state;
  }
}

export type EnemyLevelTone = 'low' | 'fair' | 'high';

/**
 * Quick combat-decision tint for an enemy's level in the target
 * panel. Three-band threshold relative to the local player:
 *   - enemy.level > player.level + 2 → 'high' (red, watch out)
 *   - enemy.level < player.level - 2 → 'low' (grey, trivial)
 *   - else → 'fair' (default colour, normal fight)
 * Exported so a unit test can pin the boundaries.
 */
export function enemyLevelTone(playerLevel: number, enemyLevel: number): EnemyLevelTone {
  if (enemyLevel > playerLevel + 2) return 'high';
  if (enemyLevel < playerLevel - 2) return 'low';
  return 'fair';
}
