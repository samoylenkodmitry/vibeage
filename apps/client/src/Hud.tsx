import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { SKILLS, type SkillId } from '../../../packages/content/skills';
import type { EnemyEntity, GameClientState, PlayerEntity } from './gameTypes';
import { CombatSfxBridge } from './hud/CombatSfxBridge';
import { GainBurst } from './hud/GainBurst';
import { HudPanels } from './hud/HudPanels';
import { HitShake } from './hud/HitShake';
import { LifeCueBridge } from './hud/LifeCueBridge';
import { HurtVignette } from './hud/HurtVignette';
import { LevelUpBurst } from './hud/LevelUpBurst';
import { QuestCompleteBurst } from './hud/QuestCompleteBurst';
import { SfxMuteButton } from './hud/SfxMuteButton';
import { CombatLogPanel } from './hud/CombatLogPanel';
import { LootPickupHint } from './hud/LootPickupHint';
import { NpcDialog } from './hud/NpcDialog';
import { QuestTrackerStrip } from './hud/QuestTrackerStrip';
import { ReturnToNpcHint } from './hud/ReturnToNpcHint';
import { SkillUseHint } from './hud/SkillUseHint';
import { TargetingHint } from './hud/TargetingHint';
import { ZoneBanner } from './hud/ZoneBanner';
import { usePersistedToggle } from './hud/usePersistedToggle';
import { WelcomeOverlay } from './hud/WelcomeOverlay';
import { VendorPanel } from './hud/VendorPanel';
import { VENDORS } from '../../../packages/content/vendors';
import { SkillBar } from './hud/SkillBar';
import { useItemShortcutBindings } from './hud/useItemShortcuts';
import { subscribeWikiOpen } from './hud/wikiNavBus';
import { TargetPanel, VitalsStrip, resolveSelectedTarget } from './hud/PlatePanels';
import { getDistance, getMeterProgress } from './hud/hudPrimitives';
import {
  BASIC_ATTACK_SKILL_ID,
  getSkillSlotIndexForKeyboardCode,
  isBasicAttackKeyboardCode,
  isEditableTarget,
  resolveSlotBinding,
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
  /** §46/slice-new — drop an inventory stack to ground loot. */
  onDropItem: (slotIndex: number, count?: number) => void;
  /** Bag context menu — destroy a stack (no ground loot). */
  onDestroyItem: (slotIndex: number, count?: number) => void;
  onCraftItem: (recipeSlotIndex: number) => void;
  onEquipItem: (slotIndex: number, requestedSlot?: string) => void;
  onUnequipItem: (slot: string) => void;
  onUpgradeSkill: (skillId: SkillId) => void;
  onTalkNpc: (npcId: string) => void;
  onAcceptQuest: (questId: string) => void;
  onCancelQuest: (questId: string) => void;
  onAdvanceQuest: (questId: string) => void;
  onClaimQuestReward: (questId: string) => void;
  onSetTrackedQuest?: (questId: string | null) => void;
  onBuyFromVendor: (vendorId: string, itemId: string, quantity: number) => void;
  onSellToVendor: (vendorId: string, itemId: string, quantity: number) => void;
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

export function GameHud(props: GameHudProps) {
  const {
    state, cameraAngleRef, navigationMarker, onSetNavigationMarker, onDisconnect,
    onCastSkill, onLearnSkill, onUseItem, onDropItem, onDestroyItem, onCraftItem, onEquipItem, onUnequipItem,
    onUpgradeSkill, onTalkNpc, onAcceptQuest, onCancelQuest, onAdvanceQuest,
    onClaimQuestReward, onSetTrackedQuest, onBuyFromVendor, onSellToVendor, onGmCommand, onRespawn,
    onSelectTarget, onCycleTarget, onPickupNearest, onMove, onSendChat,
  } = props;
  const player = state.myPlayerId ? state.players[state.myPlayerId] ?? null : null;
  const { selfSelected, selectedEnemy, selectedOtherPlayer, targetIsAlive } = resolveSelectedTarget(state, player);
  const playerCount = Object.keys(state.players).length;
  const enemyCount = Object.values(state.enemies).filter((enemy) => enemy.isAlive).length;
  const regionStatus = state.worldPublicState
    ? `${state.worldPublicState.activeRegionCount}/${state.worldPublicState.regionCount}`
    : '-';
  const now = useNow(100);
  const panels = usePanelState();
  const items = useItemShortcutBindings(state.inventory, onUseItem);
  useSlotHotkeysFor(player, items, { onCastSkill, onCycleTarget, onPickupNearest, onMove });

  // Wiki nav bus: when a chip outside the Wiki (PlayerPanel stat
  // tooltips, SkillBar buttons) calls openWikiAt, force the Wiki
  // panel open so the navigation lands somewhere visible.
  useEffect(() => {
    return subscribeWikiOpen(() => panels.openWiki());
  }, [panels]);

  return (
    <>
      <SfxMuteButton /><CombatSfxBridge enemies={state.enemies} visualEvents={state.visualEvents} />{player && (<><HurtVignette health={player.health} /><HitShake health={player.health} /><LifeCueBridge isAlive={player.isAlive} /><GainBurst experience={player.experience} gold={player.gold ?? 0} /><LevelUpBurst level={player.level} /><QuestCompleteBurst completed={player.questState?.completed ?? []} /></>)}
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
        onUseItem={onUseItem} onDropItem={onDropItem} onDestroyItem={onDestroyItem} onCraftItem={onCraftItem}
        onEquipItem={onEquipItem}
        onUnequipItem={onUnequipItem}
        onUpgradeSkill={onUpgradeSkill}
        onCancelQuest={onCancelQuest}
        onAdvanceQuest={onAdvanceQuest}
        onClaimQuestReward={onClaimQuestReward}
        onSetTrackedQuest={onSetTrackedQuest}
        onGmCommand={onGmCommand} onPickupNearest={onPickupNearest} onMove={onMove} onSendChat={onSendChat}
        onBindItem={items.bindItem}
      />
      <QuestTrackerStrip
        player={player}
        trackedQuestId={state.trackedQuestId}
        onOpenQuestPanel={panels.openQuest}
      />
      <WelcomeOverlay player={player} /><ZoneBanner player={player} />
      <TargetingHint state={state} />
      <ReturnToNpcHint state={state} />
      <SkillUseHint state={state} />
      <LootPickupHint state={state} />
      <NpcInteraction
        player={player}
        onTalkNpc={onTalkNpc}
        onAcceptQuest={onAcceptQuest}
        onBuyFromVendor={onBuyFromVendor}
        onSellToVendor={onSellToVendor}
      />
      <CastingPanel player={player} />
      <SkillBar
        player={player}
        now={now}
        hasSelectedTarget={targetIsAlive}
        onCastSkill={onCastSkill}
        itemShortcuts={items.itemShortcuts}
        inventory={state.inventory}
        onUseItem={onUseItem}
        onBindItem={items.bindItem}
        onClearItem={items.clearItem}
      />
      <PanelToggleStrip panels={panels} />
      {state.combatLog.length > 0 && <CombatLogPanel lines={state.combatLog} />}
      {player && !player.isAlive && <DeathOverlay onRespawn={onRespawn} />}
    </>
  );
}

function NpcInteraction({
  player,
  onTalkNpc,
  onAcceptQuest,
  onBuyFromVendor,
  onSellToVendor,
}: {
  player: PlayerEntity | null;
  onTalkNpc: (npcId: string) => void;
  onAcceptQuest: (questId: string) => void;
  onBuyFromVendor: (vendorId: string, itemId: string, quantity: number) => void;
  onSellToVendor: (vendorId: string, itemId: string, quantity: number) => void;
}) {
  const [openVendorId, setOpenVendorId] = useState<string | null>(null);
  const openVendor = openVendorId ? VENDORS[openVendorId] ?? null : null;
  return (
    <>
      <NpcDialog
        player={player}
        onTalkNpc={onTalkNpc}
        onAcceptQuest={onAcceptQuest}
        onBrowseVendor={setOpenVendorId}
      />
      {openVendor && player && (
        <VendorPanel
          vendor={openVendor}
          player={player}
          onClose={() => setOpenVendorId(null)}
          onBuy={onBuyFromVendor}
          onSell={onSellToVendor}
        />
      )}
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
  // §52 polish — panel open/closed state persists across reloads via
  // `usePersistedToggle`. The default (3rd arg) only matches the
  // pre-PR behavior for first-ever joins; returning players see the
  // panel set they left open. Mirrors the existing
  // `useDismissibleHint` pattern + `vibeage.trackedQuest.v1` storage.
  const [statsOpen, , toggleStats] = usePersistedToggle('stats', true);
  const [questOpen, setQuestOpen, toggleQuest] = usePersistedToggle('quest', false);
  const [bagOpen, , toggleBag] = usePersistedToggle('bag', false);
  const [gearOpen, , toggleGear] = usePersistedToggle('gear', false);
  const [mapOpen, , toggleMap] = usePersistedToggle('map', false);
  const [treeOpen, , toggleTree] = usePersistedToggle('tree', false);
  // Actions defaults open: it's the home of the new Attack + Pickup
  // buttons so players see them immediately on join.
  const [actionsOpen, , toggleActions] = usePersistedToggle('actions', true);
  const [chatOpen, , toggleChat] = usePersistedToggle('chat', false);
  const [wikiOpen, setWikiOpen, toggleWiki] = usePersistedToggle('wiki', false);
  const [gmOpen, , toggleGm] = usePersistedToggle('gm', false);
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
    toggleStats,
    toggleQuest,
    openQuest: () => setQuestOpen(true),
    toggleBag,
    toggleGear,
    toggleMap,
    toggleTree,
    toggleActions,
    toggleChat,
    toggleWiki,
    openWiki: () => setWikiOpen(true),
    toggleGm,
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
    <section className="death-overlay" aria-label="Death" role="dialog" aria-modal="true">
      <div className="death-overlay__card">
        <span className="death-overlay__icon" aria-hidden="true">✦</span>
        <strong className="death-overlay__title">You have fallen</strong>
        <p className="death-overlay__subtitle">Return to the nearest waypoint to keep adventuring.</p>
        <button type="button" className="death-overlay__button" onClick={onRespawn} autoFocus>
          Respawn
        </button>
      </div>
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

function useSlotHotkeysFor(
  player: PlayerEntity | null,
  items: ReturnType<typeof useItemShortcutBindings>,
  cbs: {
    onCastSkill: (skillId: SkillId) => void;
    onCycleTarget?: () => void;
    onPickupNearest?: () => void;
    onMove?: () => void;
  },
) {
  const resolveSlot = useCallback(
    (i: number) => resolveSlotBinding(player, items.itemShortcuts, i),
    [player, items.itemShortcuts],
  );
  useSkillHotkeys({
    player, ...cbs, resolveSlot, tryUseItem: items.tryUseAt,
  });
}

type SkillHotkeyDeps = {
  player: PlayerEntity | null;
  onCastSkill: (skillId: SkillId) => void;
  onCycleTarget?: () => void;
  onPickupNearest?: () => void;
  onMove?: () => void;
  resolveSlot?: (slotIndex: number) => import('./skillShortcuts').SlotBinding;
  tryUseItem?: (slotIndex: number) => boolean;
};

function useSkillHotkeys({
  player, onCastSkill, onCycleTarget, onPickupNearest, onMove, resolveSlot, tryUseItem,
}: SkillHotkeyDeps) {
  const playerRef = useRef(player);
  playerRef.current = player;
  const cycleRef = useRef(onCycleTarget);
  cycleRef.current = onCycleTarget;
  const pickupRef = useRef(onPickupNearest);
  pickupRef.current = onPickupNearest;
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const resolveRef = useRef(resolveSlot);
  resolveRef.current = resolveSlot;
  const useItemRef = useRef(tryUseItem);
  useItemRef.current = tryUseItem;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;
      if (event.code === 'Tab') {
        if (cycleRef.current) { event.preventDefault(); cycleRef.current(); }
        return;
      }
      if (event.code === 'KeyF') {
        if (pickupRef.current) { event.preventDefault(); pickupRef.current(); }
        return;
      }
      if (event.code === 'KeyM') {
        if (moveRef.current) { event.preventDefault(); moveRef.current(); }
        return;
      }
      if (isBasicAttackKeyboardCode(event.code)) {
        event.preventDefault();
        onCastSkill(BASIC_ATTACK_SKILL_ID);
        return;
      }
      const slotIndex = getSkillSlotIndexForKeyboardCode(event.code);
      if (slotIndex !== null) {
        const binding = resolveRef.current?.(slotIndex) ?? null;
        if (binding?.kind === 'skill') {
          event.preventDefault();
          onCastSkill(binding.id);
          return;
        }
        if (binding?.kind === 'item' && useItemRef.current?.(slotIndex)) {
          event.preventDefault();
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
