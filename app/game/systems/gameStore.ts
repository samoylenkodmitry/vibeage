'use client';

import { create } from 'zustand';
import { Character } from '../models/Character';
import { Enemy } from '../models/Enemy';
import { Skill } from '../models/Skill';
import { PlayerState as ServerPlayerState, VecXZ, PlayerMovementState } from '../../../shared/types';

// StatusEffect interface for tracking active effects
export interface StatusEffect {
  id: string;
  type: string;
  value: number;
  durationMs: number;
  startTimeTs: number;
  sourceSkill: string;
}

// Define the structure for player state received from the server
interface PlayerState extends Character {
  socketId?: string;
  experience: number;
  experienceToNextLevel: number;
  statusEffects: StatusEffect[];
  skillCooldownEndTs: Record<string, number>;
  castingSkill: string | null;
  castingProgressMs: number;
  isAlive: boolean;
  movement?: PlayerMovementState;
}

// Define the structure for the overall game state received from the server
interface ServerGameState {
  players: Record<string, PlayerState>;
  enemies: Record<string, Enemy>;
}

interface GameState {
  // --- State ---
  myPlayerId: string | null;
  players: Record<string, PlayerState>;
  enemies: Record<string, Enemy>;
  selectedTargetId: string | null;
  selectedSkill: string | null;
  currentZoneId: string | null;
  donationXpBoost: number;
  donationBoostEndTimeTs: number | null;
  bonusXpEventActive: boolean;
  player: PlayerState | null;
  experience: number;
  experienceToNextLevel: number;
  skillCooldownEndTs: Record<string, number>;
  castingSkill: string | null;
  castingProgressMs: number;
  isConnected: boolean;
  lastConnectionChangeTs: number;
  socket: any | null;
  hasJoinedGame: boolean;
  targetWorldPos: { x: number, y: number, z: number } | null;
  lastMoveSentTimeMs: number | null; // Track the last time we sent a movement update

  // --- Methods ---
  setSocket: (socket: any) => void;
  setGameState: (newState: ServerGameState) => void;
  setMyPlayerId: (id: string) => void;
  addPlayer: (player: PlayerState) => void;
  removePlayer: (playerId: string) => void;
  updatePlayer: (playerData: Partial<PlayerState> & { id: string }) => void;
  updateEnemy: (enemyData: Partial<Enemy> & { id: string }) => void;
  // Legacy movement
  sendPlayerMove: (position: { x: number; y: number; z: number }, rotationY: number) => void;
  // Intent-based movement
  sendMoveStart: (from: VecXZ, to: VecXZ, speed: number) => void;
  sendMoveStop: (pos: VecXZ) => void;
  // Other methods
  sendSelectTarget: (targetId: string | null) => void;
  sendCastSkill: (skillId: string, targetId: string | null) => void;
  sendCancelCast: () => void;
  selectTarget: (targetId: string | null) => void;
  setSelectedSkill: (skillId: string | null) => void;
  setTargetWorldPos: (pos: { x: number, y: number, z: number } | null) => void;
  getMyPlayer: () => PlayerState | null;
  getSelectedTarget: () => Enemy | null;
  getStatusEffects: (targetId: string | 'player') => StatusEffect[];
  getXpMultiplierInfo: () => { base: number; donation: number; event: number; total: number };
  applyDonationBoost: (amount: number, durationMinutes: number) => void;
  clearDonationBoost: () => void;
  toggleXpEvent: () => void;
  updatePlayerZone: () => void;
  applySkillEffect: (targetId: string, effects: any[]) => void;
  setHasJoinedGame: (joined: boolean) => void;
}

// --- Memoized selectors ---
// We ensure selectors are stable by declaring them outside the store
const selectPlayers = (state: GameState) => state.players;
const selectPlayerIds = (state: GameState) => {
  const players = selectPlayers(state);
  
  // Only recompute if players object has changed
  if (players !== previousPlayers) {
    playerIdsCache = Object.keys(players);
    previousPlayers = players;
  }
  
  return playerIdsCache;
};

// Ensure stable reference by caching the array instance
let playerIdsCache: string[] = [];
let previousPlayers: Record<string, PlayerState> | null = null;

// Create a stable memoized selector for status effects
const selectStatusEffects = (targetId: string | 'player') => {
  const selector = (state: GameState) => {
    if (targetId === 'player') {
      const player = state.myPlayerId ? state.players[state.myPlayerId] : null;
      return player?.statusEffects || [];
    }
    const enemy = state.enemies[targetId];
    return enemy?.statusEffects || [];
  };
  // Add metadata for stable referencing
  selector.store = { targetId };
  return selector;
};

const selectMyPlayerId = (state: GameState) => state.myPlayerId;
const selectEnemies = (state: GameState) => state.enemies;
const selectEnemyCount = (state: GameState) => Object.keys(state.enemies).length;
const selectSelectedTargetId = (state: GameState) => state.selectedTargetId;

// Memoized player selector using a stable function
const selectPlayer = (id: string) => {
  const selector = (state: GameState) => selectPlayers(state)[id];
  // Using Object.is for referential equality check
  selector.store = { id };
  return selector;
};

const selectSendPlayerMove = (state: GameState) => state.sendPlayerMove;
const selectCastSkill = (state: GameState) => state.sendCastSkill;
const selectGetPlayer = (state: GameState) => state.getMyPlayer;

export {
  selectPlayers,
  selectPlayerIds,
  selectMyPlayerId,
  selectEnemies,
  selectEnemyCount,
  selectSelectedTargetId,
  selectPlayer,
  selectSendPlayerMove,
  selectCastSkill,
  selectGetPlayer,
  selectStatusEffects,
};

export const useGameStore = create<GameState>((set, get) => ({
  // --- Initial State ---
  myPlayerId: null,
  players: {},
  enemies: {},
  selectedTargetId: null,
  selectedSkill: null,
  currentZoneId: null,
  donationXpBoost: 0,
  donationBoostEndTimeTs: null,
  bonusXpEventActive: false,
  player: null,
  experience: 0,
  experienceToNextLevel: 100,
  skillCooldownEndTs: {},
  castingSkill: null,
  castingProgressMs: 0,
  isConnected: false,
  lastConnectionChangeTs: Date.now(),
  socket: null,
  hasJoinedGame: false,
  targetWorldPos: null,
  lastMoveSentTimeMs: null,

  // --- Methods ---
  setSocket: (socketInstance: any) => {
    set({ socket: socketInstance });
  },

  setGameState: (newState: ServerGameState) => {
    set({ 
      players: newState.players,
      enemies: newState.enemies,
      selectedTargetId: newState.enemies[get().selectedTargetId ?? ''] ? get().selectedTargetId : null,
    });
  },

  setMyPlayerId: (id: string) => {
    set({ myPlayerId: id });
  },

  addPlayer: (player: PlayerState) => {
    set(state => ({
      players: { ...state.players, [player.id]: player }
    }));
  },

  removePlayer: (playerId: string) => {
    set(state => {
      const newPlayers = { ...state.players };
      delete newPlayers[playerId];
      return { players: newPlayers };
    });
  },

  updatePlayer: (playerData: Partial<PlayerState> & { id: string }) => {
    set(state => {
      const currentPlayer = state.players[playerData.id];
      if (!currentPlayer) return state;
      
      // Check if this is the locally controlled player
      const isSelf = playerData.id === state.myPlayerId;
      
      if (isSelf && playerData.position) {
        // For self-controlled player, only accept server position corrections 
        // when the error is significant (> 0.5 units)
        const dx = currentPlayer.position.x - playerData.position.x;
        const dz = currentPlayer.position.z - playerData.position.z;
        const error = Math.sqrt(dx * dx + dz * dz);
        
        // Ignore minor position updates from server for self-controlled player
        if (error < 0.5) {
          // Still update other properties, just not position
          const { position, ...otherProps } = playerData;
          
          // If we only had position update, return unchanged state
          if (Object.keys(otherProps).length === 1) { // Only 'id' remains
            return state;
          }
          
          // Update other properties
          return {
            players: {
              ...state.players,
              [playerData.id]: { ...currentPlayer, ...otherProps }
            }
          };
        }
      }
      
      // For other players or significant corrections, process normally
      // Check if any values are actually different before updating
      const hasChanges = Object.keys(playerData).some(key => 
        playerData[key as keyof typeof playerData] !== currentPlayer[key as keyof typeof currentPlayer]
      );
      
      if (!hasChanges) return state;
      
      return {
        players: {
          ...state.players,
          [playerData.id]: { ...currentPlayer, ...playerData }
        }
      };
    });
  },

  updateEnemy: (enemyData: Partial<Enemy> & { id: string }) => {
    set(state => {
      if (!state.enemies[enemyData.id]) return state;
      return {
        enemies: {
          ...state.enemies,
          [enemyData.id]: { ...state.enemies[enemyData.id], ...enemyData }
        }
      };
    });
  },

  // Legacy movement method - keep for compatibility but mark as deprecated
  sendPlayerMove: (position: { x: number; y: number; z: number }, rotationY: number) => {
    console.warn('sendPlayerMove is deprecated. Use intent-based movement instead.');
    const socket = get().socket;
    if (!socket) {
      console.warn('Cannot send player move: Socket not connected');
      return;
    }
    
    // Throttle outbound messages to reduce network traffic
    const now = performance.now();
    const lastSent = get().lastMoveSentTimeMs || 0;
    
    // Limit to 13Hz (roughly 75ms between updates)
    if (now - lastSent < 75) {
      return;
    }
    
    // Update the last sent timestamp
    set({ lastMoveSentTimeMs: now });
    
    socket.emit('playerMove', { position, rotationY });
  },

  // New intent-based movement methods
  sendMoveStart: (from: VecXZ, to: VecXZ, speed: number) => {
    const socket = get().socket;
    const myPlayerId = get().myPlayerId;
    
    if (!socket || !myPlayerId) {
      console.warn('Cannot send move start: Socket not connected or player ID unknown');
      return;
    }
    
    socket.emit('moveStart', {
      type: 'moveStart',
      id: myPlayerId,
      from,
      to,
      speed,
      ts: Date.now()
    });
  },
  
  sendMoveStop: (pos: VecXZ) => {
    const socket = get().socket;
    const myPlayerId = get().myPlayerId;
    
    if (!socket || !myPlayerId) {
      console.warn('Cannot send move stop: Socket not connected or player ID unknown');
      return;
    }
    
    socket.emit('moveStop', {
      type: 'moveStop',
      id: myPlayerId,
      pos,
      ts: Date.now()
    });
  },

  sendSelectTarget: (targetId: string | null) => {
    const socket = get().socket;
    if (!socket) {
      console.warn('Cannot select target: Socket not connected');
      return;
    }
    socket.emit('selectTargetRequest', targetId);
    get().selectTarget(targetId);
  },

  // --- Actions ---
  castSkill: (skillId: string) => {
    const state = get();
    if (!state.socket || !state.selectedTargetId) return;
    
    state.socket.emit('castSkillRequest', {
      skillId,
      targetId: state.selectedTargetId
    });
  },

  cancelCast: () => {
    const state = get();
    if (!state.socket) return;
    state.socket.emit('cancelCastRequest');
  },

  selectTarget: (targetId: string | null) => {
    if (targetId === null || get().enemies[targetId]) {
      set({ selectedTargetId: targetId });
    } else {
      set({ selectedTargetId: null });
    }
  },

  setSelectedSkill: (skillId: string | null) => {
    set({ selectedSkill: skillId });
  },

  setTargetWorldPos: (pos: { x: number, y: number, z: number } | null) => {
    set({ targetWorldPos: pos });
  },

  getMyPlayer: () => {
    const state = get();
    return state.myPlayerId ? state.players[state.myPlayerId] : null;
  },

  getSelectedTarget: () => {
    const state = get();
    return state.selectedTargetId ? state.enemies[state.selectedTargetId] : null;
  },

  getStatusEffects: (targetId: string | 'player') => {
    const state = get();
    if (targetId === 'player') {
      const player = state.myPlayerId ? state.players[state.myPlayerId] : null;
      return player?.statusEffects || [];
    }
    const enemy = state.enemies[targetId];
    return enemy?.statusEffects || [];
  },

  getXpMultiplierInfo: () => {
    const state = get();
    const base = 1.0;
    const donation = state.donationXpBoost > 0 && state.donationBoostEndTimeTs !== null && state.donationBoostEndTimeTs > Date.now() ? state.donationXpBoost : 0;
    const event = state.bonusXpEventActive ? 0.5 : 0;
    return { base, donation, event, total: base + donation + event };
  },

  applyDonationBoost: (amount: number, durationMinutes: number) => {
    set({
      donationXpBoost: amount,
      donationBoostEndTimeTs: Date.now() + (durationMinutes * 60 * 1000)
    });
  },

  clearDonationBoost: () => {
    set({
      donationXpBoost: 0,
      donationBoostEndTimeTs: null
    });
  },

  toggleXpEvent: () => {
    set(state => ({ bonusXpEventActive: !state.bonusXpEventActive }));
  },

  updatePlayerZone: () => {
    // Placeholder to be implemented when zones are added
  },
  
  applySkillEffect: (targetId: string, effects: any[]) => {
    // Get the socket to communicate with the server
    const socket = get().socket;
    if (!socket) return;
    
    // Send the effects to be applied on the server
    socket.emit('applyEffects', { targetId, effects });
    
    console.log('Applying skill effects to target:', targetId, effects);
    
    // For client-side feedback, we could also update the local state
    // This is optional as the server will broadcast the updated state anyway
    const enemy = get().enemies[targetId];
    if (enemy) {
      // For visual feedback only - the server will handle the actual logic
      set(state => ({
        enemies: {
          ...state.enemies,
          [targetId]: {
            ...enemy,
            // You might want to add a temporary visual effect here
            // This is just for immediate feedback while waiting for the server update
          }
        }
      }));
    }
  },

  setHasJoinedGame: (joined: boolean) => set({ hasJoinedGame: joined }),
}));
