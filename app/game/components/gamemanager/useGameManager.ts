import { useState, useEffect } from 'react';
import { SystemsManager } from './SystemsManager';
import { useEventHandlers } from './EventHandlers';
import { useKeyboardShortcuts } from './KeyboardShortcuts';
import { GameManagerHook, GameUIState, GameStateData } from './types';

export const useGameManager = (
  playerId: string,
  playerLevel: number,
  playerPosition: { x: number; y: number; z: number }
): GameManagerHook => {
  // System instances
  const [systemsManager] = useState(() => new SystemsManager());

  // UI state
  const [showQuestUI, setShowQuestUI] = useState(false);
  const [showDungeonUI, setShowDungeonUI] = useState(false);
  const [showWeatherUI, setShowWeatherUI] = useState(true);

  // Game state
  const [currentWeather, setCurrentWeather] = useState(systemsManager.getCurrentWeather());
  const [activeEvents, setActiveEvents] = useState(systemsManager.getActiveEvents());
  const [nearbyNPCs, setNearbyNPCs] = useState(systemsManager.getNearbyNPCs(playerPosition, 50));

  // Update systems periodically with optimized intervals
  useEffect(() => {
    // Weather and events update less frequently (every 5 seconds)
    const weatherInterval = setInterval(() => {
      systemsManager.updateWeather();
      const newWeather = systemsManager.getCurrentWeather();
      const newEvents = systemsManager.getActiveEvents();
      
      // Only update state if values actually changed
      setCurrentWeather(prev => 
        JSON.stringify(prev) !== JSON.stringify(newWeather) ? newWeather : prev
      );
      setActiveEvents(prev => 
        JSON.stringify(prev) !== JSON.stringify(newEvents) ? newEvents : prev
      );
    }, 5000);

    // NPCs update more frequently but with distance check (every 2 seconds)
    const npcInterval = setInterval(() => {
      const newNPCs = systemsManager.getNearbyNPCs(playerPosition, 50);
      setNearbyNPCs(prev => 
        JSON.stringify(prev) !== JSON.stringify(newNPCs) ? newNPCs : prev
      );
    }, 2000);

    // Cleanup runs less frequently (every 30 seconds)
    const cleanupInterval = setInterval(() => {
      systemsManager.cleanupExpiredDungeonInstances();
    }, 30000);

    return () => {
      clearInterval(weatherInterval);
      clearInterval(npcInterval);
      clearInterval(cleanupInterval);
    };
  }, [systemsManager]); // Remove playerPosition dependency to reduce effect re-runs

  // Separate effect for position-dependent updates with throttling
  useEffect(() => {
    const updateNPCs = () => {
      const newNPCs = systemsManager.getNearbyNPCs(playerPosition, 50);
      setNearbyNPCs(prev => 
        JSON.stringify(prev) !== JSON.stringify(newNPCs) ? newNPCs : prev
      );
    };

    // Throttle position updates to every 500ms
    const timeoutId = setTimeout(updateNPCs, 500);

    return () => clearTimeout(timeoutId);
  }, [playerPosition, systemsManager]);

  // Get event handlers
  const eventHandlers = useEventHandlers(
    systemsManager,
    playerId,
    setShowQuestUI,
    setShowDungeonUI
  );

  // Setup keyboard shortcuts
  useKeyboardShortcuts(setShowQuestUI, setShowDungeonUI, setShowWeatherUI);

  // Expose quest progression to parent components
  useEffect(() => {
    // Make quest progression available globally
    (window as any).progressQuest = eventHandlers.handleQuestProgress;
    
    return () => {
      delete (window as any).progressQuest;
    };
  }, [eventHandlers.handleQuestProgress]);

  const uiState: GameUIState = {
    showQuestUI,
    showDungeonUI,
    showWeatherUI
  };

  const gameState: GameStateData = {
    currentWeather,
    activeEvents,
    nearbyNPCs
  };

  return {
    uiState,
    gameState,
    eventHandlers,
    uiActions: {
      setShowQuestUI,
      setShowDungeonUI,
      setShowWeatherUI
    }
  };
};
