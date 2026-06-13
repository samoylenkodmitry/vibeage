import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { SKILLS, type SkillId } from '../../../packages/content/skills';
import { GAME_ACTIONS } from '../../../packages/content/actions';
import type { EnemyEntity, GameClientState, PlayerEntity } from './gameTypes';
import { HudOverlays } from './hud/HudOverlays';
import { HudPanels } from './hud/HudPanels';
import { CurrentZoneChip } from './hud/CurrentZoneChip';
import { hasSpendableSkillPoints } from './hud/SkillTreePanel';
import { TimeOfDayChip } from './hud/TimeOfDayChip';
import { LootPickupHint } from './hud/LootPickupHint';
import { NpcDialog } from './hud/NpcDialog';
import { QuestTrackerStrip } from './hud/QuestTrackerStrip';
import { useDraggablePanel } from './hud/useDraggablePanel';
import { ReturnToNpcHint } from './hud/ReturnToNpcHint';
import { SkillUseHint } from './hud/SkillUseHint';
import { SpecializationHint } from './hud/SpecializationHint';
import { FrontierGuideHint } from './hud/FrontierGuideHint';
import { TargetingHint } from './hud/TargetingHint';
import { ZoneBanner } from './hud/ZoneBanner';
import { usePersistedToggle } from './hud/usePersistedToggle';
import { WelcomeOverlay } from './hud/WelcomeOverlay';
import { VendorPanel } from './hud/VendorPanel';
import { VENDORS } from '../../../packages/content/vendors';
import { SkillBar, type BuiltinBarAction } from './hud/SkillBar';
import { useActionBar, findBagSlotForItem, type ActionRef } from './hud/useActionBar';
import { ActionBarDragProvider } from './hud/actionBarDrag';
import { subscribeWikiOpen } from './hud/wikiNavBus';
import { TargetPanel, VitalsStrip, resolveSelectedTarget } from './hud/PlatePanels';
import { getDistance, getMeterProgress } from './hud/hudPrimitives';
import {
  BASIC_ATTACK_SKILL_ID,
  activeSkillsFor,
  getSkillSlotIndexForKeyboardCode,
  isBasicAttackKeyboardCode,
  isEditableTarget,
} from './skillShortcuts';

type GameHudProps = {
  state: GameClientState;
  cameraAngleRef?: MutableRefObject<number>;
  navigationMarker?: { x: number; z: number } | null;
  onSetNavigationMarker?: (marker: { x: number; z: number } | null) => void;
  /** GM map travel — teleport to the dropped pin (server gates by GM). */
  onGmTeleport?: (target: { x: number; z: number }) => void;
  onDisconnect: () => void;
  onCastSkill: (skillId: SkillId) => void;
  onLearnSkill: (skillId: SkillId) => void;
  onSelectSpecialization: (specializationId: string) => void;
  onUseItem: (slotIndex: number) => void;
  /** §46/slice-new — drop an inventory stack to ground loot. */
  onDropItem: (slotIndex: number, count?: number) => void;
  /** Bag context menu — destroy a stack (no ground loot). */
  onDestroyItem: (slotIndex: number, count?: number) => void;
  onMoveItem: (fromSlotIndex: number, toSlotIndex: number) => void;
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

/** Metadata + handlers for the built-in UI actions (Move/Pickup) that can be
 *  bound to action-bar slots. Skills/items resolve themselves; these don't. */
function buildBuiltinBarActions(
  alive: boolean,
  hasSelectedTarget: boolean,
  hasNavMarker: boolean,
  lootCount: number,
  onMove?: () => void,
  onPickupNearest?: () => void,
): Record<string, BuiltinBarAction> {
  const noop = () => undefined;
  return {
    move: {
      label: GAME_ACTIONS.move.label, hotkey: GAME_ACTIONS.move.hotkey, icon: GAME_ACTIONS.move.icon,
      disabled: !alive || (!hasSelectedTarget && !hasNavMarker),
      onInvoke: onMove ?? noop,
    },
    pickup: {
      label: GAME_ACTIONS.pickup.label, hotkey: GAME_ACTIONS.pickup.hotkey, icon: GAME_ACTIONS.pickup.icon,
      disabled: !alive || lootCount === 0,
      onInvoke: onPickupNearest ?? noop,
    },
  };
}

export function GameHud(props: GameHudProps) {
  const {
    state, cameraAngleRef, navigationMarker, onSetNavigationMarker, onGmTeleport, onDisconnect,
    onCastSkill, onLearnSkill, onSelectSpecialization, onUseItem, onDropItem, onDestroyItem, onMoveItem, onCraftItem, onEquipItem, onUnequipItem,
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
  const panels = usePanelState();
  const activeSkills = useMemo(() => activeSkillsFor(player), [player?.unlockedSkills]);
  const { actionBar, setSlot, swapSlots, clearSlot, locked, toggleLocked } = useActionBar(activeSkills);
  const bindItemToSlot = useCallback(
    (slotIndex: number, itemId: string) => setSlot(slotIndex, { kind: 'item', id: itemId }), [setSlot]);
  useSlotHotkeysFor(player, actionBar, state.inventory, onUseItem, { onCastSkill, onCycleTarget, onPickupNearest, onMove });

  // Wiki nav bus: chips outside the Wiki (stat tooltips, SkillBar) call
  // openWikiAt — force the panel open so the navigation lands visibly.
  useEffect(() => {
    return subscribeWikiOpen(() => panels.openWiki());
  }, [panels]);

  return (
    <ActionBarDragProvider locked={locked} setSlot={setSlot} swapSlots={swapSlots} clearSlot={clearSlot}>
      <HudOverlays state={state} player={player} />
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
        hasSelectedTarget={targetIsAlive}
        hasLootNearby={Object.keys(state.groundLoot).length > 0}
        cameraAngleRef={cameraAngleRef}
        navigationMarker={navigationMarker}
        onSetNavigationMarker={onSetNavigationMarker}
        onGmTeleport={onGmTeleport}
        onCastSkill={onCastSkill}
        onLearnSkill={onLearnSkill}
        onSelectSpecialization={onSelectSpecialization}
        onUseItem={onUseItem} onDropItem={onDropItem} onDestroyItem={onDestroyItem} onMoveItem={onMoveItem} onCraftItem={onCraftItem}
        onEquipItem={onEquipItem}
        onUnequipItem={onUnequipItem}
        onUpgradeSkill={onUpgradeSkill}
        onCancelQuest={onCancelQuest}
        onAdvanceQuest={onAdvanceQuest}
        onClaimQuestReward={onClaimQuestReward}
        onSetTrackedQuest={onSetTrackedQuest} selectedPlayerTargetId={selectedOtherPlayer?.id ?? null}
        onGmCommand={onGmCommand} onPickupNearest={onPickupNearest} onMove={onMove} onSendChat={onSendChat}
        onBindItem={bindItemToSlot}
      />
      <QuestTrackerStrip
        player={player} trackedQuestId={state.trackedQuestId}
        onOpenQuestPanel={panels.openQuest} cameraAngleRef={cameraAngleRef}
      />
      <WelcomeOverlay player={player} /><ZoneBanner player={player} />
      <TargetingHint state={state} />
      <ReturnToNpcHint state={state} />
      <SkillUseHint state={state} /><SpecializationHint player={player} onOpenSkills={panels.openTree} /><FrontierGuideHint player={player} onOpenQuestPanel={panels.openQuest} />
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
        hasSelectedTarget={targetIsAlive}
        onCastSkill={onCastSkill}
        inventory={state.inventory}
        onUseItem={onUseItem}
        actionBar={actionBar}
        onSetSlot={setSlot} onSwapSlot={swapSlots} onClearSlot={clearSlot}
        builtinActions={buildBuiltinBarActions(Boolean(player?.isAlive), targetIsAlive, Boolean(navigationMarker), Object.keys(state.groundLoot).length, onMove, onPickupNearest)}
        locked={locked} onToggleLock={toggleLocked}
      />
      <PanelToggleStrip panels={panels} unspentSkillPoints={hasSpendableSkillPoints(player) ? (player?.availableSkillPoints ?? 0) : 0} isGm={Boolean(player?.isGm)} />
      {player && !player.isAlive && <DeathOverlay onRespawn={onRespawn} />}
    </ActionBarDragProvider>
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
        playerCount={playerCount} enemyCount={enemyCount} regionStatus={regionStatus}
        lootCount={Object.keys(state.groundLoot).length} player={player}
      />
      <VitalsStrip
        player={player}
        selected={selfSelected}
        onSelectSelf={player ? () => onSelectTarget?.(player.id) : undefined}
        activePhysicsFields={state.activePhysicsFields}
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
  const ref = useDraggablePanel<HTMLElement>('hud-connection', { handleSelector: '.drag-grip' });
  return (
    <section ref={ref} className="hud hud-top" aria-label="Connection">
      <span className="drag-grip" aria-hidden="true" title="Drag to move">⠿</span>
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
  playerCount, enemyCount, regionStatus, lootCount, player,
}: {
  playerCount: number;
  enemyCount: number;
  regionStatus: string;
  lootCount: number;
  player: PlayerEntity | null;
}) {
  const ref = useDraggablePanel<HTMLElement>('hud-stats', { handleSelector: '.drag-grip' });
  return (
    <section ref={ref} className="hud hud-stats" aria-label="World status">
      <span className="drag-grip" aria-hidden="true" title="Drag to move">⠿</span>
      <Metric label="Players" value={String(playerCount)} />
      <Metric label="Enemies" value={String(enemyCount)} />
      <Metric label="Regions" value={regionStatus} />
      <Metric label="Loot" value={String(lootCount)} />
      <TimeOfDayChip />
      <CurrentZoneChip player={player} />
    </section>
  );
}


function PanelToggleStrip({
  panels,
  unspentSkillPoints,
  isGm,
}: {
  panels: PanelState;
  unspentSkillPoints: number;
  isGm: boolean;
}) {
  const spBadge = unspentSkillPoints > 0 ? unspentSkillPoints : null;
  // Collapsible rail: one ☰ button shows/hides the stack of panel toggles.
  // Collapsed by default on phones — the always-on 9-button column otherwise eats
  // screen space and overlaps the action bar's right edge. Persisted per browser.
  // Lazy useState so the matchMedia probe runs once, not every render.
  const [railDefaultOpen] = useState(defaultRailOpen);
  const [railOpen, , toggleRail] = usePersistedToggle('rail-open', railDefaultOpen);
  return (
    <aside className={`panel-toggles${railOpen ? ' panel-toggles--open' : ''}`} aria-label="Panel toggles">
      <button
        type="button"
        className={`panel-toggle panel-rail-toggle${spBadge && !railOpen ? ' panel-toggle--badged' : ''}`}
        aria-expanded={railOpen}
        aria-label={railOpen ? 'Collapse menu' : 'Open menu'}
        onClick={toggleRail}
      >
        {railOpen ? '✕' : '☰'}
        {spBadge && !railOpen && (
          <span className="panel-toggle__badge" aria-label={`${spBadge} unspent`}>{spBadge}</span>
        )}
      </button>
      {railOpen && (
        <>
          <PanelToggleButton open={panels.statsOpen} label="Stats" onClick={panels.toggleStats} />
          <PanelToggleButton open={panels.treeOpen} label="Skills" onClick={panels.toggleTree} badge={spBadge} />
          <PanelToggleButton open={panels.actionsOpen} label="Actions" onClick={panels.toggleActions} />
          <PanelToggleButton open={panels.questOpen} label="Quest" onClick={panels.toggleQuest} />
          <PanelToggleButton open={panels.bagOpen} label="Bag" onClick={panels.toggleBag} />
          <PanelToggleButton open={panels.gearOpen} label="Gear" onClick={panels.toggleGear} />
          <PanelToggleButton open={panels.mapOpen} label="Map" onClick={panels.toggleMap} />
          <PanelToggleButton open={panels.wikiOpen} label="Wiki" onClick={panels.toggleWiki} />
          <PanelToggleButton open={panels.videoOpen} label="Video" onClick={panels.toggleVideo} />
          {isGm && <PanelToggleButton open={panels.gmOpen} label="GM" onClick={panels.toggleGm} />}
        </>
      )}
    </aside>
  );
}

/** Rail starts collapsed on phones (cramped) and expanded on desktop. */
function defaultRailOpen(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  try { return !window.matchMedia('(max-width: 680px)').matches; } catch { return true; }
}

type PanelState = ReturnType<typeof usePanelState>;

function usePanelState() {
  // §52 polish — panel open/closed state persists across reloads via
  // `usePersistedToggle` (the 3rd-arg default only applies to first-ever joins;
  // returning players see the set they left open). Stats + Actions default OPEN
  // on desktop but CLOSED on phones, where two always-open top panels otherwise
  // bury the game view; `defaultRailOpen` (matchMedia) is computed once.
  const [desktopDefault] = useState(defaultRailOpen);
  const [statsOpen, , toggleStats] = usePersistedToggle('stats', desktopDefault);
  const [questOpen, setQuestOpen, toggleQuest] = usePersistedToggle('quest', false);
  const [bagOpen, , toggleBag] = usePersistedToggle('bag', false);
  const [gearOpen, , toggleGear] = usePersistedToggle('gear', false);
  const [mapOpen, , toggleMap] = usePersistedToggle('map', false);
  const [treeOpen, setTreeOpen, toggleTree] = usePersistedToggle('tree', false);
  // Actions is the home of the Attack/Move/Pickup/Escape buttons — open on
  // desktop so players see them, closed on phones (tap-to-move / tap-to-attack
  // works, and it's a tap on the ☰ rail away).
  const [actionsOpen, , toggleActions] = usePersistedToggle('actions', desktopDefault);
  const [wikiOpen, setWikiOpen, toggleWiki] = usePersistedToggle('wiki', false);
  const [videoOpen, , toggleVideo] = usePersistedToggle('video', false);
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
    wikiOpen,
    videoOpen,
    gmOpen,
    craftRecipeSlot,
    toggleStats,
    toggleQuest,
    openQuest: () => setQuestOpen(true),
    toggleBag,
    toggleGear,
    toggleMap,
    toggleTree,
    openTree: () => setTreeOpen(true),
    toggleActions,
    toggleWiki,
    openWiki: () => setWikiOpen(true),
    toggleVideo,
    toggleGm,
    openCraft: (slotIndex: number) => setCraftRecipeSlot(slotIndex),
    closeCraft: () => setCraftRecipeSlot(null),
  };
}

function PanelToggleButton({
  open,
  label,
  onClick,
  badge,
}: {
  open: boolean;
  label: string;
  onClick: () => void;
  /** Optional small chip next to the label — e.g. unspent skill point count. */
  badge?: number | null;
}) {
  const hasBadge = badge !== undefined && badge !== null && badge > 0;
  return (
    <button
      type="button"
      className={`panel-toggle${open ? ' panel-toggle--open' : ''}${hasBadge ? ' panel-toggle--badged' : ''}`}
      aria-label={open ? `Hide ${label}` : `Show ${label}`}
      onClick={onClick}
    >
      {label}
      {hasBadge && (
        <span className="panel-toggle__badge" aria-label={`${badge} unspent`}>{badge}</span>
      )}
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || isEditableTarget(e.target)) return;
      if (e.code === 'KeyR') {
        e.preventDefault();
        onRespawn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onRespawn]);
  return (
    <section className="death-overlay" aria-label="Death" role="dialog" aria-modal="true">
      <div className="death-overlay__card">
        <span className="death-overlay__icon" aria-hidden="true">✦</span>
        <strong className="death-overlay__title">You have fallen</strong>
        <p className="death-overlay__subtitle">Return to the nearest waypoint to keep adventuring.</p>
        <button type="button" className="death-overlay__button" onClick={onRespawn} autoFocus>
          Respawn
        </button>
        <span className="death-overlay__hotkey" aria-hidden="true">
          or press <kbd>R</kbd>
        </span>
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
  actionBar: (ActionRef | null)[],
  inventory: readonly { itemId: string; quantity: number; slotIndex?: number }[],
  onUseItem: (slotIndex: number) => void,
  cbs: {
    onCastSkill: (skillId: SkillId) => void;
    onCycleTarget?: () => void;
    onPickupNearest?: () => void;
    onMove?: () => void;
  },
) {
  const resolveSlot = useCallback((i: number) => actionBar[i] ?? null, [actionBar]);
  const tryUseItem = useCallback((i: number): boolean => {
    const ref = actionBar[i];
    if (ref?.kind !== 'item') return false;
    const bagSlot = findBagSlotForItem(inventory, ref.id);
    if (bagSlot === null) return false;
    onUseItem(bagSlot);
    return true;
  }, [actionBar, inventory, onUseItem]);
  useSkillHotkeys({ player, ...cbs, resolveSlot, tryUseItem });
}

type SkillHotkeyDeps = {
  player: PlayerEntity | null;
  onCastSkill: (skillId: SkillId) => void;
  onCycleTarget?: () => void;
  onPickupNearest?: () => void;
  onMove?: () => void;
  resolveSlot?: (slotIndex: number) => ActionRef | null;
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
          if (playerRef.current?.unlockedSkills?.includes(binding.id)) {
            event.preventDefault();
            onCastSkill(binding.id);
          }
          return;
        }
        if (binding?.kind === 'action') {
          // A slot is just a shortcut: pressing it invokes whatever it holds.
          if (binding.id === 'move') { event.preventDefault(); moveRef.current?.(); }
          else if (binding.id === 'pickup') { event.preventDefault(); pickupRef.current?.(); }
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
