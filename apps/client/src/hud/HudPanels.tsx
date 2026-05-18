import type { MutableRefObject } from 'react';
import type { SkillId } from '../../../../packages/content/skills';
import type { GameClientState, PlayerEntity } from '../gameTypes';
import { ActionsPanel } from './ActionsPanel';
import { ChatPanel } from './ChatPanel';
import { CharacterPanel } from './CharacterPanel';
import { InventoryPanel } from './InventoryPanel';
import { PaperdollPanel } from './PaperdollPanel';
import { WikiPanel } from './WikiPanel';
import { MapPanel } from './MapPanel';
import { SkillTreePanel } from './SkillTreePanel';
import { StarterProgressPanel } from './StarterProgressPanel';
import { QuestPanel } from './QuestPanel';
import { PlayerPanel } from './PlayerPanel';
import { GmPanel } from './GmPanel';

export type HudPanelToggleState = {
  statsOpen: boolean;
  characterOpen: boolean;
  questOpen: boolean;
  bagOpen: boolean;
  gearOpen: boolean;
  mapOpen: boolean;
  treeOpen: boolean;
  actionsOpen: boolean;
  chatOpen: boolean;
  wikiOpen: boolean;
  gmOpen: boolean;
};

export type HudPanelsProps = {
  panels: HudPanelToggleState;
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
  onPickupNearest?: () => void;
  onSendChat?: (text: string, scope: 'near' | 'all') => void;
};

export function HudPanels({
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
  onCancelQuest,
  onAdvanceQuest,
  onClaimQuestReward,
  onGmCommand,
  onPickupNearest,
  onSendChat,
}: HudPanelsProps) {
  return (
    <>
      {panels.statsOpen && <PlayerPanel player={player} />}
      {panels.questOpen && (
        <>
          <QuestPanel
            player={player}
            onCancelQuest={onCancelQuest}
            onAdvanceQuest={onAdvanceQuest}
            onClaimQuestReward={onClaimQuestReward}
            onShowMarker={(pos) => onSetNavigationMarker?.(pos)}
          />
          <StarterProgressPanel player={player} progress={state.starterProgress} onLearnSkill={onLearnSkill} />
        </>
      )}
      {panels.bagOpen && (
        <InventoryPanel
          inventory={state.inventory}
          maxSlots={state.maxInventorySlots}
          playerLevel={player?.level ?? 1}
          onUseItem={onUseItem}
          onEquipItem={onEquipItem}
        />
      )}
      {panels.gearOpen && (
        <PaperdollPanel equipment={state.equipment} onUnequip={onUnequipItem} />
      )}
      {panels.characterOpen && (
        <CharacterPanel
          player={player} onSelectClass={onSelectClass}
          onSelectRace={onSelectRace} onSelectSpecialization={onSelectSpecialization}
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
      {panels.gmOpen && (
        <GmPanel player={player} selectedTargetId={state.selectedTargetId} onGmCommand={onGmCommand} />
      )}
    </>
  );
}
