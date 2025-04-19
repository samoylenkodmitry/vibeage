'use client';

import { useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useGameStore } from './gameStore';

export default function SocketManager() {
  // Use individual selectors to prevent unnecessary re-renders
  const setSocket = useGameStore(state => state.setSocket);
  const setMyPlayerId = useGameStore(state => state.setMyPlayerId);
  const setGameState = useGameStore(state => state.setGameState);
  const addPlayer = useGameStore(state => state.addPlayer);
  const removePlayer = useGameStore(state => state.removePlayer);
  const updatePlayer = useGameStore(state => state.updatePlayer);
  const updateEnemy = useGameStore(state => state.updateEnemy);
  // Get connection status update functions
  const setConnectionStatus = useCallback((isConnected: boolean) => {
    useGameStore.setState({ 
      isConnected, 
      lastConnectionChangeTs: Date.now() 
    });
  }, []);

  // Memoize event handlers to prevent recreating them on every render
  const handlePlayerLeft = useCallback((playerId: string) => {
    removePlayer(playerId);
  }, [removePlayer]);

  const handlePlayerUpdated = useCallback((playerData: any) => {
    updatePlayer(playerData);
  }, [updatePlayer]);

  const handleEnemyUpdated = useCallback((enemyData: any) => {
    updateEnemy(enemyData);
  }, [updateEnemy]);

  // Memoize the socket connection handler
  const handleConnect = useCallback(() => {
    // Connect to WebSocket server with improved configuration
    const socket = io('http://localhost:3001', {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    socket.on('connect', () => {
      console.log('Connected to game server, setting socket in game store');
      setConnectionStatus(true);
      setSocket(socket);  // Make sure we set the socket in the game store
      
      // Join game with player name
      socket.emit('joinGame', 'Player' + Math.floor(Math.random() * 1000));

      // Set up skill-related event handlers
      socket.on('skillEffect', (data: { skillId: string, sourceId: string, targetId: string }) => {
        // Update game state based on skill effects
        console.log('Skill effect received:', data);
        
        // Get the player and target positions to create the visual effect
        const gameState = useGameStore.getState();
        const sourcePlayer = gameState.players[data.sourceId];
        const targetEnemy = gameState.enemies[data.targetId];
        
        if (sourcePlayer && targetEnemy) {
          // Dispatch a custom event that ActiveSkills can listen for
          window.dispatchEvent(new CustomEvent('skillTriggered', { 
            detail: {
              id: `effect-${Math.random().toString(36).substr(2, 9)}`,
              skillId: data.skillId,
              sourceId: data.sourceId,
              targetId: data.targetId,
              startPosition: sourcePlayer.position,
              targetPosition: targetEnemy.position,
              createdAtTs: Date.now()
            }
          }));
        }
      });

      socket.on('skillCooldownUpdate', (data: { skillId: string, cooldownEndTime: number }) => {
        // Update skill cooldowns in game state
        console.log('Cooldown update received:', data);
      });

      // Handle existing events...
      socket.on('gameState', (gameState: any) => {
        console.log('Received game state:', {
          enemyCount: Object.keys(gameState.enemies || {}).length,
          playerCount: Object.keys(gameState.players || {}).length,
          playerSkills: gameState.players[useGameStore.getState().myPlayerId]?.skills
        });
        setGameState(gameState);
      });

      socket.on('joinGame', (data: { playerId: string }) => {
        console.log('Joined game with player ID:', data.playerId);
        setMyPlayerId(data.playerId);
        // Request full game state after setting ID
        socket.emit('requestGameState');
      });

      // Handle new players joining
      socket.on('playerJoined', (player: any) => {
        console.log('New player joined:', player);
        addPlayer(player);
      });
      
      // Handle when other players update their state
      socket.on('playerUpdated', (playerData: any) => {
        console.log('Player updated:', playerData);
        updatePlayer(playerData);
      });

      socket.on('newPlayer', (player: any) => {
        addPlayer(player);
      });

      socket.on('playerLeft', handlePlayerLeft);
      socket.on('playerUpdated', handlePlayerUpdated);
      socket.on('enemyUpdated', handleEnemyUpdated);
    });

    return socket;
  }, [setSocket, setMyPlayerId, setGameState, addPlayer, handlePlayerLeft, handlePlayerUpdated, handleEnemyUpdated, setConnectionStatus]);

  useEffect(() => {
    const socket = handleConnect();
    
    // Cleanup on unmount
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [handleConnect]);

  return null;
}
