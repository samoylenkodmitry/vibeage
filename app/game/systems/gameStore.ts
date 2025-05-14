'use client';

import { create } from 'zustand';
import { produce } from 'immer';
import { Character } from '../models/Character';
import { Enemy } from '../models/Enemy';
import { VecXZ, PlayerMovementState } from '../../../shared/types';

// StatusEffect interface for tracking active effects
export interface StatusEffect {
  id: string;
  type: string;
  value: number;
  durationMs: number;
  startTimeTs: number;
  sourceSkill: string;
  stacks?: number;  // Optional stacks field for stackable effects
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
  lastCastSkillId: string | null;
  flashingSkill: string | null;  // Skill ID that should flash red (for failures)
  manaBarFlash: boolean;         // Whether mana bar should flash red
  currentZoneId: string | null;
  donationXpBoost: number;
  donationBoostEndTimeTs: number | null;
  bonusXpEventActive: boolean;
  serverLastKnownPositions: Record<string, { x: number, z: number }>;  // Last known positions from server
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
  selectedSkill: string | null;
  targetWorldPos: { x: number, y: number, z: number } | null;
  lastMoveSentTimeMs: number | null; // Track the last time we sent a movement update

  // --- Methods ---
  setSocket: (socketInstance: any) => void;
  setGameState: (newState: ServerGameState) => void;
  setMyPlayerId: (id: string) => void;
  addPlayer: (player: PlayerState) => void;
  removePlayer: (playerId: string) => void;
  updatePlayer: (playerData: Partial<PlayerState> & { id: string }) => void;
  updateEnemy: (enemyData: Partial<Enemy> & { id: string }) => void;
  // Movement - server authoritative
  sendMoveIntent: (targetPos: VecXZ) => void;
  sendCastReq: (skillId: string, targetId?: string, targetPos?: VecXZ) => void;
  // Legacy methods for backward compatibility
  sendPlayerMove: (position: { x: number; y: number; z: number }, rotationY: number) => void;
  // Other methods
  sendSelectTarget: (targetId: string | null) => void;
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
  handleSkillHotkey: (key: string) => void;
  setActiveSkill: (skillId: string | null) => void;
  
  // --- New explicitly defined action functions ---
  setLocalPlayerPos: (pos: { x: number, y: number, z: number }) => void;
  setLocalPlayerVel: (vel: { x: number, z: number }) => void;
  setStatusEffects: (targetId: string, effects: StatusEffect[]) => void;
  addXp: (amount: number) => void;
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
  selectGetPlayer,
  selectStatusEffects,
};

export const useGameStore = create<GameState>((set, get) => ({
  // --- Initial State ---
  myPlayerId: null,
  players: {},
  enemies: {},
  selectedTargetId: null,
  lastCastSkillId: null,
  flashingSkill: null,
  manaBarFlash: false,
  currentZoneId: null,
  donationXpBoost: 0,
  donationBoostEndTimeTs: null,
  bonusXpEventActive: false,
  serverLastKnownPositions: {},
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
  selectedSkill: null,
  targetWorldPos: null,
  lastMoveSentTimeMs: null,

  // --- New explicitly defined action functions ---
  setLocalPlayerPos: (pos: { x: number, y: number, z: number }) => {
    set(produce(state => {
      const player = state.myPlayerId ? state.players[state.myPlayerId] : null;
      if (player) {
        player.position.x = pos.x;
        player.position.y = pos.y;
        player.position.z = pos.z;
      }
    }));
  },

  setLocalPlayerVel: (vel: { x: number, z: number }) => {
    set(produce(state => {
      const player = state.myPlayerId ? state.players[state.myPlayerId] : null;
      if (player) {
        if (!player.velocity) {
          player.velocity = { x: 0, y: 0, z: 0 };
        }
        player.velocity.x = vel.x;
        player.velocity.z = vel.z;
      }
    }));
  },

  setStatusEffects: (targetId: string, effects: StatusEffect[]) => {
    set(produce(state => {
      if (targetId === 'player' || targetId === state.myPlayerId) {
        const player = state.myPlayerId ? state.players[state.myPlayerId] : null;
        if (player) {
          // Create a new array to ensure proper reference change
          player.statusEffects = [...effects];
        }
      } else {
        const enemy = state.enemies[targetId];
        if (enemy) {
          // Create a new array to ensure proper reference change
          enemy.statusEffects = [...effects];
        }
      }
    }));
  },

  addXp: (amount: number) => {
    set(produce(state => {
      const player = state.myPlayerId ? state.players[state.myPlayerId] : null;
      if (player) {
        player.experience += amount;
        
        // Optional: Check if player has leveled up and adjust experienceToNextLevel
        if (player.experience >= player.experienceToNextLevel) {
          // This may need to be handled by server, but we can simulate it locally too
          player.experience -= player.experienceToNextLevel;
          player.experienceToNextLevel = Math.floor(player.experienceToNextLevel * 1.5);
        }
      }
    }));
  },

  // --- Methods ---
  setSocket: (socketInstance: any) => {
    set(produce(state => {
      state.socket = socketInstance;
    }));
  },
  
  // New method to handle keyboard shortcuts for skills
  handleSkillHotkey: (key: string) => {
    const player = get().getMyPlayer();
    const selectedTarget = get().selectedTargetId;
    
    if (!player || !player.skillShortcuts) return;
    
    // Convert key to index (keys 1-9 map to array indices 0-8)
    const keyNum = parseInt(key);
    if (isNaN(keyNum) || keyNum < 1 || keyNum > 9) return;
    
    const shortcutIndex = keyNum - 1;
    const skillId = player.skillShortcuts[shortcutIndex];
    
    if (skillId) {
      console.log(`Using skill hotkey ${keyNum} to cast ${skillId}`);
      get().setSelectedSkill(skillId);
      
      // If there's a selected target, cast immediately
      if (selectedTarget) {
        get().sendCastReq(skillId, selectedTarget);
      }
    }
  },

  setGameState: (newState: ServerGameState) => {
    set(produce(state => {
      state.players = newState.players;
      state.enemies = newState.enemies;
      state.selectedTargetId = newState.enemies[state.selectedTargetId ?? ''] ? state.selectedTargetId : null;
    }));
  },

  setMyPlayerId: (id: string) => {
    set(produce(state => {
      state.myPlayerId = id;
    }));
  },

  addPlayer: (player: PlayerState) => {
    set(produce(state => {
      state.players[player.id] = player;
    }));
  },

  removePlayer: (playerId: string) => {
    set(produce(state => {
      delete state.players[playerId];
    }));
  },

  updatePlayer: (playerData: Partial<PlayerState> & { id: string }) => {
    set(produce(state => {
      const currentPlayer = state.players[playerData.id];
      if (!currentPlayer) return;
      
      // Handle statusEffects immutably
      if ('statusEffects' in playerData && Array.isArray(playerData.statusEffects)) {
        currentPlayer.statusEffects = [...playerData.statusEffects];
        
        // Create a copy without statusEffects
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { statusEffects: _ignored, ...otherProps } = playerData;
        
        // Check if any values are actually different before updating
        const hasChanges = Object.keys(otherProps).some(key => 
          otherProps[key as keyof typeof otherProps] !== currentPlayer[key as keyof typeof currentPlayer]
        );
        
        if (hasChanges) {
          Object.assign(currentPlayer, otherProps);
        }
      } else {
        // No statusEffects property, so we can update everything directly
        const hasChanges = Object.keys(playerData).some(key => 
          playerData[key as keyof typeof playerData] !== currentPlayer[key as keyof typeof currentPlayer]
        );
        
        if (hasChanges) {
          Object.assign(currentPlayer, playerData);
        }
      }
    }));
  },

  updateEnemy: (enemyData: Partial<Enemy> & { id: string }) => {
    set(produce(state => {
      const enemy = state.enemies[enemyData.id];
      if (enemy) {
        // Handle statusEffects immutably if present
        if ('statusEffects' in enemyData && Array.isArray(enemyData.statusEffects)) {
          enemy.statusEffects = [...enemyData.statusEffects];
          // Create a copy without statusEffects to avoid double-applying
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { statusEffects: _ignored, ...otherProps } = enemyData;
          // Update other properties
          Object.assign(enemy, otherProps);
        } else {
          // No statusEffects to handle, update normally
          Object.assign(enemy, enemyData);
        }
      }
    }));
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
    set(produce(state => {
      state.lastMoveSentTimeMs = now;
    }));
    
    socket.emit('playerMove', { position, rotationY });
  },

  // New intent-based movement method with the server-authoritative protocol
  sendMoveIntent: (targetPos: VecXZ) => {
    const socket = get().socket;
    const myPlayerId = get().myPlayerId;
    
    if (!socket || !myPlayerId) {
      console.warn('Cannot send move intent: Socket not connected or player ID unknown');
      return;
    }
    
    socket.emit('msg', {
      type: 'MoveIntent',
      id: myPlayerId,
      targetPos: targetPos,
      clientTs: Date.now()
    });
    
  },
  
  sendCastReq: (skillId: string, targetId?: string, targetPos?: VecXZ) => {
    const socket = get().socket;
    const myPlayerId = get().myPlayerId;
    
    if (!socket || !myPlayerId) {
      console.warn('Cannot send cast request: Socket not connected or player ID unknown');
      return;
    }
    
    // Store the skill ID for reconciliation with CastFail responses
    set(produce(state => {
      state.lastCastSkillId = skillId;
    }));
    
    console.log(`Sending CastReq: skill=${skillId}, target=${targetId || 'none'}, player=${myPlayerId}`);
    
    socket.emit('msg', {
      type: 'CastReq',
      id: myPlayerId,
      skillId,
      targetId,
      targetPos,
      clientTs: Date.now()
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
    if (!state.myPlayerId || !state.selectedTargetId) return;
    
    // Use the new CastReq protocol
    get().sendCastReq(skillId, state.selectedTargetId);
  },

  setActiveSkill: (skillId: string | null) => {
    set(produce(state => {
      state.selectedSkill = skillId;
    }));
  },

  selectTarget: (targetId: string | null) => {
    set(produce(state => {
      if (targetId === null || state.enemies[targetId]) {
        state.selectedTargetId = targetId;
      } else {
        state.selectedTargetId = null;
      }
    }));
  },

  setSelectedSkill: (skillId: string | null) => {
    set(produce(state => {
      state.selectedSkill = skillId;
    }));
  },

  setTargetWorldPos: (pos: { x: number, y: number, z: number } | null) => {
    set(produce(state => {
      state.targetWorldPos = pos;
    }));
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
    set(produce(state => {
      state.donationXpBoost = amount;
      state.donationBoostEndTimeTs = Date.now() + (durationMinutes * 60 * 1000);
    }));
  },

  clearDonationBoost: () => {
    set(produce(state => {
      state.donationXpBoost = 0;
      state.donationBoostEndTimeTs = null;
    }));
  },

  toggleXpEvent: () => {
    set(produce(state => {
      state.bonusXpEventActive = !state.bonusXpEventActive;
    }));
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
      set(produce(state => {
        const enemy = state.enemies[targetId];
        if (enemy) {
          // You might add a temporary visual effect here
          // This is just for immediate feedback while waiting for the server update
        }
      }));
    }
  },

  setHasJoinedGame: (joined: boolean) => {
    set(produce(state => {
      state.hasJoinedGame = joined;
    }));
  },

}));
