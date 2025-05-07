'use client';

import { useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useGameStore } from './gameStore';
import { SnapBuffer } from './interpolation';
import { hookVfx } from './vfxDispatcher';
import { initProjectileListeners, useProjectileStoreLegacy } from './projectileManager';
import { useProjectileStore } from './projectileStore';
import { 
  MoveStart, 
  MoveSync, 
  CastReq, 
  PosSnap, 
  VecXZ,
  ProjSpawn2,
  ProjHit2,
  CastSnapshotMsg,
  EffectSnapshotMsg
} from '../../../shared/messages';
import { SkillId } from '../../../shared/skillsDefinition';
import { CastState } from '../../../shared/types';
import { useCombatLogStore } from '../stores/useCombatLogStore';

// Variable for generating unique log entry IDs
let nextId = 1;

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
    console.log('[SocketManager] Player updated:', playerData);
    
    // Check if skill points are included in the update
    if (playerData.availableSkillPoints !== undefined) {
      console.log(`[SocketManager] Skill points updated for player ${playerData.id}: ${playerData.availableSkillPoints}`);
    }
    
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
        isMoving: true,
        targetPos: data.path[0],
        path: data.path,
        pos: data.path[0], // Default to first point in path
        lastUpdateTime: performance.now(),
        speed: data.speed
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

  const handleEnemyUpdated = useCallback((enemyData: any) => {
    updateEnemy(enemyData);
  }, [updateEnemy]);
  
  // Handle cast snapshot updates
  const handleCastSnapshot = useCallback((data: CastSnapshotMsg) => {
    const castData = data.data;
    
    // Update player casting state based on cast state
    if (castData.state === CastState.Casting) {
      // Skill is being cast (equivalent to old CastStart)
      updatePlayer({
        id: castData.casterId,
        castingSkill: castData.skillId as string,
        castingProgressMs: 1000 // Default cast time, should come from skill definition
      });
    } else if (castData.state === CastState.Impact) {
      // Skill cast has completed (equivalent to old CastEnd)
      updatePlayer({
        id: castData.casterId,
        castingSkill: null,
        castingProgressMs: 0
      });
    }
    
    // Pass the cast snapshot to any system that needs it
    window.dispatchEvent(new CustomEvent('castsnapshot', { detail: castData }));
  }, [updatePlayer]);

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
          case 'MoveStart': {
            handlePlayerMoveStart(msg);
            break;
          }
          case 'PosSnap': {
            handlePosSnap(msg);
            break;
          }
          case 'CastFail': {
            handleCastFail(msg);
            break;
          }
          case 'SkillShortcutUpdated': {
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
          }
          case 'SkillLearned': {
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
          }
          case 'ProjSpawn2': {
            // Add to projectile store
            useProjectileStore.getState().add(msg as ProjSpawn2);
            // Also update legacy store during transition
            useProjectileStoreLegacy.getState().addEnhancedProjectile(msg as ProjSpawn2);
            break;
          }
          case 'ProjHit2': {
            // Mark hit in projectile store
            useProjectileStore.getState().hit(msg as ProjHit2);
            // Also update legacy store during transition
            useProjectileStoreLegacy.getState().handleEnhancedHit(msg as ProjHit2);
            
            // Add combat log entry for hit
            const hitMsg = msg as ProjHit2;
            const player = useGameStore.getState().getMyPlayer();
            const playerId = player?.id || '';
            
            // Check if there's damage information
            if (hitMsg.dmg && hitMsg.dmg.length > 0 && hitMsg.hitIds && hitMsg.hitIds.length > 0) {
              // For each hit target
              hitMsg.hitIds.forEach((id, index) => {
                const damage = hitMsg.dmg[index];
                const total = damage;
                const crit = damage > 200; // crude crit flag
                
                useCombatLogStore.getState().push({
                  id: nextId++,
                  text: `${hitMsg.src === playerId ? 'You' : 'Enemy'} hit ${
                    id === playerId ? 'YOU' : 'enemy'
                  } for ${total}${crit ? ' (CRIT!)' : ''}`,
                  ts: Date.now()
                });
                
                // Trim the log after adding entries
                useCombatLogStore.getState().trim();
              });
            }
            break;
          }
          case 'CastSnapshot': {
            handleCastSnapshot(msg as CastSnapshotMsg);
            break;
          }
          case 'EffectSnapshot': {
            handleEffectSnapshot(msg as EffectSnapshotMsg);
            break;
          }
          default: {
            console.log('Unknown message type:', msg.type);
          }
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
    handleCastFail,
    handleCastSnapshot,
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
        isMoving: true,
        targetPos: path[0],
        path: path,
        pos: path[0], // Default to first point in path
        lastUpdateTime: performance.now(),
        speed
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

  // Handle effect snapshots from server
  const handleEffectSnapshot = useCallback((msg: EffectSnapshotMsg) => {
    const targetId = msg.id;
    const sourceId = msg.src;
    const effectId = msg.effectId;
    const stacks = msg.stacks;
    const remainingMs = msg.remainingMs;
    
    console.log(`Effect snapshot: ${effectId} on ${targetId} from ${sourceId}, stacks: ${stacks}, remaining: ${remainingMs}ms`);
    
    // Add to combat log when effect is first applied
    if (remainingMs > 0 && stacks === 1) {

      useCombatLogStore.getState().push({
        id: nextId++,
        text: `>>> ${effectId.toUpperCase()} applied`,
        ts: Date.now()
      });
      
      // Trim the log after adding entries
      useCombatLogStore.getState().trim();
    }
    
    // Check if this is a player effect
    const players = useGameStore.getState().players;
    if (players[targetId]) {
      // Update player with new status effect info
      updatePlayer({
        id: targetId,
        statusEffects: [
          ...players[targetId].statusEffects.filter(e => e.type !== effectId), // Remove old effect of same type
          {
            id: `${effectId}-${sourceId}-${Date.now()}`,
            type: effectId,
            value: 0, // The actual value will be determined by the effect definition
            durationMs: remainingMs,
            startTimeTs: Date.now() - (remainingMs * (1 - stacks / 5)), // Approximate start time based on remaining duration
            sourceSkill: effectId,
            stacks
          }
        ]
      });
    }
    
    // Check if this is an enemy effect
    const enemies = useGameStore.getState().enemies;
    if (enemies[targetId]) {
      // Update enemy with new status effect info
      updateEnemy({
        id: targetId,
        statusEffects: [
          ...enemies[targetId].statusEffects.filter(e => e.type !== effectId), // Remove old effect of same type
          {
            id: `${effectId}-${sourceId}-${Date.now()}`,
            type: effectId,
            value: 0, // The actual value will be determined by the effect definition
            durationMs: remainingMs,
            startTimeTs: Date.now() - (remainingMs * (1 - stacks / 5)), // Approximate start time based on remaining duration
            sourceSkill: effectId,
            stacks
          }
        ]
      });
      
      // Trigger visual effect on the target
      if (stacks === 1) {
        // Only spawn the VFX on first application
        console.log(`VFX for effect ${effectId} on enemy ${targetId}`);
        const enemy = enemies[targetId];
        const position = enemy ? { x: enemy.position.x, y: enemy.position.y, z: enemy.position.z } : undefined;
        
        if (position) {
          // For burn effects
          if (effectId === 'burn') {
            window.dispatchEvent(new CustomEvent('spawnSplash', {
              detail: { position, radius: 1.2, effectType: 'fire' }
            }));
          }
          // For bleed effects
          else if (effectId === 'bleed') {
            window.dispatchEvent(new CustomEvent('spawnSplash', {
              detail: { position, radius: 0.8, effectType: 'blood' }
            }));
          }
        }
      }
    }
  }, [updatePlayer, updateEnemy]);

  return null;
}
