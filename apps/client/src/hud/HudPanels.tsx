import type { MutableRefObject } from 'react';
import type { SkillId } from '../../../../packages/content/skills';
import type { GameClientState, PlayerEntity } from '../gameTypes';
import { ActionsPanel } from './ActionsPanel';
import { ChatPanel } from './ChatPanel';
import { CraftPanel } from './CraftPanel';
import { InventoryPanel } from './InventoryPanel';
import { PaperdollPanel } from './PaperdollPanel';
import { WikiPanel } from './WikiPanel';
import { MapPanel } from './MapPanel';
import { SkillTreePanel } from './SkillTreePanel';
import { QuestPanel } from './QuestPanel';
import { PlayerPanel } from './PlayerPanel';
import { GmPanel } from './GmPanel';

type HudPanelToggleState = {
  statsOpen: boolean;
  questOpen: boolean;
  bagOpen: boolean;
  gearOpen: boolean;
  mapOpen: boolean;
  treeOpen: boolean;
  actionsOpen: boolean;
  wikiOpen: boolean;
  gmOpen: boolean;
  /** PR AA — slot index of the recipe whose CraftPanel is open; null when none. */
  craftRecipeSlot: number | null;
  openCraft: (slotIndex: number) => void;
  closeCraft: () => void;
};

export type HudPanelsProps = {
  panels: HudPanelToggleState;
  state: GameClientState;
  player: PlayerEntity | null;
  hasSelectedTarget: boolean;
  hasLootNearby: boolean;
  cameraAngleRef?: MutableRefObject<number>;
  navigationMarker?: { x: number; z: number } | null;
  onSetNavigationMarker?: (marker: { x: number; z: number } | null) => void;
  /** GM map travel — teleport to the dropped pin (server gates by GM). */
  onGmTeleport?: (target: { x: number; z: number }) => void;
  onCastSkill: (skillId: SkillId) => void;
  onLearnSkill: (skillId: SkillId) => void;
  onSelectSpecialization: (specializationId: string) => void;
  onUseItem: (slotIndex: number) => void;
  /** §46/slice-new — drop a bag slot to ground loot. */
  onDropItem: (slotIndex: number, count?: number) => void;
  /** Bag context menu — destroy a stack (no ground loot). */
  onDestroyItem: (slotIndex: number, count?: number) => void;
  /** Drag a bag slot onto another to rearrange (move/swap). */
  onMoveItem: (fromSlotIndex: number, toSlotIndex: number) => void;
  onCraftItem: (recipeSlotIndex: number) => void;
  onEquipItem: (slotIndex: number, requestedSlot?: string) => void;
  onUnequipItem: (slot: string) => void;
  onUpgradeSkill: (skillId: SkillId) => void;
  onCancelQuest: (questId: string) => void;
  onAdvanceQuest: (questId: string) => void;
  onClaimQuestReward: (questId: string) => void;
  onSetTrackedQuest?: (questId: string | null) => void;
  selectedPlayerTargetId: string | null;
  onGmCommand: (cmd: {
    verb:
      | 'grantXp' | 'grantGold' | 'grantSp' | 'grantItem' | 'grantSkill'
      | 'setLevel' | 'setRace' | 'setClass' | 'setSpecialization';
    value: number | string;
    targetId?: string;
    quantity?: number;
  }) => void;
  onPickupNearest?: () => void;
  onMove?: () => void;
  onSendChat?: (text: string, scope: 'near' | 'all') => void;
  /** §52 — touch users can't drag a bag slot to bind it on the
   *  shortcut bar (HTML5 DnD preempts touch events). Tooltip path
   *  routes the binding through this callback instead. */
  onBindItem: (slotIndex: number, itemId: string) => void;
};

export function HudPanels({
  panels, state, player, hasSelectedTarget, hasLootNearby,
  cameraAngleRef, navigationMarker, onSetNavigationMarker, onGmTeleport,
  onCastSkill, onLearnSkill, onSelectSpecialization, onUseItem, onDropItem, onDestroyItem, onMoveItem,
  onCraftItem, onEquipItem, onUnequipItem, onUpgradeSkill,
  onCancelQuest, onAdvanceQuest, onClaimQuestReward, onSetTrackedQuest, selectedPlayerTargetId, onGmCommand,
  onPickupNearest, onMove, onSendChat, onBindItem,
}: HudPanelsProps) {
  return (
    <>
      {panels.statsOpen && <PlayerPanel player={player} equipment={state.equipment} />}
      {panels.questOpen && (
        <QuestPanel
          player={player}
          trackedQuestId={state.trackedQuestId}
          onCancelQuest={onCancelQuest}
          onAdvanceQuest={onAdvanceQuest}
          onClaimQuestReward={onClaimQuestReward}
          onShowMarker={(pos) => onSetNavigationMarker?.(pos)}
          onSetTrackedQuest={onSetTrackedQuest}
        />
      )}
      {panels.bagOpen && (
        <InventoryPanel
          inventory={state.inventory}
          maxSlots={state.maxInventorySlots}
          playerLevel={player?.level ?? 1}
          equipment={state.equipment}
          onUseItem={onUseItem}
          onEquipItem={onEquipItem}
          onOpenRecipe={panels.openCraft}
          onDropItem={onDropItem}
          onDestroyItem={onDestroyItem}
          onMoveItem={onMoveItem}
          onBindItem={onBindItem}
        />
      )}
      {panels.craftRecipeSlot !== null && (
        <CraftPanel
          recipeSlotIndex={panels.craftRecipeSlot}
          inventory={state.inventory}
          onCraft={onCraftItem}
          onClose={panels.closeCraft}
        />
      )}
      {panels.gearOpen && (
        <PaperdollPanel equipment={state.equipment} onUnequip={onUnequipItem} />
      )}
      {panels.mapOpen && (
        <MapPanel
          player={player}
          cameraAngleRef={cameraAngleRef}
          navigationMarker={navigationMarker ?? null}
          onSetNavigationMarker={onSetNavigationMarker}
          onGmTeleport={onGmTeleport}
          enemies={state.enemies}
        />
      )}
      {panels.treeOpen && (
        <SkillTreePanel
          player={player}
          onLearnSkill={onLearnSkill}
          onUpgradeSkill={onUpgradeSkill}
          onSelectSpecialization={onSelectSpecialization}
          rejections={state.learnSkillRejections}
        />
      )}
      {panels.actionsOpen && (
        <ActionsPanel
          player={player}
          hasSelectedTarget={hasSelectedTarget}
          hasLootNearby={hasLootNearby}
          hasNavigationMarker={Boolean(navigationMarker)}
          onCastSkill={onCastSkill}
          onPickupNearest={onPickupNearest ?? (() => undefined)}
          onMove={onMove ?? (() => undefined)}
        />
      )}
      {onSendChat && (
        <ChatPanel
          lines={state.chatLines}
          systemLines={state.combatLog}
          myPlayerId={state.myPlayerId}
          onSendChat={onSendChat}
          lastError={state.lastChatError}
        />
      )}
      {panels.wikiOpen && <WikiPanel onShowMarker={(pos) => onSetNavigationMarker?.(pos)} />}
      {panels.gmOpen && player?.isGm && (
        <GmPanel player={player} selectedPlayerId={selectedPlayerTargetId} onGmCommand={onGmCommand} />
      )}
    </>
  );
}
