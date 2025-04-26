'use client';

import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Sky, KeyboardControls } from '@react-three/drei';
import { useEffect, useState, useCallback, useRef } from 'react';
import World from './World';
import Player from './Player';
import Enemies from './Enemies';
import UI from './UI';
import ActiveSkills from './ActiveSkills';
import { useGameStore } from '../systems/gameStore';
import SocketManager from '../systems/SocketManager';

// Define keyboard controls
const controls = [
  { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
  { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
  { name: 'left', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'right', keys: ['ArrowRight', 'KeyD'] },
  { name: 'jump', keys: ['Space'] },
  { name: 'fireball', keys: ['Digit1', 'KeyQ'] },
  { name: 'icebolt', keys: ['Digit2', 'KeyE'] },
  { name: 'waterSplash', keys: ['Digit3', 'KeyR'] },
  { name: 'petrify', keys: ['Digit4', 'KeyF'] },
];

export default function Game() {
  const [isGameStarted, setGameStarted] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [joiningError, setJoiningError] = useState<string | null>(null);
  const isConnected = useGameStore(state => state.isConnected);
  const socket = useGameStore(state => state.socket);
  const hasJoinedGame = useGameStore(state => state.hasJoinedGame);
  const setHasJoinedGame = useGameStore(state => state.setHasJoinedGame);

  useEffect(() => {
    if (isGameStarted && socket && isConnected && playerName.trim() && !hasJoinedGame) {
      console.log('Joining game with player name:', playerName);
      socket.emit('joinGame', playerName);
      setJoiningError(null);
      setHasJoinedGame(true);
    }
  }, [isGameStarted, socket, isConnected, playerName, hasJoinedGame, setHasJoinedGame]);

  const handleStartGame = useCallback(() => {
    if (playerName.trim()) {
      if (!isConnected) {
        setJoiningError('Waiting for server connection...');
      }
      setGameStarted(true);
    }
  }, [playerName, isConnected]);

  if (!isGameStarted) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-black">
        <div className="bg-gray-900 p-8 rounded-lg max-w-md w-full">
          <h1 className="text-4xl font-bold mb-6 text-purple-500">
            VibeAge
          </h1>
          <p className="text-gray-300 mb-6">
            Enter the world of magic and combat. Defeat enemies, level up, and unlock powerful spells in this Lineage-inspired MMORPG!
          </p>
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
              Character Name
            </label>
            <input
              type="text"
              id="name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-4 py-2 rounded bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Enter your character name"
            />
          </div>
          <button
            onClick={handleStartGame}
            className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded transition-colors"
          >
            Enter the World
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <SocketManager />
      <KeyboardControls map={controls}>
        <Canvas 
          className="w-full h-screen"
          shadows
          frameloop="always"
          performance={{ min: 0.5 }}
        >
          <fog attach="fog" args={['#202060', 0, 100]} />
          <ambientLight intensity={0.5} />
          <directionalLight
            position={[10, 10, 10]}
            intensity={0.8}
            castShadow
            shadow-mapSize={[2048, 2048]}
          />
          <Physics>
            <World />
            <Player />
            <Enemies />
            <ActiveSkills />
          </Physics>
        </Canvas>
      </KeyboardControls>
      <UI />
    </div>
  );
}