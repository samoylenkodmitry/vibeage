import React from 'react';
import QuestUI from '../QuestUI';
import WeatherUI from '../WeatherUI';
import DungeonUI from '../DungeonUI';
import { SystemsManager } from './SystemsManager';
import { GameUIState } from './types';

interface GameUIContentProps {
  systemsManager: SystemsManager;
  playerId: string;
  playerLevel: number;
  uiState: GameUIState;
  onSetShowQuestUI: (value: boolean) => void;
  onSetShowDungeonUI: (value: boolean) => void;
  onSetShowWeatherUI: (value: boolean | ((prev: boolean) => boolean)) => void;
  onEnterDungeon: (instanceId: string) => void;
  currentWeather: any;
  activeEvents: any[];
}

export function GameUIContent({
  systemsManager,
  playerId,
  playerLevel,
  uiState,
  onSetShowQuestUI,
  onSetShowDungeonUI,
  onSetShowWeatherUI,
  onEnterDungeon,
  currentWeather,
  activeEvents
}: GameUIContentProps) {
  return (
    <>
      {/* Quest UI */}
      {uiState.showQuestUI && (
        <QuestUI
          questSystem={systemsManager.getQuestSystem()}
          playerId={playerId}
          isVisible={uiState.showQuestUI}
          onClose={() => onSetShowQuestUI(false)}
        />
      )}

      {/* Weather UI */}
      {uiState.showWeatherUI && (
        <WeatherUI
          currentWeather={currentWeather}
          activeEvents={activeEvents}
          isVisible={uiState.showWeatherUI}
        />
      )}

      {/* Dungeon UI */}
      {uiState.showDungeonUI && (
        <DungeonUI
          dungeonSystem={systemsManager.getDungeonSystem()}
          playerId={playerId}
          playerLevel={playerLevel}
          isVisible={uiState.showDungeonUI}
          onClose={() => onSetShowDungeonUI(false)}
          onEnterDungeon={onEnterDungeon}
        />
      )}

      {/* Game UI Controls */}
      <div className="game-controls">
        <button 
          className="control-button quest-button"
          onClick={() => onSetShowQuestUI(true)}
          title="Open Quest Log (Q)"
        >
          📋
        </button>
        <button 
          className="control-button dungeon-button"
          onClick={() => onSetShowDungeonUI(true)}
          title="Open Dungeons (D)"
        >
          🏰
        </button>
        <button 
          className="control-button weather-button"
          onClick={() => onSetShowWeatherUI(!uiState.showWeatherUI)}
          title="Toggle Weather Display (W)"
        >
          {uiState.showWeatherUI ? '🌤️' : '🌧️'}
        </button>
      </div>

      {/* Game Notifications */}
      <div className="game-notifications">
        {/* Quest completion notifications would go here */}
        {/* Event notifications would go here */}
      </div>

      <style jsx>{`
        .game-controls {
          position: fixed;
          bottom: 20px;
          left: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          z-index: 100;
        }

        .control-button {
          width: 48px;
          height: 48px;
          border: none;
          border-radius: 12px;
          font-size: 20px;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(8px);
          border: 2px solid rgba(255, 255, 255, 0.1);
        }

        .quest-button {
          background: rgba(59, 130, 246, 0.8);
        }

        .quest-button:hover {
          background: rgba(59, 130, 246, 1);
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
        }

        .dungeon-button {
          background: rgba(139, 92, 246, 0.8);
        }

        .dungeon-button:hover {
          background: rgba(139, 92, 246, 1);
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(139, 92, 246, 0.4);
        }

        .weather-button {
          background: rgba(34, 197, 94, 0.8);
        }

        .weather-button:hover {
          background: rgba(34, 197, 94, 1);
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(34, 197, 94, 0.4);
        }

        .game-notifications {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translateX(-50%);
          z-index: 200;
          pointer-events: none;
        }

        @media (max-width: 768px) {
          .game-controls {
            bottom: 10px;
            left: 10px;
            flex-direction: row;
            gap: 8px;
          }

          .control-button {
            width: 40px;
            height: 40px;
            font-size: 16px;
          }
        }
      `}</style>
    </>
  );
}
