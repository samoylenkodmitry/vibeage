export interface GameUIState {
  showQuestUI: boolean;
  showDungeonUI: boolean;
  showWeatherUI: boolean;
}

export interface GameStateData {
  currentWeather: any;
  activeEvents: any[];
  nearbyNPCs: any[];
}

export interface EventHandlers {
  handleNPCInteract: (npcId: string) => void;
  handleEnterDungeon: (instanceId: string) => void;
  handleQuestProgress: (questId: string, objectiveType: string, targetId: string, amount?: number) => void;
}

export interface GameManagerHook {
  uiState: GameUIState;
  gameState: GameStateData;
  eventHandlers: EventHandlers;
  uiActions: {
    setShowQuestUI: (value: boolean | ((prev: boolean) => boolean)) => void;
    setShowDungeonUI: (value: boolean | ((prev: boolean) => boolean)) => void;
    setShowWeatherUI: (value: boolean | ((prev: boolean) => boolean)) => void;
  };
}
