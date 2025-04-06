'use client';

import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Sky } from '@react-three/drei';
import { useEffect, useState } from 'react';
import World from './World';
import Player from './Player';
import Enemies from './Enemies';
import UI from './UI';
import ActiveSkills from './ActiveSkills';
import { useGameStore } from '../systems/gameStore';

export default function Game() {
  const [isGameStarted, setGameStarted] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const initializePlayer = useGameStore(state => state.initializePlayer);
  const spawnEnemy = useGameStore(state => state.spawnEnemy);
  const updateCastingProgress = useGameStore(state => state.updateCastingProgress);
  const updateSkillCooldowns = useGameStore(state => state.updateSkillCooldowns);
  const regenerateMana = useGameStore(state => state.regenerateMana);
  const respawnDeadEnemies = useGameStore(state => state.respawnDeadEnemies);

  useEffect(() => {
    if (isGameStarted) {
      // Spawn some initial enemies when game starts
      spawnEnemy('goblin', 1, { x: 5, y: 0, z: 5 });
      spawnEnemy('wolf', 1, { x: -5, y: 0, z: -5 });
      spawnEnemy('skeleton', 2, { x: 10, y: 0, z: -8 });
    }
  }, [isGameStarted, spawnEnemy]);
  
  // Handle game loop for skill casting, enemy AI, etc.
  useEffect(() => {
    if (!isGameStarted) return;
    
    let lastTime = Date.now();
    
    const gameLoop = () => {
      const currentTime = Date.now();
      const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
      lastTime = currentTime;
      
      // Update casting progress if actively casting
      updateCastingProgress(deltaTime);
      
      // Update skill cooldowns
      updateSkillCooldowns(deltaTime);
      
      // Regenerate mana over time
      regenerateMana(deltaTime);
      
      // Handle respawning dead enemies
      respawnDeadEnemies(deltaTime);
      
      // Schedule next frame
      requestAnimationFrame(gameLoop);
    };
    
    const animationFrame = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationFrame);
  }, [isGameStarted, updateCastingProgress, updateSkillCooldowns, regenerateMana, respawnDeadEnemies]);

  const handleStartGame = () => {
    if (playerName.trim()) {
      initializePlayer(playerName);
      setGameStarted(true);
    }
  };

  if (!isGameStarted) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-black">
        <div className="bg-gray-900 p-8 rounded-lg max-w-md w-full">
          <h1 className="text-4xl font-bold mb-6 text-purple-500">
            3D MMORPG Adventure
          </h1>
          <p className="text-gray-300 mb-6">
            Enter the world of magic and combat. Defeat enemies, level up, and unlock powerful spells!
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
    <>
      <Canvas className="w-full h-screen" shadows>
        <fog attach="fog" args={['#202060', 0, 100]} />
        <ambientLight intensity={0.5} />
        <directionalLight 
          position={[10, 10, 5]} 
          intensity={1} 
          castShadow 
          shadow-mapSize-width={1024} 
          shadow-mapSize-height={1024} 
        />
        <Physics 
          gravity={[0, -20, 0]} 
          timeStep="vary"
          interpolate={true}
          colliders={false}
        >
          <Player />
          <Enemies />
          <World />
          <ActiveSkills />
        </Physics>
        <Sky sunPosition={[100, 10, 100]} />
      </Canvas>
      <UI />
      
      {/* Instructions overlay */}
      <div className="fixed top-4 right-4 bg-black/50 p-3 rounded text-white text-sm pointer-events-none">
        <h3 className="font-bold mb-1">Controls:</h3>
        <ul>
          <li>Left Click: Move character</li>
          <li>Right Click + Drag: Rotate camera</li>
          <li>Left Click on Enemy: Select target</li>
          <li>Space: Jump</li>
        </ul>
      </div>
    </>
  );
}