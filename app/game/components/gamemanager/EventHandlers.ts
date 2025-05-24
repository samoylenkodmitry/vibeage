import { useCallback } from 'react';
import { SystemsManager } from './SystemsManager';

export const useEventHandlers = (
  systemsManager: SystemsManager,
  playerId: string,
  setShowQuestUI: (value: boolean | ((prev: boolean) => boolean)) => void,
  setShowDungeonUI: (value: boolean | ((prev: boolean) => boolean)) => void
) => {
  // Handle quest interactions
  const handleNPCInteract = useCallback((npcId: string) => {
    const npc = systemsManager.getNPC(npcId);
    if (!npc) return;

    if (npc.type === 'quest_giver') {
      // Show available quests from this NPC
      setShowQuestUI(true);
    } else if (npc.type === 'merchant') {
      // TODO: Open merchant shop UI
      console.log('Opening merchant shop for:', npc.name);
    } else if (npc.type === 'trainer') {
      // TODO: Open training UI
      console.log('Opening trainer interface for:', npc.name);
    }
  }, [systemsManager, setShowQuestUI]);

  // Handle dungeon entry
  const handleEnterDungeon = useCallback((instanceId: string) => {
    const instance = systemsManager.getDungeonInstance(instanceId);
    if (instance) {
      console.log('Entering dungeon instance:', instanceId);
      setShowDungeonUI(false);
      // TODO: Transition to dungeon scene
    }
  }, [systemsManager, setShowDungeonUI]);

  // Handle quest progression
  const handleQuestProgress = useCallback((
    questId: string, 
    objectiveType: string, 
    targetId: string, 
    amount: number = 1
  ) => {
    systemsManager.progressQuest(playerId, questId, objectiveType, targetId, amount);
  }, [systemsManager, playerId]);

  return {
    handleNPCInteract,
    handleEnterDungeon,
    handleQuestProgress
  };
};
