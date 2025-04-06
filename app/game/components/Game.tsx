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
import { GAME_ZONES } from '../systems/zoneSystem';
import { KeyboardControls } from '@react-three/drei';

// Define keyboard controls
const controls = [
  { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
  { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
  { name: 'left', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'right', keys: ['ArrowRight', 'KeyD'] },
  { name: 'jump', keys: ['Space'] },
];

export default function Game() {
  const [isGameStarted, setGameStarted] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const initializePlayer = useGameStore(state => state.initializePlayer);
  const spawnEnemy = useGameStore(state => state.spawnEnemy);
  const updateCastingProgress = useGameStore(state => state.updateCastingProgress);
  const updateSkillCooldowns = useGameStore(state => state.updateSkillCooldowns);
  const updateStatusEffects = useGameStore(state => state.updateStatusEffects);
  const regenerateMana = useGameStore(state => state.regenerateMana);
  const respawnDeadEnemies = useGameStore(state => state.respawnDeadEnemies);

  useEffect(() => {
    if (isGameStarted) {
      // Initialize player
      initializePlayer(playerName);

      // Initialize enemies in each zone
      GAME_ZONES.forEach(zone => {
        // For each mob type in the zone
        zone.mobs.forEach(mobConfig => {
          // Calculate random count between min and max
          const count = Math.floor(
            mobConfig.minCount + 
            Math.random() * (mobConfig.maxCount - mobConfig.minCount)
          );

          // Spawn mobs
          for (let i = 0; i < count; i++) {
            // Get random position within zone
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * zone.radius * 0.8; // Keep within 80% of radius
            const position = {
              x: zone.position.x + Math.cos(angle) * distance,
              y: 0,
              z: zone.position.z + Math.sin(angle) * distance
            };

            // Get random level within zone range
            const level = Math.floor(
              zone.minLevel + 
              Math.random() * (zone.maxLevel - zone.minLevel + 1)
            );

            // Spawn the enemy
            spawnEnemy(mobConfig.type, level, position, zone.id);
          }
        });
      });
    }
  }, [isGameStarted, playerName, initializePlayer, spawnEnemy]);
  
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
      
      // Update status effects
      updateStatusEffects(deltaTime);
      
      // Regenerate mana over time
      regenerateMana(deltaTime);
      
      // Handle respawning dead enemies
      respawnDeadEnemies(deltaTime);
      
      // Schedule next frame
      requestAnimationFrame(gameLoop);
    };
    
    const animationFrame = requestAnimationFrame(gameLoop);
    
    const handleDebugKeys = (e: KeyboardEvent) => {
    };
    
    window.addEventListener('keydown', handleDebugKeys);
    
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('keydown', handleDebugKeys);
    };
  }, [isGameStarted, updateCastingProgress, updateSkillCooldowns, updateStatusEffects, regenerateMana, respawnDeadEnemies]);

  const handleStartGame = () => {
    if (playerName.trim()) {
      setGameStarted(true);
    }
  };

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
      <KeyboardControls map={controls}>
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
      </KeyboardControls>
      <UI />
    </div>
  );
}