'use client';

import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { KeyboardControls } from '@react-three/drei';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import World from './World';
import Player from './Player';
import Enemies from './Enemies';
import UI from './UI';
import KeyboardShortcuts from './KeyboardShortcuts';
import TargetRing from './TargetRing';
import VfxManager from './VfxManager';
import GameHud from './GameHud';
import { useGameStore } from '../systems/gameStore';
import { GROUND_Y, getBuffer } from '../systems/interpolation'; 
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

function CameraFollowPlayer() {
  const myId = useGameStore(s => s.myPlayerId);
  const players = useGameStore(s => s.players);
  const angleRef = useRef(Math.PI);

  // Listen for camera angle changes from Player.tsx
  useEffect(() => {
    const handleCameraAngleChange = (e: CustomEvent) => {
      angleRef.current = e.detail.angle;
    };

    window.addEventListener('cameraAngleChange', handleCameraAngleChange as EventListener);
    
    return () => {
      window.removeEventListener('cameraAngleChange', handleCameraAngleChange as EventListener);
    };
  }, []);

  useFrame(({camera})=>{
    if(!myId) return;
    
    // Get current player state
    const player = players[myId];
    if (!player) return;
    
    // Use consistent lag value of 100ms to avoid stuttering
    const s = getBuffer(myId).sample(performance.now()-100);
    
    // If buffer has valid data, use it for camera position
    if(s) {
      const dist=15, height=10, ang=angleRef.current;
      
      // Create target position
      const targetPos = new THREE.Vector3(
        s.x - Math.sin(ang)*dist,
        GROUND_Y + height,
        s.z - Math.cos(ang)*dist
      );
      
      // Use stronger lerp factor for smoother camera follow
      camera.position.lerp(targetPos, 0.15);
      camera.lookAt(s.x, GROUND_Y+1, s.z);
    } 
    // Fallback to state-based position if buffer doesn't have data yet
    else if (player.position) {
      const dist=15, height=10, ang=angleRef.current;
      
      // Create target position using state instead of buffer
      const targetPos = new THREE.Vector3(
        player.position.x - Math.sin(ang)*dist,
        GROUND_Y + height,
        player.position.z - Math.cos(ang)*dist
      );
      
      camera.position.lerp(targetPos, 0.15);
      camera.lookAt(player.position.x, GROUND_Y+1, player.position.z);
    }
  });
  
  return null;
}

export default function Game() {
  const [isGameStarted, setGameStarted] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const isConnected = useGameStore(state => state.isConnected);
  const socket = useGameStore(state => state.socket);
  const hasJoinedGame = useGameStore(state => state.hasJoinedGame);
  const setHasJoinedGame = useGameStore(state => state.setHasJoinedGame);

  useEffect(() => {
    if (isGameStarted && socket && isConnected && playerName.trim() && !hasJoinedGame) {
      console.log('Joining game with player name:', playerName);
      // Use protocol version 2 as required by the server
      socket.emit('joinGame', { 
        playerName,
        clientProtocolVersion: 2
      });
      setHasJoinedGame(true);
    }
  }, [isGameStarted, socket, isConnected, playerName, hasJoinedGame, setHasJoinedGame]);

  const handleStartGame = useCallback(() => {
    if (playerName.trim()) {
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
      <KeyboardShortcuts />
      <KeyboardControls map={controls}>
        <Canvas 
          className="w-full h-screen"
          shadows
          frameloop="always"
          performance={{ min: 0.5 }}
          camera={{ 
            position: [0, 10, 15], 
            fov: 60,
            near: 0.1,
            far: 1000
          }}
          onCreated={({ gl }) => {
            // Configure renderer for better performance
            gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            gl.setClearColor('#202060'); // Default background color
            console.log('Canvas created successfully!');
          }}
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
            <TargetRing />
            <VfxManager />
            <CameraFollowPlayer />
          </Physics>
        </Canvas>
      </KeyboardControls>
      <GameHud>
        <UI />
      </GameHud>
    </div>
  );
}
