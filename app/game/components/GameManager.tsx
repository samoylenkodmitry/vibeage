'use client';

import React from 'react';
import { Game3DContent } from './gamemanager';

interface Props {
  playerId: string;
  playerLevel: number;
  playerPosition: { x: number; y: number; z: number };
}

/**
 * GameManager Component - 3D Content Only
 * 
 * This component renders only the 3D content that needs to be inside the Canvas.
 * The UI components are now handled separately in Game.tsx to avoid R3F hook conflicts.
 */
export function GameManager({ playerId, playerLevel, playerPosition }: Props) {
  return (
    <Game3DContent
      playerId={playerId}
      playerLevel={playerLevel}
      playerPosition={playerPosition}
    />
  );
}

export default GameManager;
