import { FormEvent, useEffect, useRef, useState } from 'react';
import { SKILLS, type SkillId } from '../../../packages/content/skills';
import type { StatusEffect } from '../../../packages/protocol/messages';
import type { GameClientState, PlayerEntity } from './gameTypes';
import { InventoryPanel } from './hud/InventoryPanel';
import { MapPanel } from './hud/MapPanel';
import { SkillBar } from './hud/SkillBar';
import { StarterProgressPanel } from './hud/StarterProgressPanel';
import {
  getHotkeySkill,
  getSkillSlotIndexForKeyboardCode,
  isEditableTarget,
} from './skillShortcuts';

type StartPanelProps = {
  onStart: (playerName: string) => void;
};

type GameHudProps = {
  state: GameClientState;
  onDisconnect: () => void;
  onCastSkill: (skillId: SkillId) => void;
  onLearnSkill: (skillId: SkillId) => void;
  onUseItem: (slotIndex: number) => void;
  onRespawn: () => void;
};

export function StartPanel({ onStart }: StartPanelProps) {
  const [playerName, setPlayerName] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = playerName.trim();
    if (trimmedName) {
      onStart(trimmedName);
    }
  }

  return (
    <main className="start-screen">
      <form className="start-panel" onSubmit={submit}>
        <h1>VibeAge</h1>
        <label htmlFor="player-name">Character Name</label>
        <input
          id="player-name"
          value={playerName}
          onChange={(event) => setPlayerName(event.target.value)}
          placeholder="Enter your character name"
          autoComplete="off"
        />
        <button type="submit" disabled={!playerName.trim()}>
          Enter the World
        </button>
      </form>
    </main>
  );
}

export function GameHud({ state, onDisconnect, onCastSkill, onLearnSkill, onUseItem, onRespawn }: GameHudProps) {
  const player = state.myPlayerId ? state.players[state.myPlayerId] ?? null : null;
  const selectedTarget = state.selectedTargetId ? state.enemies[state.selectedTargetId] ?? null : null;
  const playerCount = Object.keys(state.players).length;
  const enemyCount = Object.values(state.enemies).filter((enemy) => enemy.isAlive).length;
  const regionStatus = state.worldPublicState
    ? `${state.worldPublicState.activeRegionCount}/${state.worldPublicState.regionCount}`
    : '-';
  const now = useNow(100);
  const [statsOpen, setStatsOpen] = useState(true);
  const [questOpen, setQuestOpen] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  useSkillHotkeys(player, onCastSkill);

  return (
    <>
      <section className="hud hud-top" aria-label="Connection">
        <strong>VibeAge</strong>
        <span className={`status-dot status-${state.connectionState}`} />
        <span>{state.message}</span>
        <button type="button" className="ghost-button" onClick={onDisconnect}>
          Disconnect
        </button>
      </section>
      <section className="hud hud-stats" aria-label="World status">
        <Metric label="Players" value={String(playerCount)} />
        <Metric label="Enemies" value={String(enemyCount)} />
        <Metric label="Regions" value={regionStatus} />
        <Metric label="Loot" value={String(Object.keys(state.groundLoot).length)} />
      </section>
      <VitalsStrip player={player} />
      {statsOpen && <PlayerPanel player={player} />}
      <TargetPanel player={player} target={selectedTarget} />
      <MovementPanel player={player} target={state.targetWorldPos} />
      <NavigationPanel state={state} player={player} />
      {questOpen && (
        <StarterProgressPanel player={player} progress={state.starterProgress} onLearnSkill={onLearnSkill} />
      )}
      {bagOpen && (
        <InventoryPanel inventory={state.inventory} maxSlots={state.maxInventorySlots} onUseItem={onUseItem} />
      )}
      {mapOpen && <MapPanel player={player} />}
      <CastingPanel player={player} />
      <SkillBar
        player={player}
        now={now}
        hasSelectedTarget={Boolean(selectedTarget?.isAlive)}
        onCastSkill={onCastSkill}
      />
      <PanelToggleStrip
        statsOpen={statsOpen}
        questOpen={questOpen}
        bagOpen={bagOpen}
        mapOpen={mapOpen}
        onToggleStats={() => setStatsOpen((prev) => !prev)}
        onToggleQuest={() => setQuestOpen((prev) => !prev)}
        onToggleBag={() => setBagOpen((prev) => !prev)}
        onToggleMap={() => setMapOpen((prev) => !prev)}
      />
      {state.combatLog.length > 0 && (
        <section className="combat-log" aria-label="Combat log">
          {state.combatLog.map((line) => (
            <span key={line.id}>{line.text}</span>
          ))}
        </section>
      )}
      {player && !player.isAlive && <DeathOverlay onRespawn={onRespawn} />}
    </>
  );
}

function PanelToggleStrip({
  statsOpen,
  questOpen,
  bagOpen,
  mapOpen,
  onToggleStats,
  onToggleQuest,
  onToggleBag,
  onToggleMap,
}: {
  statsOpen: boolean;
  questOpen: boolean;
  bagOpen: boolean;
  mapOpen: boolean;
  onToggleStats: () => void;
  onToggleQuest: () => void;
  onToggleBag: () => void;
  onToggleMap: () => void;
}) {
  return (
    <aside className="panel-toggles" aria-label="Panel toggles">
      <PanelToggleButton open={statsOpen} label="Stats" onClick={onToggleStats} />
      <PanelToggleButton open={questOpen} label="Quest" onClick={onToggleQuest} />
      <PanelToggleButton open={bagOpen} label="Bag" onClick={onToggleBag} />
      <PanelToggleButton open={mapOpen} label="Map" onClick={onToggleMap} />
    </aside>
  );
}

function PanelToggleButton({
  open,
  label,
  onClick,
}: {
  open: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`panel-toggle${open ? ' panel-toggle--open' : ''}`}
      aria-label={open ? `Hide ${label}` : `Show ${label}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function VitalsStrip({ player }: { player: PlayerEntity | null }) {
  return (
    <section className="vitals-strip" aria-label="Vitals">
      <Meter label="HP" value={player?.health} max={player?.maxHealth} className="meter-hp" />
      <Meter label="MP" value={player?.mana} max={player?.maxMana} className="meter-mp" />
    </section>
  );
}

function PlayerPanel({ player }: { player: PlayerEntity | null }) {
  const xpProgress = getMeterProgress(player?.experience, player?.experienceToNextLevel);
  const stats = derivePlayerStats(player);

  return (
    <section className="hud player-panel" aria-label="Player status">
      <div className="panel-title">
        <strong>{player?.name ?? 'Player'}</strong>
        <span>Level {player?.level ?? 1}</span>
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
      <dl className="player-stats">
        <div><dt>Class</dt><dd>{stats.className}</dd></div>
        <div><dt>STR</dt><dd>{stats.strength}</dd></div>
        <div><dt>DEX</dt><dd>{stats.dexterity}</dd></div>
        <div><dt>INT</dt><dd>{stats.intellect}</dd></div>
        <div><dt>SP</dt><dd>{stats.skillPoints}</dd></div>
        <div><dt>Skills</dt><dd>{stats.unlockedSkills}</dd></div>
      </dl>
      <StatusPills effects={player?.statusEffects ?? []} />
    </section>
  );
}

function derivePlayerStats(player: PlayerEntity | null): {
  className: string;
  strength: number;
  dexterity: number;
  intellect: number;
  skillPoints: number;
  unlockedSkills: number;
} {
  const className = player?.className ?? 'wanderer';
  const level = player?.level ?? 1;
  const weights = STAT_WEIGHTS[className] ?? STAT_WEIGHTS.default;
  return {
    className: capitalize(className),
    strength: 6 + Math.floor(level * weights.str),
    dexterity: 6 + Math.floor(level * weights.dex),
    intellect: 6 + Math.floor(level * weights.int),
    skillPoints: player?.availableSkillPoints ?? 0,
    unlockedSkills: player?.unlockedSkills?.length ?? 0,
  };
}

const STAT_WEIGHTS: Record<string, { str: number; dex: number; int: number }> = {
  fighter: { str: 2.4, dex: 1.2, int: 0.8 },
  warrior: { str: 2.4, dex: 1.2, int: 0.8 },
  rogue: { str: 1.0, dex: 2.4, int: 1.2 },
  ranger: { str: 1.2, dex: 2.4, int: 1.0 },
  mage: { str: 0.8, dex: 1.0, int: 2.6 },
  cleric: { str: 1.4, dex: 1.0, int: 2.0 },
  default: { str: 1.5, dex: 1.5, int: 1.5 },
};

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function TargetPanel({
  player,
  target,
}: {
  player: PlayerEntity | null;
  target: GameClientState['enemies'][string] | null;
}) {
  const distance = player && target ? getDistance(player.position, target.position) : null;
  const healthRatio = target ? target.health / Math.max(1, target.maxHealth) : 0;
  const targetState = target ? getTargetState(target.isAlive, healthRatio) : 'No selection';
  const targetTone = target ? getTargetTone(target.isAlive, healthRatio) : 'none';

  return (
    <section className={`hud hud-target target-${targetTone}`} aria-label="Target">
      <div className="panel-title">
        <strong>{target ? target.name : 'No target'}</strong>
        <span>{target ? `Level ${target.level}` : '-'}</span>
      </div>
      <Meter label="HP" value={target?.health} max={target?.maxHealth} className="meter-enemy" />
      <div className="target-meta">
        <span>{targetState}</span>
        <span>{distance === null ? '-' : `${distance.toFixed(1)}m`}</span>
      </div>
      <StatusPills effects={target?.statusEffects ?? []} />
    </section>
  );
}

function MovementPanel({
  player,
  target,
}: {
  player: PlayerEntity | null;
  target: GameClientState['targetWorldPos'];
}) {
  if (!player?.isAlive || !target) {
    return null;
  }

  const distance = getDistance(player.position, target);
  const label = distance < 0.35 ? 'Arriving' : 'Moving';

  return (
    <section className="hud movement-panel" aria-label="Movement">
      <span>{label}</span>
      <strong>{distance.toFixed(1)}m</strong>
    </section>
  );
}

function NavigationPanel({
  state,
  player,
}: {
  state: GameClientState;
  player: PlayerEntity | null;
}) {
  if (!player) {
    return null;
  }

  const regionId = state.worldPublicState?.players[player.id]?.regionId
    ?? state.streamedRegionIds[0]
    ?? '';
  const region = regionId ? state.worldPublicState?.regions[regionId] : null;
  const targetDistance = state.targetWorldPos ? getDistance(player.position, state.targetWorldPos) : null;
  const speed = player.movement?.speed ?? 0;

  return (
    <section className="hud navigation-panel" aria-label="Navigation">
      <Metric label="Position" value={`${Math.round(player.position.x)}, ${Math.round(player.position.z)}`} />
      <Metric label="Zone" value={region?.name ?? 'Wilderness'} />
      <Metric label="Stream" value={`${state.streamedRegionIds.length}/${state.worldPublicState?.activeRegionCount ?? 0}`} />
      <Metric label="ETA" value={formatTravelEta(targetDistance, speed)} />
    </section>
  );
}

function CastingPanel({ player }: { player: PlayerEntity | null }) {
  const skill = player?.castingSkill ? SKILLS[player.castingSkill] : null;
  if (!player || !skill) {
    return null;
  }

  return (
    <section className="casting-panel" aria-label="Casting">
      <div className="panel-title">
        <strong>Casting {skill.name}</strong>
        <span>{Math.round(player.castingProgressMs)}ms / {skill.castMs}ms</span>
      </div>
      <div className="meter-track">
        <div
          className="meter-fill meter-cast"
          style={{ width: `${getMeterProgress(player.castingProgressMs, skill.castMs)}%` }}
        />
      </div>
    </section>
  );
}

function DeathOverlay({ onRespawn }: { onRespawn: () => void }) {
  return (
    <section className="death-overlay" aria-label="Death">
      <strong>You died</strong>
      <button type="button" onClick={onRespawn}>
        Respawn
      </button>
    </section>
  );
}

function Meter({
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

function StatusPills({ effects }: { effects: StatusEffect[] }) {
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="metric">
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function useSkillHotkeys(
  player: PlayerEntity | null,
  onCastSkill: (skillId: SkillId) => void,
) {
  const playerRef = useRef(player);
  playerRef.current = player;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) {
        return;
      }

      const slotIndex = getSkillSlotIndexForKeyboardCode(event.code);
      const skillId = slotIndex === null ? null : getHotkeySkill(playerRef.current, slotIndex);
      if (skillId) {
        event.preventDefault();
        onCastSkill(skillId);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCastSkill]);
}

function formatMeter(value = 0, max = 0): string {
  return `${Math.round(value)}/${Math.round(max)}`;
}

function getMeterProgress(value = 0, max = 0): number {
  if (max <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (value / max) * 100));
}

function getTargetState(isAlive: boolean, healthRatio: number): string {
  if (!isAlive) {
    return 'Defeated';
  }

  if (healthRatio <= 0.35) {
    return 'Weak';
  }

  return 'Engaged';
}

function getTargetTone(isAlive: boolean, healthRatio: number): 'defeated' | 'weak' | 'engaged' {
  if (!isAlive) {
    return 'defeated';
  }

  if (healthRatio <= 0.35) {
    return 'weak';
  }

  return 'engaged';
}

function getDistance(a: PlayerEntity['position'], b: PlayerEntity['position']): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function formatTravelEta(distance: number | null, speed: number): string {
  if (distance === null || speed <= 0) {
    return '-';
  }

  const seconds = Math.ceil(distance / speed);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}
