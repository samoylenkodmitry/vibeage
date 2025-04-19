import { createServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import { ZoneManager, GAME_ZONES } from '../shared/zoneSystem';
import { Enemy, StatusEffect } from '../shared/types';
import { SKILLS, SkillType } from './types';

interface GameState {
  players: Record<string, PlayerState>;
  enemies: Record<string, Enemy>;
}

interface PlayerState {
  id: string;
  socketId: string;
  name: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  skills: SkillType[];
  skillCooldownsMs: Record<string, number>;
  statusEffects: StatusEffect[];
  level: number;
  experience: number;
  experienceToNextLevel: number;
  castingSkill: SkillType | null;
  castingProgressMs: number;
  isAlive: boolean;
  deathTimeTs?: number;
}

// Initialize game state
const gameState: GameState = {
  players: {},
  enemies: {},
};

// Create HTTP server
const httpServer = createServer();

// Configure Socket.IO with improved settings
const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeoutMs: 60000,
  pingIntervalMs: 25000,
  connectTimeoutMs: 45000,
  allowEIO3: true,
  maxHttpBufferSize: 1e8,
  path: '/socket.io/'
});

// Initialize zone manager
const zoneManager = new ZoneManager();

// Spawn initial enemies in each zone
GAME_ZONES.forEach((zone) => {
  const mobsToSpawn = zoneManager.getMobsToSpawn(zone.id);
  mobsToSpawn.forEach((mobConfig) => {
    const { type, count } = mobConfig;
    for (let i = 0; i < count; i++) {
      const position = zoneManager.getRandomPositionInZone(zone.id);
      if (!position) continue;

      const enemyId = `${type}-${Math.random().toString(36).substr(2, 9)}`;
      const level = zoneManager.getMobLevel(zone.id);

      gameState.enemies[enemyId] = {
        id: enemyId,
        type,
        name: type.charAt(0).toUpperCase() + type.slice(1),
        level,
        position,
        spawnPosition: { ...position },
        rotation: { x: 0, y: Math.random() * Math.PI * 2, z: 0 },
        health: 100 + (level * 20),
        maxHealth: 100 + (level * 20),
        isAlive: true,
        attackDamage: 10 + (level * 2),
        attackRange: 2,
        baseExperienceValue: 50 + (level * 10),
        experienceValue: 50 + (level * 10),
        statusEffects: [],
        targetId: null,
      };
    }
  });
});

// Handle socket connections
io.on('connection', (socket: Socket) => {
  console.log('Client connected:', socket.id);

  // Handle player joining
  socket.on('joinGame', (playerName: string) => {
    console.log('Player joining:', playerName);
    const playerId = Math.random().toString(36).substr(2, 9);
    
    // Create new player state
    const player: PlayerState = {
      id: playerId,
      socketId: socket.id,
      name: playerName,
      position: { x: 0, y: 0.5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      health: 100,
      maxHealth: 100,
      mana: 100,
      maxMana: 100,
      level: 1,
      experience: 0,
      experienceToNextLevel: 100,
      statusEffects: [],
      skillCooldownsMs: {},
      castingSkill: null,
      castingProgressMs: 0,
      isAlive: true,
      // Add initial skills
      skills: ['fireball', 'icebolt', 'waterSplash', 'petrify']
    };

    console.log('Created new player with skills:', player.skills);

    // Add player to game state
    gameState.players[playerId] = player;

    // Send initial game state to new player
    console.log('Sending initial game state to player:', {
      playerId,
      skills: player.skills,
      gameStateKeys: Object.keys(gameState)
    });
    socket.emit('joinGame', { playerId });
    socket.emit('gameState', gameState);

    // Broadcast new player to others
    socket.broadcast.emit('playerJoined', player);
  });

  // Handle explicit game state requests
  socket.on('requestGameState', () => {
    console.log('Client requested game state. Enemy count:', Object.keys(gameState.enemies).length);
    socket.emit('gameState', gameState);
  });

  // Handle player movement
  socket.on('playerMove', ({ position, rotationY }) => {
    const player = Object.values(gameState.players).find(p => p.socketId === socket.id);
    if (!player) return;

    player.position = position;
    player.rotation.y = rotationY;

    // Broadcast player movement to all other clients
    socket.broadcast.emit('playerUpdated', {
      id: player.id,
      position,
      rotation: { x: 0, y: rotationY, z: 0 }
    });
  });

  // Handle skill casting
  socket.on('castSkillRequest', ({ skillId, targetId }) => {
    console.log('[SKILL] Cast request received:', { 
      skillId, 
      targetId,
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });
    
    // Find the casting player
    const playerId = Object.keys(gameState.players).find(id => 
      gameState.players[id].socketId === socket.id
    );
    
    console.log('[SKILL] Found player:', {
      playerId,
      playerCount: Object.keys(gameState.players).length,
      allPlayerIds: Object.keys(gameState.players)
    });
    
    if (!playerId) {
      console.log('Player not found for skill cast');
      return;
    }

    const player = gameState.players[playerId];
    const target = gameState.enemies[targetId];

    if (!player || !target) {
      console.log('[SKILL] Invalid player or target:', {
        hasPlayer: !!player,
        hasTarget: !!target,
        targetId,
        requestingSocketId: socket.id
      });
      return;
    }

    // Validate skill is available and off cooldown
    console.log('[SKILL] Validating skill:', {
      playerSkills: player.skills,
      requestedSkill: skillId,
      hasSkill: player.skills.includes(skillId)
    });

    if (!player.skills.includes(skillId)) {
      console.log('[SKILL] Player does not have this skill');
      return;
    }

    const skill = SKILLS[skillId as SkillType];
    if (!skill) {
      console.log('[SKILL] Invalid skill ID:', {
        skillId,
        availableSkills: Object.keys(SKILLS)
      });
      return;
    }

    // Check mana cost
    console.log('[SKILL] Checking mana:', {
      currentMana: player.mana,
      requiredMana: skill.manaCost,
      hasEnoughMana: player.mana >= skill.manaCost
    });

    if (player.mana < skill.manaCost) {
      console.log('[SKILL] Not enough mana');
      return;
    }

    // Check cooldown
    const cooldownEnd = player.skillCooldownsMs[skillId] || 0;
    const now = Date.now();
    console.log('[SKILL] Checking cooldown:', {
      skillId,
      cooldownEnd,
      currentTime: now,
      timeRemainingMs: Math.max(0, cooldownEnd - now),
      timeRemainingSec: Math.max(0, cooldownEnd - now) / 1000,
      isOnCooldown: now < cooldownEnd
    });

    if (now < cooldownEnd) {
      console.log('[SKILL] Skill on cooldown');
      return;
    }

    console.log('[SKILL] Starting cast:', { 
      skillId, 
      targetId,
      playerMana: player.mana,
      targetHealth: target.health
    });

    // Apply skill effects
    player.mana -= skill.manaCost;
    // Set cooldown end time using the already-in-milliseconds cooldown value
    player.skillCooldownsMs[skillId] = now + skill.cooldownMs;

    // Apply damage
    if (skill.damage) {
      const oldHealth = target.health;
      target.health = Math.max(0, target.health - skill.damage);
      console.log('[SKILL] Applying damage:', {
        skillId,
        damage: skill.damage,
        targetOldHealth: oldHealth,
        targetNewHealth: target.health,
        targetDied: target.health === 0
      });
      
      if (target.health === 0) {
        target.isAlive = false;
        target.deathTimeTs = Date.now();
        target.targetId = null;
        
        // Grant experience to the player when the target dies
        player.experience += target.experienceValue;
        console.log('[SKILL] Enemy died, granting XP:', {
          enemyId: target.id,
          xpGained: target.experienceValue,
          playerXp: player.experience
        });
        
        // Check for level up
        while (player.experience >= player.experienceToNextLevel) {
          player.level++;
          player.experience -= player.experienceToNextLevel;
          player.experienceToNextLevel = Math.floor(player.experienceToNextLevel * 1.5);
          player.maxHealth += 20;
          player.health = player.maxHealth;
          player.maxMana += 10;
          player.mana = player.maxMana;
          console.log('[LEVEL UP] Player leveled up:', {
            playerId: player.id,
            newLevel: player.level,
            newMaxHealth: player.maxHealth,
            newMaxMana: player.maxMana
          });
        }
      }
    }

    // Apply status effect
    if (skill.statusEffect) {
      console.log('[SKILL] Applying status effect:', {
        skillId,
        effect: skill.statusEffect
      });

      const effectId = Math.random().toString(36).substr(2, 9);
      target.statusEffects.push({
        id: effectId,
        ...skill.statusEffect,
        startTimeTs: Date.now(),
        sourceSkill: skillId
      });
      
      console.log('[SKILL] Added effect:', {
        effectId,
        type: skill.statusEffect.type,
        value: skill.statusEffect.value,
        durationMs: skill.statusEffect.durationMs
      });
    }

    // Broadcast the skill effect and updated states
    console.log('[SKILL] Broadcasting updates:', {
      skillId,
      sourceId: playerId,
      targetId,
      targetHealth: target.health,
      targetEffects: target.statusEffects.length,
      playerMana: player.mana
    });
    
    io.emit('skillEffect', { skillId, sourceId: playerId, targetId });
    io.emit('playerUpdated', player);
    io.emit('enemyUpdated', target);
  });

  // Handle cast cancellation
  socket.on('cancelCastRequest', () => {
    const player = Object.values(gameState.players).find(p => p.socketId === socket.id);
    if (!player) return;

    player.castingSkill = null;
    player.castingProgressMs = 0;

    // Broadcast cast cancellation
    io.emit('playerUpdated', {
      id: player.id,
      castingSkill: null,
      castingProgressMs: 0
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    const player = Object.values(gameState.players).find(p => p.socketId === socket.id);
    if (!player) return;

    // Remove player from game state
    delete gameState.players[player.id];

    // Broadcast player removal to all clients
    io.emit('playerLeft', player.id);
  });
});

// Handle skill completion and effects
function handleSkillComplete(player: PlayerState, skillId: SkillType, targetId: string) {
  const skill = SKILLS[skillId];
  if (!skill) return;

  // Reset casting state
  player.castingSkill = null;
  player.castingProgressMs = 0;

  // Find target
  const target = gameState.enemies[targetId];
  if (!target || !target.isAlive) return;

  // Apply damage
  if (skill.damage) {
    target.health = Math.max(0, target.health - skill.damage);
    if (target.health === 0) {
      target.isAlive = false;
      target.deathTimeTs = Date.now();
      target.targetId = null;
      
      // Grant experience to the player
      player.experience += target.experienceValue;
      
      // Check for level up
      while (player.experience >= player.experienceToNextLevel) {
        player.level++;
        player.experience -= player.experienceToNextLevel;
        player.experienceToNextLevel = Math.floor(player.experienceToNextLevel * 1.5);
        player.maxHealth += 20;
        player.health = player.maxHealth;
        player.maxMana += 10;
        player.mana = player.maxMana;
      }
    }
  }

  // Apply status effects
  if (skill.statusEffect) {
    target.statusEffects.push({
      ...skill.statusEffect,
      id: Math.random().toString(36).substr(2, 9),
      startTimeTs: Date.now(),
      sourceSkill: skillId
    });
  }

  // Broadcast updates
  io.emit('enemyUpdated', target);
  io.emit('playerUpdated', {
    id: player.id,
    castingSkill: null,
    castingProgressMs: 0,
    experience: player.experience,
    level: player.level,
    health: player.health,
    maxHealth: player.maxHealth,
    mana: player.mana,
    maxMana: player.maxMana
  });
}

// Start game loop
const TICK_RATE = 60;
const MANA_REGEN_PER_SECOND = 2; // Mana points regenerated per second

setInterval(() => {
  // Process player mana regeneration
  Object.values(gameState.players).forEach(player => {
    if (player.isAlive) {
      // Calculate mana regeneration per tick
      const manaRegenPerTick = MANA_REGEN_PER_SECOND / TICK_RATE;
      
      // Only regenerate if not at max mana
      if (player.mana < player.maxMana) {
        player.mana = Math.min(player.maxMana, player.mana + manaRegenPerTick);
        
        // Emit player update every second (not every tick to reduce network traffic)
        if (Math.random() < 1/TICK_RATE) {
          io.emit('playerUpdated', {
            id: player.id,
            mana: player.mana
          });
        }
      }
    }
  });

  // Process all active enemies
  Object.values(gameState.enemies).forEach(enemy => {
    if (!enemy.isAlive) {
      // Handle enemy respawn
      const timeSinceDeath = Date.now() - (enemy.deathTimeTs || 0);
      if (timeSinceDeath >= 30000) { // 30 seconds respawn time
        enemy.isAlive = true;
        enemy.health = enemy.maxHealth;
        enemy.position = { ...enemy.spawnPosition };
        enemy.targetId = null;
        enemy.statusEffects = [];
        io.emit('enemyUpdated', enemy);
      }
      return;
    }

    // Process enemy AI and movement
    if (!enemy.targetId) {
      // Find nearest player within aggro range
      const nearestPlayer = Object.values(gameState.players)
        .filter(p => p.isAlive)
        .reduce((nearest, player) => {
          const dx = player.position.x - enemy.position.x;
          const dz = player.position.z - enemy.position.z;
          const distanceSquared = dx * dx + dz * dz;
          
          if (distanceSquared <= 100 && (!nearest || distanceSquared < nearest.distanceSquared)) {
            return { player, distanceSquared };
          }
          return nearest;
        }, null as { player: PlayerState; distanceSquared: number } | null);

      if (nearestPlayer) {
        enemy.targetId = nearestPlayer.player.id;
        io.emit('enemyUpdated', enemy);
      }
    }
  });
}, 1000 / TICK_RATE);

// Start the server with error handling
const PORT = process.env.PORT || 3001;

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

console.log('Attempting to start game server...');

try {
  httpServer.listen(PORT, () => {
    console.log(`Game server running on port ${PORT}`);
    console.log(`Enemy count at startup: ${Object.keys(gameState.enemies).length}`);
    console.log('Game zones:', GAME_ZONES.map(zone => zone.name).join(', '));
  });
} catch (error) {
  console.error('Failed to start server:', error);
  process.exit(1);
}
