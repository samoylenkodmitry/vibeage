'use client';

import { useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useGameStore } from './gameStore';
import { GROUND_Y } from './moveSimulation';
import { SnapBuffer } from './interpolation';
import { hookVfx } from './vfxDispatcher';
import { initProjectileListeners } from './projectileManager';
import { 
  MoveStart, 
  MoveSync, 
  CastReq, 
  PosSnap, 
  CastStart, 
  CastEnd,
  VecXZ
} from '../../../shared/messages';
import { SkillId } from '../../../shared/skillsDefinition';

export default function SocketManager() {
  // Use individual selectors to prevent unnecessary re-renders
  const setSocket = useGameStore(state => state.setSocket);
  const setMyPlayerId = useGameStore(state => state.setMyPlayerId);
  const setGameState = useGameStore(state => state.setGameState);
  const addPlayer = useGameStore(state => state.addPlayer);
  const removePlayer = useGameStore(state => state.removePlayer);
  const updatePlayer = useGameStore(state => state.updatePlayer);
  const updateEnemy = useGameStore(state => state.updateEnemy);
  
  // Add snapBuffers for each remote player
  const snapBuffers = useRef<Record<string, SnapBuffer>>({});
  
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
  const handlePlayerMoveStart = useCallback((data: MoveStart) => {
    if (!data.path || data.path.length === 0) return;
    
    updatePlayer({ 
      id: data.id, 
      movement: { 
        dest: data.path[0], 
        speed: data.speed, 
        startTs: performance.now() 
      } 
    });
  }, [updatePlayer]);

  // Handle position snapshot from server
  const handlePosSnap = useCallback((data: { snaps: PosSnap[] }) => {
    if (!data.snaps || !Array.isArray(data.snaps)) {
      console.warn("Invalid snaps data received:", data);
      return;
    }
    
    data.snaps.forEach(s => {
      try {
        if (!s || !s.id || !s.pos || !s.vel || typeof s.ts !== 'number') {
          console.warn("Invalid snap entry:", s);
          return;
        }
        
        const state = useGameStore.getState();
        const player = state.players[s.id];
        
        if (player) {
          // Store in snap buffer
          if (!snapBuffers.current[s.id]) snapBuffers.current[s.id] = new SnapBuffer();
          snapBuffers.current[s.id].push({
            pos: s.pos,
            vel: s.vel,
            rot: player.rotation?.y || 0,
            snapTs: s.ts
          });
        }
      } catch (err) {
        console.error("Error processing position snapshot:", err);
      }
    });
  }, []);

  // Handle skill cast start
  const handleCastStart = useCallback((data: CastStart) => {
    updatePlayer({
      id: data.id,
      castingSkill: data.skillId as string,
      castingProgressMs: data.castMs
    });
  }, [updatePlayer]);

  // Handle skill cast failure
  const handleCastFail = useCallback((data: { clientSeq: number, reason: 'cooldown' | 'nomana' | 'invalid' }) => {
    const state = useGameStore.getState();
    const myPlayerId = state.myPlayerId;
    const players = state.players;
    const player = myPlayerId ? players[myPlayerId] : null;
    
    if (player) {
      // Get the skill that failed (if we can identify it from clientSeq)
      // For now we just reset the skill state in case it was locally set
      
      // Revert any local mana or cooldown changes
      if (data.reason === 'nomana') {
        // Flash mana bar red briefly
        useGameStore.setState({ manaBarFlash: true });
        setTimeout(() => useGameStore.setState({ manaBarFlash: false }), 300);
      }
      
      // Flash the skill icon red
      const skillId = state.lastCastSkillId || null;
      if (skillId) {
        useGameStore.setState({ flashingSkill: skillId });
        setTimeout(() => useGameStore.setState({ flashingSkill: null }), 300);
      }
      
      // Log the failure reason
      const reasons = {
        cooldown: 'Skill is on cooldown',
        nomana: 'Not enough mana',
        invalid: 'Invalid target or range'
      };
      console.log(`Cast failed: ${reasons[data.reason]}`);
    }
  }, []);

  // Handle skill cast end
  const handleCastEnd = useCallback((data: CastEnd) => {
    updatePlayer({
      id: data.id,
      castingSkill: null,
      castingProgressMs: 0
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
      
      // Hook up VFX event system
      hookVfx(socket);
      
      // Initialize projectile manager listeners
      initProjectileListeners();

      // Removed automatic joinGame emission to prevent duplicate player IDs

      // Set up skill-related event handlers - will be deprecated after migration
      socket.on('skillEffect', (data: { skillId: string, sourceId: string, targetId: string }) => {
        // Update game state based on skill effects
        console.log('Legacy skillEffect received from server:', data);
        
        // This handler will be removed after the new projectile system is confirmed working
        const gameState = useGameStore.getState();
        const sourcePlayer = gameState.players[data.sourceId];
        const targetEnemy = gameState.enemies[data.targetId];
        
        if (sourcePlayer && targetEnemy) {
          // Dispatch a custom event that ActiveSkills can listen for
          window.dispatchEvent(new CustomEvent('skillTriggered', { 
            detail: {
              id: `effect-${Math.random().toString(36).substring(2, 9)}`,
              skillId: data.skillId as string,
              sourceId: data.sourceId,
              targetId: data.targetId,
              startPosition: sourcePlayer.position,
              targetPosition: targetEnemy.position,
              createdAtTs: Date.now()
            }
          }));
        } else {
          console.warn('Could not find source player or target enemy for skill effect:', {
            skillId: data.skillId,
            sourceId: data.sourceId,
            targetId: data.targetId,
            sourceMissing: !sourcePlayer,
            targetMissing: !targetEnemy,
            playerCount: Object.keys(gameState.players).length,
            enemyCount: Object.keys(gameState.enemies).length
          });
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

      socket.on('msg', (msg: any) => {
        switch (msg.type) {
          case 'MoveStart':
            handlePlayerMoveStart(msg);
            break;
          case 'PosSnap':
            handlePosSnap(msg);
            break;
          case 'CastStart':
            handleCastStart(msg);
            break;
          case 'CastFail':
            handleCastFail(msg);
            break;
          case 'CastEnd':
            handleCastEnd(msg);
            break;
          case 'SkillShortcutUpdated':
            // Update local shortcuts to match server state
            console.log('Skill shortcut updated:', msg);
            try {
              if (typeof msg.slotIndex !== 'number' || msg.slotIndex < 0 || msg.slotIndex > 8) {
                console.error('Invalid slot index in SkillShortcutUpdated message:', msg.slotIndex);
                break;
              }
              
              const player = useGameStore.getState().getMyPlayer();
              if (!player) {
                console.error('Cannot update skill shortcuts: No player data available');
                break;
              }
              
              if (!player.skillShortcuts) {
                console.error('Cannot update skill shortcuts: Player has no skillShortcuts array');
                break;
              }
              
              // Create a new array from existing shortcuts to avoid reference issues
              const updatedShortcuts = [...player.skillShortcuts];
              updatedShortcuts[msg.slotIndex] = msg.skillId;
              
              // Update player in store
              useGameStore.getState().updatePlayer({
                id: player.id,
                skillShortcuts: updatedShortcuts
              });
              
              console.log(`Successfully updated skill shortcut at slot ${msg.slotIndex+1} to ${msg.skillId}`);
            } catch (error) {
              console.error('Error processing SkillShortcutUpdated message:', error);
            }
            break;
          case 'SkillLearned':
            // Handle skill learned confirmation from server
            console.log('Skill learned:', msg);
            if (useGameStore.getState().myPlayerId) {
              const player = useGameStore.getState().getMyPlayer();
              if (player) {
                // Create a new array of unlocked skills with the new skill
                const updatedUnlockedSkills = [...player.unlockedSkills, msg.skillId];
                // Update the player with the new skill and remaining points
                useGameStore.getState().updatePlayer({
                  id: player.id,
                  unlockedSkills: updatedUnlockedSkills,
                  availableSkillPoints: msg.remainingPoints
                });
              }
            }
            break;
          case 'ProjHit':
          case 'ProjEnd':
          case 'InstantHit':
          case 'ProjSpawn':
            // vfxDispatcher will handle this
            break;
          case 'ProjSpawn2':
            window.dispatchEvent(new CustomEvent('projspawn2', {detail: msg}));
            break;
          case 'ProjHit2':
            window.dispatchEvent(new CustomEvent('projhit2', {detail: msg}));
            break;
          default:
            console.log('Unknown message type:', msg.type);
        }
      });

      // Keep old handlers for compatibility during transition
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
    handlePosSnap,
    handleCastStart,
    handleCastFail,
    handleCastEnd,
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
      socket.on = function(event: string, callback: (...args: any[]) => any) {
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
    debugSocketEvents('msg');
    
    // Log outgoing messages
    const originalEmit = socket.emit.bind(socket);
    socket.emit = function(event: string, ...args: any[]) {
      if (event === 'msg' || event === 'joinGame' || event === 'requestGameState') {
        console.log(`[Socket] Emitting ${event}:`, args);
      }
      return originalEmit(event, ...args);
    };
    
  }, []);

  // Function to send MoveStart message
  const sendMoveStart = useCallback((path: VecXZ[], speed: number) => {
    const socket = useGameStore.getState().socket;
    const myPlayerId = useGameStore.getState().myPlayerId;
    
    if (!socket || !myPlayerId) return;
    
    const moveStart: MoveStart = {
      type: 'MoveStart',
      id: myPlayerId,
      path,
      speed,
      clientTs: Date.now()
    };
    
    socket.emit('msg', moveStart);
    
    // Also update local player immediately for prediction
    updatePlayer({ 
      id: myPlayerId, 
      movement: { 
        dest: path[0], 
        speed, 
        startTs: performance.now() 
      } 
    });
  }, [updatePlayer]);
  
  // Function to send MoveSync message
  const sendMoveSync = useCallback(() => {
    const socket = useGameStore.getState().socket;
    const myPlayerId = useGameStore.getState().myPlayerId;
    const players = useGameStore.getState().players;
    
    if (!socket || !myPlayerId || !players[myPlayerId]) return;
    
    const player = players[myPlayerId];
    
    const moveSync: MoveSync = {
      type: 'MoveSync',
      id: myPlayerId,
      pos: { x: player.position.x, z: player.position.z },
      clientTs: Date.now()
    };
    
    socket.emit('msg', moveSync);
  }, []);
  
  // Function to send CastReq message
  const sendCastReq = useCallback((skillId: string, targetId?: string, targetPos?: VecXZ) => {
    const socket = useGameStore.getState().socket;
    const myPlayerId = useGameStore.getState().myPlayerId;
    
    if (!socket || !myPlayerId) return;
    
    const castReq: CastReq = {
      type: 'CastReq',
      id: myPlayerId,
      skillId: skillId as SkillId,
      targetId,
      targetPos,
      clientTs: Date.now()
    };
    
    socket.emit('msg', castReq);
  }, []);
  
  // Add these functions to the game store for components to use
  useEffect(() => {
    useGameStore.setState({
      sendMoveStart,
      sendMoveSync,
      sendCastReq
    });
  }, [sendMoveStart, sendMoveSync, sendCastReq]);
  
  // Set up periodic MoveSync messages
  useEffect(() => {
    const syncInterval = setInterval(sendMoveSync, 2000);
    return () => clearInterval(syncInterval);
  }, [sendMoveSync]);

  return null;
}
