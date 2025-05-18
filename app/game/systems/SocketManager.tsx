'use client';

import { useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useGameStore } from './gameStore';
import { getBuffer, GROUND_Y } from './interpolation';
import { hookVfx } from './vfxDispatcher';
import { initProjectileListeners } from './projectileManager';
import * as THREE from 'three';
import { 
  // MoveIntent is actually used in type definitions
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  MoveIntent,
  CastReq, 
  PosSnap,
  VecXZ,
  CastSnapshotMsg,
  EffectSnapshotMsg,
  CombatLogMsg,
  // CastFail is used in the handleCastFail callback
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  CastFail
} from '../../../shared/messages';
import { SkillId } from '../../../shared/skillsDefinition';
import { CastState } from '../../../shared/types';
import { useCombatLogStore } from '../stores/useCombatLogStore';
import { useProjectileStore } from './projectileStore'; // Ensure this is imported
import { SKILLS } from '../../../shared/skillsDefinition'; // Ensure SKILLS is imported

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
  
  // Maps to track last positions and velocities for delta updates
  const lastPosMap = useRef<Record<string, VecXZ>>({});
  const lastVelMap = useRef<Record<string, VecXZ>>({});

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

  // Handle position snapshot from server
  const handlePosSnap = useCallback((snap: PosSnap) => {
      
    const state = useGameStore.getState();
    const clientReceiveTs = performance.now();
    
    const { id, pos, vel, rotY, snapTs: serverSnapTs, seq, predictions } = snap;
    
    if (!id || !pos || !serverSnapTs) {
      console.warn("Invalid snapshot entry:", snap);
      return;
    }
    
    // Check if the ID belongs to a player
    const player = state.players[id];
    if (player) {
      // Get global buffer reference for this player
      const buffer = getBuffer(id);
      
      // Use velocity from snapshot or default to zero if not provided
      const velocity = vel || { x: 0, z: 0 };
      
      // Create a properly timestamped snap object
      const snapObject = {
        pos: pos,
        vel: velocity,
        rot: rotY !== undefined ? rotY : player.rotation?.y || 0,
        snapTs: clientReceiveTs,
        serverSnapTs: serverSnapTs,
        seq: seq, // Store sequence number for reconciliation
        predictions: predictions // Include the predictions array from server
      };
      
      // Push to the module-global buffer for calculations
      buffer.push(snapObject);
      
      // Track last known server position for this player
      useGameStore.getState().updateServerLastKnownPosition(id, { ...pos });
      
      // If this is our player and there's a sequence number, we can do client-side reconciliation
      const myPlayerId = state.myPlayerId;
      if (id === myPlayerId && seq !== undefined) {
        // Acknowledge this sequence number was processed by the server
        useGameStore.getState().acknowledgeServerSequence(seq);
      }
      
      // Update last position and velocity maps
      lastPosMap.current[id] = pos;
      lastVelMap.current[id] = velocity;
    } 
    // Check if the ID belongs to an enemy
    else if (state.enemies[id]) {
      const enemy = state.enemies[id];
      
      // Get global buffer reference for this enemy
      const buffer = getBuffer(id);
      
      // Use velocity from snapshot or default to zero if not provided
      const velocity = vel || { x: 0, z: 0 };
      
      // Create a properly timestamped snap object
      const snapObject = {
        pos: pos,
        vel: velocity,
        rot: rotY !== undefined ? rotY : enemy.rotation?.y || 0,
        snapTs: clientReceiveTs,
        serverSnapTs: serverSnapTs,
        predictions: predictions // Include the predictions array from server
      };
      
      // Push to the module-global buffer for calculations
      buffer.push(snapObject);
      
      // Update the enemy in the game store with the new position, velocity and rotation
      useGameStore.getState().updateEnemy({
        id: id,
        position: { 
          x: pos.x, 
          y: enemy.position.y, // Keep the current Y value
          z: pos.z 
        },
        velocity: velocity,
        rotation: { 
          x: enemy.rotation?.x || 0,
          y: rotY !== undefined ? rotY : enemy.rotation?.y || 0,
          z: enemy.rotation?.z || 0
        }
      });
      
      // Update last position and velocity maps
      lastPosMap.current[id] = pos;
      lastVelMap.current[id] = velocity;
    }
  }, []);
  
  // Handle skill cast failure
  const handleCastFail = useCallback((data: { clientSeq: number, reason?: string }) => {
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
      
      // Log the failure reason with improved error handling
      const reasons: Record<string, string> = {
        cooldown: 'Skill is on cooldown',
        nomana: 'Not enough mana',
        invalid: 'Invalid target or skill',
        outofrange: 'Target is out of range'
      };
      
      // Default to 'invalid' if no reason provided or if reason doesn't match known reasons
      const reason = (data.reason && reasons[data.reason]) ? data.reason : 'invalid';
      console.log(`Cast failed: ${reasons[reason] || 'Invalid target or skill'} (${data.reason || 'unknown'})`);
    }
  }, []);

  const handleEnemyUpdated = useCallback((enemyData: any) => {
    updateEnemy(enemyData);
  }, [updateEnemy]);
  
  // Handle cast snapshot updates
  const handleCastSnapshot = useCallback((data: CastSnapshotMsg) => {
    const castData = data.data;

    console.log(`[SocketManager] Handling CastSnapshot: ${JSON.stringify(data)}`);

    // Update player's casting UI state (e.g., for CastingBar)
    if (castData.state === CastState.Casting) {
      // Skill is being cast (equivalent to old CastStart)
      updatePlayer({
        id: castData.casterId,
        castingSkill: castData.skillId as string,
        castingProgressMs: castData.progressMs
      });
    } else if (castData.state === CastState.Traveling || castData.state === CastState.Impact) {
      // If skill is no longer casting (i.e., it's traveling or has impacted),
      // clear the castingSkill for this player
      const playerToUpdate = useGameStore.getState().players[castData.casterId];
      if (playerToUpdate && playerToUpdate.castingSkill === castData.skillId) {
        useGameStore.getState().updatePlayer({
          id: castData.casterId,
          castingSkill: null,
          castingProgressMs: 0
        });
      }
    }
    
    if (castData.state === CastState.Impact) {
      // Projectile impacted or instant skill resolved
      console.log(`[SocketManager] Marking projectile as hit: castId=${castData.castId}`);
      // Use projectile tracking system for hit state
      useProjectileStore.getState().markProjectileAsHit(castData.castId);
    }
    
    const skillDef = SKILLS[castData.skillId as SkillId];
    if (skillDef && skillDef.projectile && castData.state === CastState.Traveling) {
      // This is a projectile that has just started traveling
      console.log(`[SocketManager] Processing traveling projectile: castId=${castData.castId}, skillId=${castData.skillId}`);
      
      if (castData.pos && castData.origin && castData.dir) {
          useProjectileStore.getState().add(castData);
      } else {
        console.warn('[SocketManager] CastSnapshot (Traveling) for projectile missing essential data (pos, origin, or dir):', castData);
      }
    }
    
    // Dispatch generic event for other systems (e.g., non-projectile VFX for instant skills like PetrifyFlash)
    window.dispatchEvent(new CustomEvent('castsnapshot', { detail: castData }));
  }, [updatePlayer]);

  // Handle effect snapshots from server
  const handleEffectSnapshot = useCallback((msg: EffectSnapshotMsg) => {
    console.log(`Received EffectSnapshot for target ${msg.targetId}:`, msg);
    
    const targetId = msg.targetId;
    const effects = msg.effects || [];
    
    // Add to combat log
    if (effects.length > 0) {
      effects.forEach(effect => {
        useCombatLogStore.getState().push({
          id: nextId++,
          text: `>>> ${effect.type.toUpperCase()} applied to ${targetId}`,
          ts: Date.now()
        });
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
        statusEffects: effects
      });
    }
    
    // Check if this is an enemy effect
    const enemies = useGameStore.getState().enemies;
    if (enemies[targetId]) {
      // Update enemy with new status effect info
      updateEnemy({
        id: targetId,
        statusEffects: effects
      });
      
      // Trigger visual effects for each effect
      effects.forEach(effect => {
        const enemy = enemies[targetId];
        const position = enemy ? { x: enemy.position.x, y: enemy.position.y, z: enemy.position.z } : undefined;
        
        if (position) {
          // For burn effects
          if (effect.type === 'burn') {
            window.dispatchEvent(new CustomEvent('spawnSplash', {
              detail: { position, radius: 1.2, effectType: 'fire' }
            }));
          }
          // For bleed effects
          else if (effect.type === 'bleed') {
            window.dispatchEvent(new CustomEvent('spawnSplash', {
              detail: { position, radius: 0.8, effectType: 'blood' }
            }));
          }
        }
      });
    }
  }, [updatePlayer, updateEnemy]);

  // Handle combat log messages from server
  const handleCombatLog = useCallback((msg: CombatLogMsg) => {
    console.log(`Received CombatLog for castId ${msg.castId}:`, msg);
    
    const player = useGameStore.getState().getMyPlayer();
    const playerId = player?.id || '';
    
    // Check if there's damage information
    if (msg.damages && msg.damages.length > 0 && msg.targets && msg.targets.length > 0) {
      // For each hit target
      msg.targets.forEach((targetId, index) => {
        const damage = msg.damages[index];
        const total = damage;
        const crit = damage > 200; // crude threshold for critical hits
        
        useCombatLogStore.getState().push({
          id: nextId++,
          text: `${msg.casterId === playerId ? 'You' : 'Enemy'} hit ${
            targetId === playerId ? 'YOU' : 'enemy'
          } for ${total}${crit ? ' (CRIT!)' : ''}`,
          ts: Date.now()
        });
      });
      
      // Trim the log after adding entries
      useCombatLogStore.getState().trim();
    }
  }, []);

  // Memoize the socket connection handler
  const handleConnect = useCallback(() => {
    // Connect to WebSocket server with improved configuration
    const WS_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'http://localhost:3001';
    const socket = io(WS_URL, {
      path: '/socket.io',
      transports: ['websocket'],
      perMessageDeflate: { threshold: 1024 },   // Enable compression with threshold
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
      // Legacy 'skillEffect' event handler has been removed in protocol v2+

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
        // Add validation to prevent "Unknown message type: undefined" errors
        if (!msg) {
          console.error('Received null or undefined message');
          return;
        }

        // Handle case where we receive an array of messages instead of a single message
        if (Array.isArray(msg)) {
          console.log('Received array of messages, processing each one:', JSON.stringify(msg));
          msg.forEach((item, index) => {
            if (item && typeof item === 'object' && item.type) {
              // Process each valid message in the array
              console.log(`Processing array item ${index} with type: ${item.type}`);
              processMessage(item);
            } else {
              console.warn(`Skipping invalid message in array at index ${index}:`, item);
            }
          });
          return;
        }
        
        // Handle single message object
        if (typeof msg !== 'object') {
          console.error('Received invalid message format:', msg);
          return;
        }
        
        if (!msg.type) {
          console.error('Received message without type property:', msg);
          return;
        }
        
        // Process the single message
        processMessage(msg);
      });
      
      // Helper function to process a single message
      const processMessage = (msg: any) => {
        switch (msg.type) {
          case 'BatchUpdate': {
            // Handle batch updates from server
            if (Array.isArray(msg.updates)) {
              // Process each update in the batch
              msg.updates.forEach(update => {
                if (update && typeof update === 'object' && update.type) {
                  // Process each valid message in the batch
                  processMessage(update);
                }
              });
            }
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
          case 'CastSnapshot': {
            handleCastSnapshot(msg as CastSnapshotMsg);
            break;
          }
          case 'EffectSnapshot': {
            handleEffectSnapshot(msg as EffectSnapshotMsg);
            break;
          }
          case 'CombatLog': {
            handleCombatLog(msg as CombatLogMsg);
            break;
          }
          case 'EnemyAttack': {
            handleEnemyAttack(msg);
            break;
          }
          case 'InventoryUpdate': {
            handleInventoryUpdate(msg);
            break;
          }
          case 'LootAcquired': {
            handleLootAcquired(msg);
            break;
          }
          case 'LootPickup': {
            handleLootPickup(msg);
            break;
          }
          case 'LootSpawn': {
            // Handle loot spawned from a killed enemy
            console.log('Loot spawned:', msg);
            // Use the lootId provided by the server instead of generating a new one
            const lootId = msg.lootId || `loot-${msg.enemyId}-${Date.now()}`;
            const enemy = useGameStore.getState().enemies[msg.enemyId];
            if (enemy) {
              // Get position from the message or use enemy position as fallback
              const position = msg.position || { x: enemy.position.x, y: 0.2, z: enemy.position.z };
              
              // If position from server only has x,z, add y component for 3D rendering
              if (position && !position.y) {
                position.y = 0.2; // Default Y position for ground loot
              }
              
              // We have the enemy position, create the loot at that position
              useGameStore.getState().addGroundLoot(
                lootId, 
                msg.enemyId,
                position, 
                msg.loot
              );
              
              // Log the loot drop
              const lootText = msg.loot
                .map((item: any) => `${item.quantity}x ${item.itemId}`)
                .join(', ');
              
              useCombatLogStore.getState().push({
                id: Date.now(),
                text: `${enemy.name} dropped: ${lootText}`,
                ts: Date.now()
              });
            }
            break;
          }
          default: {
            console.log('Unknown message type:', msg.type);
            break;
          }
        }
      };

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
    handlePosSnap,
    handleCastFail,
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

  // The only movement message function we now need is sendMoveIntent
  const sendMoveIntent = useCallback((targetPos: VecXZ) => {
    const socket = useGameStore.getState().socket;
    const myPlayerId = useGameStore.getState().myPlayerId;
    
    if (!socket || !myPlayerId) return;
    
    // Generate sequence number for this move intent
    const clientSeq = Date.now(); // Use timestamp as sequence number for simplicity
    
    // Log the outgoing message for debugging
    console.log('Sending MoveIntent to server:', { targetPos, clientSeq });
    
    // Add this sequence to pending list for reconciliation
    useGameStore.getState().recordMoveIntent(clientSeq);
    
    socket.emit('msg', {
      type: 'MoveIntent',
      id: myPlayerId,
      targetPos,
      clientTs: Date.now(),
      seq: clientSeq
    });
    
    // Store the last time we sent a move intent (for debouncing)
    useGameStore.getState().lastMoveIntentSent = Date.now();
    
    // Store the target in UI state only - not as a position/movement update
    useGameStore.getState().setTargetWorldPos(new THREE.Vector3(targetPos.x, GROUND_Y, targetPos.z));
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
      sendCastReq,
      sendMoveIntent
    });
  }, [sendCastReq, sendMoveIntent]);

  // Handle enemy attack message
  const handleEnemyAttack = useCallback((msg: {enemyId: string, targetId: string, damage: number}) => {
    console.log(`[SocketManager] Enemy ${msg.enemyId} attacks player ${msg.targetId} for ${msg.damage} damage`);
    
    // Create formatted text message for combat log
    const enemy = useGameStore.getState().enemies[msg.enemyId];
    const player = useGameStore.getState().players[msg.targetId];
    const enemyName = enemy?.name || 'Unknown Enemy';
    const playerName = player?.name || 'Unknown Player';
    
    // Add to combat log
    useCombatLogStore.getState().push({
      id: nextId++,
      text: `${enemyName} attacks ${playerName} for ${msg.damage} damage!`,
      ts: Date.now()
    });
    
    // Trim the log after adding entries
    useCombatLogStore.getState().trim();
    
    // Trigger VFX event for enemy attack
    window.dispatchEvent(new CustomEvent('enemyattack', {
      detail: {
        enemyId: msg.enemyId,
        targetId: msg.targetId,
        damage: msg.damage
      }
    }));
  }, []);
  
  // Handle inventory update message
  const handleInventoryUpdate = useCallback((msg: any) => {
    const myPlayerId = useGameStore.getState().myPlayerId;
    if (!myPlayerId) return;
    
    console.log('[SocketManager] Received inventory update:', msg);
    
    // First, apply the update through updatePlayer
    useGameStore.getState().updatePlayer({
      id: myPlayerId,
      inventory: msg.inventory,
      maxInventorySlots: msg.maxInventorySlots
    });
    
    // Additionally, ensure the inventory state is directly updated for UI
    useGameStore.getState().updateInventory(msg.inventory);
    
    // Log the updated inventory state
    console.log('[SocketManager] Updated inventory state:', 
      useGameStore.getState().inventory, 
      useGameStore.getState().players[myPlayerId]?.inventory);
  }, []);
  
  // Handle loot acquired message
  const handleLootAcquired = useCallback((msg: any) => {
    console.log('Received loot acquired notification:', msg);
    
    // Format the loot items for the combat log
    const lootText = msg.items
      .map((item: any) => `${item.quantity}x ${item.itemId}`)
      .join(', ');
    
    // Add the loot message to the combat log
    useCombatLogStore.getState().push({
      id: Date.now(),
      text: `Looted: ${lootText} from ${msg.sourceEnemyName || 'enemy'}`,
      ts: Date.now()
    });
  }, []);

  // Handle loot pickup message (when other players pick up loot)
  const handleLootPickup = useCallback((msg: any) => {
    console.log('Loot picked up:', msg);
    
    // Remove the loot from the ground client-side
    useGameStore.getState().removeGroundLoot(msg.lootId);
    
    // If it's not us who picked it up, show a message
    const myPlayerId = useGameStore.getState().myPlayerId;
    if (msg.playerId !== myPlayerId) {
      const playerName = useGameStore.getState().players[msg.playerId]?.name || "Another player";
      
      // Add a message to the combat log
      useCombatLogStore.getState().push({
        id: Date.now(),
        text: `${playerName} picked up loot`,
        ts: Date.now()
      });
    }
  }, []);
  
  return null;
}
