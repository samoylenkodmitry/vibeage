import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { SKILLS, type SkillId } from '../../../packages/content/skills';
import type { EnemyEntity, GameClientState, PlayerEntity } from './gameTypes';
import { HudPanels } from './hud/HudPanels';
import { NpcDialog } from './hud/NpcDialog';
import { SkillBar } from './hud/SkillBar';
import { subscribeWikiOpen } from './hud/wikiNavBus';
import { TargetPanel, VitalsStrip, resolveSelectedTarget } from './hud/PlatePanels';
import { getDistance, getMeterProgress } from './hud/hudPrimitives';
import {
  BASIC_ATTACK_SKILL_ID,
  getHotkeySkill,
  getSkillSlotIndexForKeyboardCode,
  isBasicAttackKeyboardCode,
  isEditableTarget,
} from './skillShortcuts';

type GameHudProps = {
  state: GameClientState;
  cameraAngleRef?: MutableRefObject<number>;
  navigationMarker?: { x: number; z: number } | null;
  onSetNavigationMarker?: (marker: { x: number; z: number } | null) => void;
  onDisconnect: () => void;
  onCastSkill: (skillId: SkillId) => void;
  onLearnSkill: (skillId: SkillId) => void;
  onUseItem: (slotIndex: number) => void;
  onCraftItem: (recipeSlotIndex: number) => void;
  onEquipItem: (slotIndex: number, requestedSlot?: string) => void;
  onUnequipItem: (slot: string) => void;
  onUpgradeSkill: (skillId: SkillId) => void;
  onTalkNpc: (npcId: string) => void;
  onAcceptQuest: (questId: string) => void;
  onCancelQuest: (questId: string) => void;
  onAdvanceQuest: (questId: string) => void;
  onClaimQuestReward: (questId: string) => void;
  onGmCommand: (cmd: {
    verb:
      | 'grantXp' | 'grantGold' | 'grantSp' | 'grantItem' | 'grantSkill'
      | 'setLevel' | 'setRace' | 'setClass' | 'setSpecialization';
    value: number | string;
    targetId?: string;
    quantity?: number;
  }) => void;
  onRespawn: () => void;
  onSelectTarget?: (targetId: string | null) => void;
  onCycleTarget?: () => void;
  onPickupNearest?: () => void;
  onMove?: () => void;
  onSendChat?: (text: string, scope: 'near' | 'all') => void;
};

export function GameHud({
  state,
  cameraAngleRef,
  navigationMarker,
  onSetNavigationMarker,
  onDisconnect,
  onCastSkill,
  onLearnSkill,
  onUseItem,
  onCraftItem,
  onEquipItem,
  onUnequipItem,
  onUpgradeSkill,
  onTalkNpc,
  onAcceptQuest,
  onCancelQuest,
  onAdvanceQuest,
  onClaimQuestReward,
  onGmCommand,
  onRespawn,
  onSelectTarget,
  onCycleTarget,
  onPickupNearest,
  onMove,
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

  useSkillHotkeys(player, onCastSkill, onCycleTarget, onPickupNearest, onMove);

  // Wiki nav bus: when a chip outside the Wiki (PlayerPanel stat
  // tooltips, SkillBar buttons) calls openWikiAt, force the Wiki
  // panel open so the navigation lands somewhere visible.
  useEffect(() => {
    return subscribeWikiOpen(() => panels.openWiki());
  }, [panels]);

  return (
    <>
      <HudTopStrips
        state={state}
        player={player}
        selfSelected={selfSelected}
        selectedEnemy={selectedEnemy}
        selectedOtherPlayer={selectedOtherPlayer}
        playerCount={playerCount}
        enemyCount={enemyCount}
        regionStatus={regionStatus}
        onDisconnect={onDisconnect}
        onSelectTarget={onSelectTarget}
      />
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
        onUseItem={onUseItem} onCraftItem={onCraftItem}
        onEquipItem={onEquipItem}
        onUnequipItem={onUnequipItem}
        onUpgradeSkill={onUpgradeSkill}
        onCancelQuest={onCancelQuest}
        onAdvanceQuest={onAdvanceQuest}
        onClaimQuestReward={onClaimQuestReward}
        onGmCommand={onGmCommand} onPickupNearest={onPickupNearest} onMove={onMove} onSendChat={onSendChat}
      />
      <NpcDialog player={player} onTalkNpc={onTalkNpc} onAcceptQuest={onAcceptQuest} />
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

function HudTopStrips({
  state,
  player,
  selfSelected,
  selectedEnemy,
  selectedOtherPlayer,
  playerCount,
  enemyCount,
  regionStatus,
  onDisconnect,
  onSelectTarget,
}: {
  state: GameClientState;
  player: PlayerEntity | null;
  selfSelected: boolean;
  selectedEnemy: EnemyEntity | null;
  selectedOtherPlayer: PlayerEntity | null;
  playerCount: number;
  enemyCount: number;
  regionStatus: string;
  onDisconnect: () => void;
  onSelectTarget?: (targetId: string | null) => void;
}) {
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


function PanelToggleStrip({ panels }: { panels: PanelState }) {
  return (
    <aside className="panel-toggles" aria-label="Panel toggles">
      <PanelToggleButton open={panels.statsOpen} label="Stats" onClick={panels.toggleStats} />
      <PanelToggleButton open={panels.treeOpen} label="Skills" onClick={panels.toggleTree} />
      <PanelToggleButton open={panels.actionsOpen} label="Actions" onClick={panels.toggleActions} />
      <PanelToggleButton open={panels.questOpen} label="Quest" onClick={panels.toggleQuest} />
      <PanelToggleButton open={panels.bagOpen} label="Bag" onClick={panels.toggleBag} />
      <PanelToggleButton open={panels.gearOpen} label="Gear" onClick={panels.toggleGear} />
      <PanelToggleButton open={panels.mapOpen} label="Map" onClick={panels.toggleMap} />
      <PanelToggleButton open={panels.chatOpen} label="Chat" onClick={panels.toggleChat} />
      <PanelToggleButton open={panels.wikiOpen} label="Wiki" onClick={panels.toggleWiki} />
      <PanelToggleButton open={panels.gmOpen} label="GM" onClick={panels.toggleGm} />
    </aside>
  );
}

type PanelState = ReturnType<typeof usePanelState>;

function usePanelState() {
  const [statsOpen, setStatsOpen] = useState(true);
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
  const [gmOpen, setGmOpen] = useState(false);
  // PR AA — the craft panel opens when the player taps a recipe in
  // their bag. Holds the slot index so we can find the recipe again
  // (item content + recipe spec come from ITEMS).
  const [craftRecipeSlot, setCraftRecipeSlot] = useState<number | null>(null);
  return {
    statsOpen,
    questOpen,
    bagOpen,
    gearOpen,
    mapOpen,
    treeOpen,
    actionsOpen,
    chatOpen,
    wikiOpen,
    gmOpen,
    craftRecipeSlot,
    toggleStats: () => setStatsOpen((prev) => !prev),
    toggleQuest: () => setQuestOpen((prev) => !prev),
    toggleBag: () => setBagOpen((prev) => !prev),
    toggleGear: () => setGearOpen((prev) => !prev),
    toggleMap: () => setMapOpen((prev) => !prev),
    toggleTree: () => setTreeOpen((prev) => !prev),
    toggleActions: () => setActionsOpen((prev) => !prev),
    toggleChat: () => setChatOpen((prev) => !prev),
    toggleWiki: () => setWikiOpen((prev) => !prev),
    openWiki: () => setWikiOpen(true),
    toggleGm: () => setGmOpen((prev) => !prev),
    openCraft: (slotIndex: number) => setCraftRecipeSlot(slotIndex),
    closeCraft: () => setCraftRecipeSlot(null),
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
  onMove?: () => void,
) {
  const playerRef = useRef(player);
  playerRef.current = player;
  const cycleRef = useRef(onCycleTarget);
  cycleRef.current = onCycleTarget;
  const pickupRef = useRef(onPickupNearest);
  pickupRef.current = onPickupNearest;
  const moveRef = useRef(onMove);
  moveRef.current = onMove;

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

      if (event.code === 'KeyM') {
        if (moveRef.current) {
          event.preventDefault();
          moveRef.current();
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
