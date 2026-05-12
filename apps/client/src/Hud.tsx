import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { SKILLS, type SkillId } from '../../../packages/content/skills';
import { getHotkeySkill } from './gameReducer';
import type { GameClientState, PlayerEntity } from './gameTypes';

type StartPanelProps = {
  onStart: (playerName: string) => void;
};

type GameHudProps = {
  state: GameClientState;
  onDisconnect: () => void;
  onCastSkill: (skillId: SkillId) => void;
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

export function GameHud({ state, onDisconnect, onCastSkill }: GameHudProps) {
  const player = state.myPlayerId ? state.players[state.myPlayerId] ?? null : null;
  const selectedTarget = state.selectedTargetId ? state.enemies[state.selectedTargetId] ?? null : null;
  const playerCount = Object.keys(state.players).length;
  const enemyCount = Object.values(state.enemies).filter((enemy) => enemy.isAlive).length;

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
      <section className="hud hud-stats" aria-label="Player status">
        <Metric label="HP" value={formatMeter(player?.health, player?.maxHealth)} />
        <Metric label="MP" value={formatMeter(player?.mana, player?.maxMana)} />
        <Metric label="LVL" value={String(player?.level ?? 1)} />
        <Metric label="Players" value={String(playerCount)} />
        <Metric label="Enemies" value={String(enemyCount)} />
      </section>
      <section className="hud hud-target" aria-label="Target">
        <span>{selectedTarget ? selectedTarget.name : 'No target'}</span>
        <span>{selectedTarget ? formatMeter(selectedTarget.health, selectedTarget.maxHealth) : '-'}</span>
      </section>
      <SkillBar player={player} onCastSkill={onCastSkill} />
      {state.combatLog.length > 0 && (
        <section className="combat-log" aria-label="Combat log">
          {state.combatLog.map((line) => (
            <span key={line.id}>{line.text}</span>
          ))}
        </section>
      )}
    </>
  );
}

function SkillBar({
  player,
  onCastSkill,
}: {
  player: PlayerEntity | null;
  onCastSkill: (skillId: SkillId) => void;
}) {
  const slots = useMemo(() => {
    return [0, 1, 2, 3].map((index) => getHotkeySkill(player, index));
  }, [player]);

  return (
    <section className="skill-bar" aria-label="Skills">
      {slots.map((skillId, index) => (
        <SkillButton
          key={`${index}:${skillId ?? 'empty'}`}
          skillId={skillId}
          hotkey={index === 0 ? 'Q' : String(index + 1)}
          player={player}
          onCastSkill={onCastSkill}
        />
      ))}
    </section>
  );
}

function SkillButton({
  skillId,
  hotkey,
  player,
  onCastSkill,
}: {
  skillId: SkillId | null;
  hotkey: string;
  player: PlayerEntity | null;
  onCastSkill: (skillId: SkillId) => void;
}) {
  const skill = skillId ? SKILLS[skillId] : null;
  const cooldownEnd = skillId ? player?.skillCooldownEndTs?.[skillId] ?? 0 : 0;
  const isReady = !cooldownEnd || cooldownEnd <= Date.now();
  const disabled = !skill || !player?.isAlive || !isReady;

  return (
    <button
      type="button"
      className="skill-button"
      disabled={disabled}
      aria-label={skill ? `Cast ${skill.name}` : 'Empty skill slot'}
      onClick={() => skill && onCastSkill(skill.id)}
    >
      <span>{hotkey}</span>
      <strong>{skill?.name ?? 'Empty'}</strong>
      <small>{skill ? `${skill.manaCost} MP` : '-'}</small>
    </button>
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
      if (isTypingTarget(event.target)) {
        return;
      }

      const slotIndex = getSlotIndex(event.code);
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

function getSlotIndex(code: string): number | null {
  if (code === 'KeyQ' || code === 'Digit1') {
    return 0;
  }

  if (code === 'Digit2') {
    return 1;
  }

  if (code === 'Digit3') {
    return 2;
  }

  if (code === 'Digit4') {
    return 3;
  }

  return null;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'));
}

function formatMeter(value = 0, max = 0): string {
  return `${Math.round(value)}/${Math.round(max)}`;
}
