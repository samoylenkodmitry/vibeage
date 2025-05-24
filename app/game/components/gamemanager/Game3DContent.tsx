import React from 'react';
import WeatherSystem from '../WeatherSystem';
import NPCComponent from '../NPCComponent';
import { useGameManager } from './useGameManager';

interface Game3DContentProps {
  playerId: string;
  playerLevel: number;
  playerPosition: { x: number; y: number; z: number };
}

export function Game3DContent({ 
  playerId,
  playerLevel,
  playerPosition
}: Game3DContentProps) {
  const { gameState, eventHandlers } = useGameManager(playerId, playerLevel, playerPosition);

  return (
    <>
      {/* Weather Visual Effects - 3D component inside Canvas */}
      {gameState.currentWeather && (
        <WeatherSystem weather={gameState.currentWeather} playerPosition={playerPosition} />
      )}

      {/* NPCs - 3D components inside Canvas */}
      {gameState.nearbyNPCs.map(npc => (
        <NPCComponent
          key={npc.id}
          npc={npc}
          playerPosition={playerPosition}
          onInteract={eventHandlers.handleNPCInteract}
        />
      ))}
    </>
  );
}
