import { FormEvent, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { SKILLS, type SkillId } from '../../../packages/content/skills';
import type { GameClientState, PlayerEntity } from './gameTypes';
import { ActionsPanel } from './hud/ActionsPanel';
import { ChatPanel } from './hud/ChatPanel';
import { CharacterPanel } from './hud/CharacterPanel';
import { InventoryPanel } from './hud/InventoryPanel';
import { PaperdollPanel } from './hud/PaperdollPanel';
import { WikiPanel } from './hud/WikiPanel';
import { CHARACTER_RACES, RACE_PROFILES, type CharacterRace } from '../../../packages/content/races';
import { CLASS_SKILL_TREES, type CharacterClass } from '../../../packages/content/classes';
import { MapPanel } from './hud/MapPanel';
import { SkillBar } from './hud/SkillBar';
import { SkillTreePanel } from './hud/SkillTreePanel';
import { StarterProgressPanel } from './hud/StarterProgressPanel';
import { capitalize, DEFAULT_CLASS_NAME } from './hud/textUtils';
import { useDraggablePanel } from './hud/useDraggablePanel';
import { TargetPanel, VitalsStrip, resolveSelectedTarget } from './hud/PlatePanels';
import { StatusPills, getDistance, getMeterProgress } from './hud/hudPrimitives';
import {
  BASIC_ATTACK_SKILL_ID,
  getHotkeySkill,
  getSkillSlotIndexForKeyboardCode,
  isBasicAttackKeyboardCode,
  isEditableTarget,
} from './skillShortcuts';

type StartPanelProps = {
  onStart: (playerName: string, race: string, className: string) => void;
};

const CLASS_NAMES = Object.keys(CLASS_SKILL_TREES) as CharacterClass[];

type GameHudProps = {
  state: GameClientState;
  cameraAngleRef?: MutableRefObject<number>;
  navigationMarker?: { x: number; z: number } | null;
  onSetNavigationMarker?: (marker: { x: number; z: number } | null) => void;
  onDisconnect: () => void;
  onCastSkill: (skillId: SkillId) => void;
  onLearnSkill: (skillId: SkillId) => void;
  onUseItem: (slotIndex: number) => void;
  onEquipItem: (slotIndex: number, requestedSlot?: string) => void;
  onUnequipItem: (slot: string) => void;
  onSelectClass: (className: string) => void;
  onSelectRace: (race: string) => void;
  onSelectSpecialization: (specializationId: string) => void;
  onUpgradeSkill: (skillId: SkillId) => void;
  onRespawn: () => void;
  onSelectTarget?: (targetId: string | null) => void;
  onCycleTarget?: () => void;
  onPickupNearest?: () => void;
  onSendChat?: (text: string, scope: 'near' | 'all') => void;
};

export function StartPanel({ onStart }: StartPanelProps) {
  const [playerName, setPlayerName] = useState('');
  const [race, setRace] = useState<CharacterRace>('human');
  const [className, setClassName] = useState<CharacterClass>('mage');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = playerName.trim();
    if (trimmedName) {
      onStart(trimmedName, race, className);
    }
  }

  const raceProfile = RACE_PROFILES[race];
  const classTree = CLASS_SKILL_TREES[className];

  return (
    <main className="start-screen">
      <form className="start-panel start-panel-character" onSubmit={submit}>
        <h1>VibeAge</h1>
        <label htmlFor="player-name">Character Name</label>
        <input
          id="player-name"
          value={playerName}
          onChange={(event) => setPlayerName(event.target.value)}
          placeholder="Enter your character name"
          autoComplete="off"
        />
        <fieldset className="character-fieldset">
          <legend>Race</legend>
          <div className="character-grid">
            {CHARACTER_RACES.map((option) => (
              <label key={option} className={`character-option${race === option ? ' character-option--active' : ''}`}>
                <input type="radio" name="race" value={option} checked={race === option} onChange={() => setRace(option)} />
                <span>{RACE_PROFILES[option].name}</span>
              </label>
            ))}
          </div>
          <small className="character-blurb">{raceProfile.description}</small>
        </fieldset>
        <fieldset className="character-fieldset">
          <legend>Class</legend>
          <div className="character-grid">
            {CLASS_NAMES.map((option) => (
              <label key={option} className={`character-option${className === option ? ' character-option--active' : ''}`}>
                <input type="radio" name="className" value={option} checked={className === option} onChange={() => setClassName(option)} />
                <span>{capitalize(option)}</span>
              </label>
            ))}
          </div>
          <small className="character-blurb">{classTree?.description ?? ''}</small>
        </fieldset>
        <button type="submit" disabled={!playerName.trim()}>
          Enter the World
        </button>
      </form>
    </main>
  );
}

export function GameHud({
  state,
  cameraAngleRef,
  navigationMarker,
  onSetNavigationMarker,
  onDisconnect,
  onCastSkill,
  onLearnSkill,
  onUseItem,
  onEquipItem,
  onUnequipItem,
  onSelectClass,
  onSelectRace,
  onSelectSpecialization,
  onUpgradeSkill,
  onRespawn,
  onSelectTarget,
  onCycleTarget,
  onPickupNearest,
  onSendChat,
}: GameHudProps) {
  const player = state.myPlayerId ? state.players[state.myPlayerId] ?? null : null;
  const { selfSelected, selectedEnemy, selectedOtherPlayer, targetIsAlive } = resolveSelectedTarget(state, player);
  const playerCount = Object.keys(state.players).length;
  const enemyCount = Object.values(state.enemies).filter((enemy) => enemy.isAlive).length;
  const regionStatus = state.worldPublicState
    ? `${state.worldPublicState.activeRegionCount}/${state.worldPublicState.regionCount}`
    : '-';
  const now = useNow(100);
  const panels = usePanelState();

  useSkillHotkeys(player, onCastSkill, onCycleTarget, onPickupNearest);

  return (
    <>
      <HudConnectionStrip
        connectionState={state.connectionState}
        message={state.message}
        onDisconnect={onDisconnect}
      />
      <HudWorldStatsStrip
        playerCount={playerCount}
        enemyCount={enemyCount}
        regionStatus={regionStatus}
        lootCount={Object.keys(state.groundLoot).length}
      />
      <VitalsStrip
        player={player}
        selected={selfSelected}
        onSelectSelf={player ? () => onSelectTarget?.(player.id) : undefined}
      />
      <TargetPanel
        player={player}
        enemy={selectedEnemy}
        otherPlayer={selectedOtherPlayer}
        selfTargeted={selfSelected}
        onClose={onSelectTarget ? () => onSelectTarget(null) : undefined}
      />
      <LocationPanel state={state} player={player} />
      <HudPanels
        panels={panels}
        state={state}
        player={player}
        now={now}
        hasSelectedTarget={targetIsAlive}
        hasLootNearby={Object.keys(state.groundLoot).length > 0}
        cameraAngleRef={cameraAngleRef}
        navigationMarker={navigationMarker}
        onSetNavigationMarker={onSetNavigationMarker}
        onCastSkill={onCastSkill}
        onLearnSkill={onLearnSkill}
        onUseItem={onUseItem}
        onEquipItem={onEquipItem}
        onUnequipItem={onUnequipItem}
        onSelectClass={onSelectClass}
        onSelectRace={onSelectRace}
        onSelectSpecialization={onSelectSpecialization}
        onUpgradeSkill={onUpgradeSkill}
        onPickupNearest={onPickupNearest}
        onSendChat={onSendChat}
      />
      <CastingPanel player={player} />
      <SkillBar
        player={player}
        now={now}
        hasSelectedTarget={targetIsAlive}
        onCastSkill={onCastSkill}
      />
      <PanelToggleStrip panels={panels} />
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

function HudConnectionStrip({
  connectionState,
  message,
  onDisconnect,
}: {
  connectionState: GameClientState['connectionState'];
  message: string;
  onDisconnect: () => void;
}) {
  return (
    <section className="hud hud-top" aria-label="Connection">
      <strong>VibeAge</strong>
      <span className={`status-dot status-${connectionState}`} />
      <span>{message}</span>
      <button type="button" className="ghost-button" onClick={onDisconnect}>
        Disconnect
      </button>
    </section>
  );
}

function HudWorldStatsStrip({
  playerCount,
  enemyCount,
  regionStatus,
  lootCount,
}: {
  playerCount: number;
  enemyCount: number;
  regionStatus: string;
  lootCount: number;
}) {
  return (
    <section className="hud hud-stats" aria-label="World status">
      <Metric label="Players" value={String(playerCount)} />
      <Metric label="Enemies" value={String(enemyCount)} />
      <Metric label="Regions" value={regionStatus} />
      <Metric label="Loot" value={String(lootCount)} />
    </section>
  );
}

type HudPanelsProps = {
  panels: PanelState;
  state: GameClientState;
  player: PlayerEntity | null;
  now: number;
  hasSelectedTarget: boolean;
  hasLootNearby: boolean;
  cameraAngleRef?: MutableRefObject<number>;
  navigationMarker?: { x: number; z: number } | null;
  onSetNavigationMarker?: (marker: { x: number; z: number } | null) => void;
  onCastSkill: (skillId: SkillId) => void;
  onLearnSkill: (skillId: SkillId) => void;
  onUseItem: (slotIndex: number) => void;
  onEquipItem: (slotIndex: number, requestedSlot?: string) => void;
  onUnequipItem: (slot: string) => void;
  onSelectClass: (className: string) => void;
  onSelectRace: (race: string) => void;
  onSelectSpecialization: (specializationId: string) => void;
  onUpgradeSkill: (skillId: SkillId) => void;
  onPickupNearest?: () => void;
  onSendChat?: (text: string, scope: 'near' | 'all') => void;
};

function HudPanels({
  panels,
  state,
  player,
  now,
  hasSelectedTarget,
  hasLootNearby,
  cameraAngleRef,
  navigationMarker,
  onSetNavigationMarker,
  onCastSkill,
  onLearnSkill,
  onUseItem,
  onEquipItem,
  onUnequipItem,
  onSelectClass,
  onSelectRace,
  onSelectSpecialization,
  onUpgradeSkill,
  onPickupNearest,
  onSendChat,
}: HudPanelsProps) {
  return (
    <>
      {panels.statsOpen && <PlayerPanel player={player} />}
      {panels.questOpen && (
        <StarterProgressPanel player={player} progress={state.starterProgress} onLearnSkill={onLearnSkill} />
      )}
      {panels.bagOpen && (
        <InventoryPanel
          inventory={state.inventory}
          maxSlots={state.maxInventorySlots}
          onUseItem={onUseItem}
          onEquipItem={onEquipItem}
        />
      )}
      {panels.gearOpen && (
        <PaperdollPanel equipment={state.equipment} onUnequip={onUnequipItem} />
      )}
      {panels.characterOpen && (
        <CharacterPanel
          player={player}
          onSelectClass={onSelectClass}
          onSelectRace={onSelectRace}
          onSelectSpecialization={onSelectSpecialization}
        />
      )}
      {panels.mapOpen && (
        <MapPanel
          player={player}
          cameraAngleRef={cameraAngleRef}
          navigationMarker={navigationMarker ?? null}
          onSetNavigationMarker={onSetNavigationMarker}
        />
      )}
      {panels.treeOpen && (
        <SkillTreePanel
          player={player}
          onLearnSkill={onLearnSkill}
          onUpgradeSkill={onUpgradeSkill}
          rejections={state.learnSkillRejections}
        />
      )}
      {panels.actionsOpen && (
        <ActionsPanel
          player={player}
          now={now}
          hasSelectedTarget={hasSelectedTarget}
          hasLootNearby={hasLootNearby}
          onCastSkill={onCastSkill}
          onPickupNearest={onPickupNearest ?? (() => undefined)}
        />
      )}
      {panels.chatOpen && onSendChat && (
        <ChatPanel lines={state.chatLines} myPlayerId={state.myPlayerId} onSendChat={onSendChat} />
      )}
      {panels.wikiOpen && <WikiPanel />}
    </>
  );
}

function PanelToggleStrip({ panels }: { panels: PanelState }) {
  return (
    <aside className="panel-toggles" aria-label="Panel toggles">
      <PanelToggleButton open={panels.statsOpen} label="Stats" onClick={panels.toggleStats} />
      <PanelToggleButton open={panels.characterOpen} label="Char" onClick={panels.toggleCharacter} />
      <PanelToggleButton open={panels.treeOpen} label="Skills" onClick={panels.toggleTree} />
      <PanelToggleButton open={panels.actionsOpen} label="Actions" onClick={panels.toggleActions} />
      <PanelToggleButton open={panels.questOpen} label="Quest" onClick={panels.toggleQuest} />
      <PanelToggleButton open={panels.bagOpen} label="Bag" onClick={panels.toggleBag} />
      <PanelToggleButton open={panels.gearOpen} label="Gear" onClick={panels.toggleGear} />
      <PanelToggleButton open={panels.mapOpen} label="Map" onClick={panels.toggleMap} />
      <PanelToggleButton open={panels.chatOpen} label="Chat" onClick={panels.toggleChat} />
      <PanelToggleButton open={panels.wikiOpen} label="Wiki" onClick={panels.toggleWiki} />
    </aside>
  );
}

type PanelState = ReturnType<typeof usePanelState>;

function usePanelState() {
  const [statsOpen, setStatsOpen] = useState(true);
  const [characterOpen, setCharacterOpen] = useState(false);
  const [questOpen, setQuestOpen] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [gearOpen, setGearOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  // Actions defaults open: it's the home of the new Attack + Pickup
  // buttons so players see them immediately on join.
  const [actionsOpen, setActionsOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [wikiOpen, setWikiOpen] = useState(false);
  return {
    statsOpen,
    characterOpen,
    questOpen,
    bagOpen,
    gearOpen,
    mapOpen,
    treeOpen,
    actionsOpen,
    chatOpen,
    wikiOpen,
    toggleStats: () => setStatsOpen((prev) => !prev),
    toggleCharacter: () => setCharacterOpen((prev) => !prev),
    toggleQuest: () => setQuestOpen((prev) => !prev),
    toggleBag: () => setBagOpen((prev) => !prev),
    toggleGear: () => setGearOpen((prev) => !prev),
    toggleMap: () => setMapOpen((prev) => !prev),
    toggleTree: () => setTreeOpen((prev) => !prev),
    toggleActions: () => setActionsOpen((prev) => !prev),
    toggleChat: () => setChatOpen((prev) => !prev),
    toggleWiki: () => setWikiOpen((prev) => !prev),
  };
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

function PlayerPanel({ player }: { player: PlayerEntity | null }) {
  const stats = derivePlayerStats(player);
  const derived = player?.stats ?? {};
  const panelRef = useDraggablePanel<HTMLElement>('stats');
  const raceLabel = player?.race ? capitalize(player.race) : '';

  return (
    <section ref={panelRef} className="hud player-panel" aria-label="Player status">
      <div className="panel-title">
        <strong>Stats</strong>
        <span>{raceLabel ? `${raceLabel} ${stats.className}` : stats.className}</span>
      </div>
      <dl className="player-stats">
        <div><dt>Level</dt><dd>{player?.level ?? 1}</dd></div>
        <div><dt>SP</dt><dd>{stats.skillPoints}</dd></div>
        <div><dt>STR</dt><dd>{derived.str ?? stats.strength}</dd></div>
        <div><dt>DEX</dt><dd>{derived.dex ?? stats.dexterity}</dd></div>
        <div><dt>CON</dt><dd>{derived.con ?? stats.constitution}</dd></div>
        <div><dt>INT</dt><dd>{derived.int ?? stats.intellect}</dd></div>
        <div><dt>WIT</dt><dd>{derived.wit ?? stats.wit}</dd></div>
        <div><dt>MEN</dt><dd>{derived.men ?? stats.mental}</dd></div>
      </dl>
      {derived.pAtk !== undefined && (
        <dl className="player-stats player-stats-combat">
          <div><dt>P.Atk</dt><dd>{derived.pAtk}</dd></div>
          <div><dt>M.Atk</dt><dd>{derived.mAtk}</dd></div>
          <div><dt>P.Def</dt><dd>{derived.pDef}</dd></div>
          <div><dt>M.Def</dt><dd>{derived.mDef}</dd></div>
          <div><dt>HP/s</dt><dd>{derived.hpRegen}</dd></div>
          <div><dt>MP/s</dt><dd>{derived.mpRegen}</dd></div>
          <div><dt>Acc</dt><dd>{derived.accuracy}</dd></div>
          <div><dt>Evd</dt><dd>{derived.evasion}</dd></div>
          <div><dt>Atk Spd</dt><dd>{derived.attackSpeed}</dd></div>
          <div><dt>Cast Spd</dt><dd>{derived.castSpeed?.toFixed(2)}</dd></div>
          <div><dt>Speed</dt><dd>{derived.runSpeed}</dd></div>
          <div><dt>Crit %</dt><dd>{derived.critChance ? Math.round(derived.critChance * 100) : 0}</dd></div>
        </dl>
      )}
      <StatusPills effects={player?.statusEffects ?? []} />
    </section>
  );
}

type DerivedStats = {
  className: string;
  strength: number;
  dexterity: number;
  constitution: number;
  intellect: number;
  wit: number;
  mental: number;
  skillPoints: number;
  unlockedSkills: number;
};

function derivePlayerStats(player: PlayerEntity | null): DerivedStats {
  const className = player?.className ?? DEFAULT_CLASS_NAME;
  const level = player?.level ?? 1;
  const weights = STAT_WEIGHTS[className] ?? STAT_WEIGHTS.default;
  return {
    className: capitalize(className),
    strength: 8 + Math.floor(level * weights.str),
    dexterity: 8 + Math.floor(level * weights.dex),
    constitution: 8 + Math.floor(level * weights.con),
    intellect: 8 + Math.floor(level * weights.int),
    wit: 8 + Math.floor(level * weights.wit),
    mental: 8 + Math.floor(level * weights.men),
    skillPoints: player?.availableSkillPoints ?? 0,
    unlockedSkills: player?.unlockedSkills?.length ?? 0,
  };
}

type StatWeights = { str: number; dex: number; con: number; int: number; wit: number; men: number };

const STAT_WEIGHTS: Record<string, StatWeights> = {
  warrior: { str: 2.4, dex: 1.2, con: 2.0, int: 0.8, wit: 0.8, men: 0.8 },
  ranger: { str: 1.4, dex: 2.4, con: 1.4, int: 1.0, wit: 1.6, men: 1.0 },
  mage: { str: 0.8, dex: 1.0, con: 1.0, int: 2.6, wit: 2.2, men: 1.4 },
  healer: { str: 1.4, dex: 1.0, con: 1.6, int: 2.0, wit: 1.4, men: 2.4 },
  knight: { str: 2.2, dex: 1.0, con: 2.4, int: 1.0, wit: 0.8, men: 1.0 },
  paladin: { str: 1.8, dex: 1.0, con: 2.0, int: 1.6, wit: 1.0, men: 2.0 },
  rogue: { str: 1.4, dex: 2.6, con: 1.2, int: 0.8, wit: 1.6, men: 1.0 },
  default: { str: 1.5, dex: 1.5, con: 1.5, int: 1.5, wit: 1.5, men: 1.5 },
};


function LocationPanel({
  state,
  player,
}: {
  state: GameClientState;
  player: PlayerEntity | null;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!player) return null;

  const regionId = state.worldPublicState?.players[player.id]?.regionId
    ?? state.streamedRegionIds[0]
    ?? '';
  const region = regionId ? state.worldPublicState?.regions[regionId] : null;
  const zoneName = region?.name ?? 'Wilderness';
  const target = state.targetWorldPos;
  const targetDistance = target ? getDistance(player.position, target) : null;
  const speed = player.movement?.speed ?? 0;
  const moving = Boolean(target && player.isAlive);

  return (
    <section className={`hud location-panel${expanded ? ' location-panel--expanded' : ''}`} aria-label="Location">
      <button
        type="button"
        className="location-panel-summary"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <strong>{zoneName}</strong>
        {moving && targetDistance !== null && (
          <span className="location-panel-distance">{targetDistance.toFixed(1)}m</span>
        )}
        <span className="location-panel-chevron" aria-hidden>{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <dl className="location-panel-detail">
          <div><dt>Pos</dt><dd>{Math.round(player.position.x)}, {Math.round(player.position.z)}</dd></div>
          <div><dt>Zone</dt><dd>{zoneName}</dd></div>
          <div><dt>Stream</dt><dd>{state.streamedRegionIds.length}/{state.worldPublicState?.activeRegionCount ?? 0}</dd></div>
          <div><dt>ETA</dt><dd>{formatTravelEta(targetDistance, speed)}</dd></div>
        </dl>
      )}
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
  onCycleTarget?: () => void,
  onPickupNearest?: () => void,
) {
  const playerRef = useRef(player);
  playerRef.current = player;
  const cycleRef = useRef(onCycleTarget);
  cycleRef.current = onCycleTarget;
  const pickupRef = useRef(onPickupNearest);
  pickupRef.current = onPickupNearest;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) {
        return;
      }

      // Tab cycles to the next enemy by distance. preventDefault stops
      // the browser from shifting focus to the next focusable element
      // (which would yank focus off the canvas and break subsequent
      // hotkeys).
      if (event.code === 'Tab') {
        if (cycleRef.current) {
          event.preventDefault();
          cycleRef.current();
        }
        return;
      }

      if (event.code === 'KeyF') {
        if (pickupRef.current) {
          event.preventDefault();
          pickupRef.current();
        }
        return;
      }

      if (isBasicAttackKeyboardCode(event.code)) {
        event.preventDefault();
        onCastSkill(BASIC_ATTACK_SKILL_ID);
        return;
      }

      // Number row 1..0 → slots 0..9, top QWERTY row Q..P → slots
      // 10..19. Both rows are browser-safe (no F-key reservations).
      const slotIndex = getSkillSlotIndexForKeyboardCode(event.code);
      if (slotIndex !== null) {
        const skillId = getHotkeySkill(playerRef.current, slotIndex);
        if (skillId) {
          event.preventDefault();
          onCastSkill(skillId);
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCastSkill]);
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
