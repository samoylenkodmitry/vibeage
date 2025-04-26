'use client';

import { useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useGameStore } from './gameStore';
import { GROUND_Y } from './moveSimulation';
import { MoveStartMsg, MoveStopMsg } from '../../../shared/types';

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

  // Add a more efficient player move handler that directly updates player positions
  // without triggering full state updates
  const handlePlayerMoved = useCallback((moveData: { 
    id: string; 
    x: number; 
    y: number; 
    z: number; 
    ry: number;
  }) => {
    // Get current state and players
    const state = useGameStore.getState();
    const players = state.players;
    const player = players[moveData.id];
    
    if (player) {
      // Directly update the position and rotation without triggering a full state update
      player.position.x = moveData.x;
      player.position.y = moveData.y;
      player.position.z = moveData.z;
      player.rotation.y = moveData.ry;
    }
  }, []);

  // Handle movement start events from server
  const handlePlayerMoveStart = useCallback((data: {id: string, to: {x: number, z: number}, speed: number}) => {
    updatePlayer({ 
      id: data.id, 
      movement: { 
        dest: data.to, 
        speed: data.speed, 
        startTs: performance.now() 
      } 
    });
  }, [updatePlayer]);

  // Handle movement stop events from server
  const handlePlayerMoveStop = useCallback((data: {id: string, pos: {x: number, z: number}}) => {
    updatePlayer({ 
      id: data.id, 
      movement: { 
        dest: null, 
        speed: 0, 
        startTs: 0 
      },
      position: { 
        x: data.pos.x, 
        y: GROUND_Y, 
        z: data.pos.z 
      } 
    });
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

      // Removed automatic joinGame emission to prevent duplicate player IDs

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
        const myPlayerId = useGameStore.getState().myPlayerId;
        console.log('Received game state:', {
          enemyCount: Object.keys(gameState.enemies || {}).length,
          playerCount: Object.keys(gameState.players || {}).length,
          playerSkills: myPlayerId ? gameState.players[myPlayerId]?.skills : []
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

      // Register new movement protocol handlers
      socket.on('playerMoveStart', handlePlayerMoveStart);
      socket.on('playerMoveStop', handlePlayerMoveStop);
      
      // Keep old handlers for compatibility
      socket.on('playerLeft', handlePlayerLeft);
      socket.on('playerUpdated', handlePlayerUpdated);
      socket.on('enemyUpdated', handleEnemyUpdated);
      socket.on('playerMoved', handlePlayerMoved);
    });

    return socket;
  }, [
    setSocket, 
    setMyPlayerId, 
    setGameState, 
    addPlayer, 
    handlePlayerLeft, 
    handlePlayerUpdated, 
    handlePlayerMoved, 
    handleEnemyUpdated, 
    handlePlayerMoveStart, 
    handlePlayerMoveStop, 
    setConnectionStatus
  ]);

  useEffect(() => {
    const socket = handleConnect();
    
    // Cleanup on unmount
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [handleConnect]);

  // Add debugging to socket updates
  useEffect(() => {
    // Get the current socket from the game store
    const socket = useGameStore.getState().socket;
    if (!socket) return;
    
    const debugSocketEvents = (eventName: string) => {
      const originalOn = socket.on.bind(socket);
      socket.on = function(event: string, callback: Function) {
        if (event === eventName) {
          const wrappedCallback = function(this: any, ...args: any[]) {
            console.log(`[Socket] ${event} received:`, ...args);
            return callback.apply(this, args);
          };
          return originalOn(event, wrappedCallback);
        }
        return originalOn(event, callback);
      };
    };
    
    // Debug specific events
    debugSocketEvents('playerJoined');
    debugSocketEvents('playerUpdated');
    debugSocketEvents('gameState');
    debugSocketEvents('playerMoveStart');
    debugSocketEvents('playerMoveStop');
    
    // Log skill events with detailed position info
    const originalSkillEmit = socket.emit.bind(socket);
    socket.emit = function(event: string, ...args: any[]) {
      if (event === 'castSkillRequest' || event === 'playerMove' || 
          event === 'moveStart' || event === 'moveStop') {
        console.log(`[Socket] Emitting ${event}:`, args);
      }
      return originalSkillEmit(event, ...args);
    };
    
  }, []);

  return null;
}
