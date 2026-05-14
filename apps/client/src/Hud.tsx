import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ITEMS, isUsableConsumable } from '../../../packages/content/items';
import { SKILLS, type SkillId } from '../../../packages/content/skills';
import type { InventorySlot, StatusEffect } from '../../../packages/protocol/messages';
import type { GameClientState, PlayerEntity } from './gameTypes';
import { StarterProgressPanel } from './hud/StarterProgressPanel';
import {
  getHotkeySkill,
  getSkillSlotAriaHotkeys,
  getSkillSlotIndexForKeyboardCode,
  isEditableTarget,
  SKILL_BAR_HOTKEYS,
  SKILL_BAR_SLOT_COUNT,
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
  const now = useNow(100);

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
        <Metric label="Loot" value={String(Object.keys(state.groundLoot).length)} />
      </section>
      <PlayerPanel player={player} />
      <TargetPanel target={selectedTarget} />
      <StarterProgressPanel player={player} progress={state.starterProgress} onLearnSkill={onLearnSkill} />
      <InventoryPanel inventory={state.inventory} maxSlots={state.maxInventorySlots} onUseItem={onUseItem} />
      <CastingPanel player={player} />
      <SkillBar player={player} now={now} onCastSkill={onCastSkill} />
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

function PlayerPanel({ player }: { player: PlayerEntity | null }) {
  const xpProgress = getMeterProgress(player?.experience, player?.experienceToNextLevel);

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
      <StatusPills effects={player?.statusEffects ?? []} />
    </section>
  );
}

function TargetPanel({ target }: { target: GameClientState['enemies'][string] | null }) {
  return (
    <section className="hud hud-target" aria-label="Target">
      <div className="panel-title">
        <strong>{target ? target.name : 'No target'}</strong>
        <span>{target ? `Level ${target.level}` : '-'}</span>
      </div>
      <Meter label="HP" value={target?.health} max={target?.maxHealth} className="meter-enemy" />
      <StatusPills effects={target?.statusEffects ?? []} />
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

function SkillBar({
  player,
  now,
  onCastSkill,
}: {
  player: PlayerEntity | null;
  now: number;
  onCastSkill: (skillId: SkillId) => void;
}) {
  const slots = useMemo(() => {
    return Array.from({ length: SKILL_BAR_SLOT_COUNT }, (_, index) => getHotkeySkill(player, index));
  }, [player]);

  return (
    <section className="skill-bar" aria-label="Skills">
      {slots.map((skillId, index) => (
        <SkillButton
          key={`${index}:${skillId ?? 'empty'}`}
          skillId={skillId}
          hotkey={SKILL_BAR_HOTKEYS[index] ?? ''}
          ariaHotkeys={getSkillSlotAriaHotkeys(index)}
          player={player}
          now={now}
          onCastSkill={onCastSkill}
        />
      ))}
    </section>
  );
}

function SkillButton({
  skillId,
  hotkey,
  ariaHotkeys,
  player,
  now,
  onCastSkill,
}: {
  skillId: SkillId | null;
  hotkey: string;
  ariaHotkeys: string;
  player: PlayerEntity | null;
  now: number;
  onCastSkill: (skillId: SkillId) => void;
}) {
  const skill = skillId ? SKILLS[skillId] : null;
  const cooldownEnd = skillId ? player?.skillCooldownEndTs?.[skillId] ?? 0 : 0;
  const remainingMs = Math.max(0, cooldownEnd - now);
  const isReady = remainingMs === 0;
  const disabled = !skill || !player?.isAlive || !isReady;
  const cooldownProgress = skill ? Math.min(1, remainingMs / skill.cooldownMs) : 0;

  return (
    <button
      type="button"
      className="skill-button"
      disabled={disabled}
      aria-label={skill ? `Cast ${skill.name}` : 'Empty skill slot'}
      aria-keyshortcuts={ariaHotkeys}
      style={{ '--cooldown-progress': cooldownProgress } as CSSProperties}
      onClick={() => skill && onCastSkill(skill.id)}
    >
      <span>{hotkey}</span>
      <strong>{skill?.name ?? 'Empty'}</strong>
      <small>{formatSkillFooter(skill?.manaCost, remainingMs)}</small>
    </button>
  );
}

function InventoryPanel({
  inventory,
  maxSlots,
  onUseItem,
}: {
  inventory: InventorySlot[];
  maxSlots: number;
  onUseItem: (slotIndex: number) => void;
}) {
  return (
    <section className="inventory-panel" aria-label="Inventory">
      {Array.from({ length: maxSlots }).map((_, index) => {
        const slot = inventory[index] ?? null;
        const item = slot ? ITEMS[slot.itemId] : null;
        const canUse = isUsableConsumable(item);
        const itemName = item?.name ?? slot?.itemId ?? 'Empty slot';
        const title = slot
          ? `${itemName} (${slot.quantity})${canUse ? '' : ' - not usable'}`
          : 'Empty slot';

        return (
          <button
            key={index}
            type="button"
            className="inventory-slot"
            disabled={!canUse}
            title={title}
            aria-label={slot && canUse ? `Use ${itemName}` : `Inventory slot ${index + 1}: ${itemName}`}
            onClick={() => canUse && onUseItem(index)}
            onContextMenu={(event) => {
              event.preventDefault();
              if (canUse) {
                onUseItem(index);
              }
            }}
          >
            <span>{slot ? getItemInitial(itemName) : ''}</span>
            {slot && slot.quantity > 1 && <strong>{slot.quantity}</strong>}
          </button>
        );
      })}
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

function formatSkillFooter(manaCost: number | undefined, remainingMs: number): string {
  if (!manaCost) {
    return '-';
  }

  if (remainingMs > 0) {
    return `${(remainingMs / 1_000).toFixed(1)}s`;
  }

  return `${manaCost} MP`;
}

function getItemInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}
