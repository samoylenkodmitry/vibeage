// filepath: /home/s/develop/projects/vibe/1/tests/combat.castMachine.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Server } from 'socket.io';
import { tickCasts, tickProjectiles } from '../server/combat/skillManager';
import { CastState } from '../shared/types';
import { SKILLS } from '../shared/skillsDefinition';

// Mock socket.io server
const mockEmit = vi.fn();
const mockServer = {
  emit: mockEmit
} as unknown as Server;

// Mock world interface for tests
const mockWorld = {
  getEnemyById: vi.fn((id: string) => {
    if (id === 'enemy1') {
      return {
        id: 'enemy1',
        position: { x: 10, y: 0, z: 10 },
        isAlive: true
      };
    }
    return null;
  }),
  getPlayerById: vi.fn((id: string) => {
    if (id === 'player1') {
      return {
        id: 'player1',
        position: { x: 0, y: 0, z: 0 },
        isAlive: true,
        stats: { damageMultiplier: 1.2 }
      };
    }
    return null;
  }),
  getEntitiesInCircle: vi.fn((pos: {x: number, z: number}, radius: number) => {
    // Simple mock that returns enemies within the radius
    const enemies = [
      { id: 'enemy1', position: { x: 10, y: 0, z: 10 }, isAlive: true },
      { id: 'enemy2', position: { x: 15, y: 0, z: 15 }, isAlive: true },
      { id: 'enemy3', position: { x: 20, y: 0, z: 20 }, isAlive: true }
    ];
    
    return enemies.filter(e => {
      const dx = e.position.x - pos.x;
      const dz = e.position.z - pos.z;
      const distSq = dx * dx + dz * dz;
      return distSq <= radius * radius;
    });
  })
};

// Access the private active casts array using any to get around TypeScript restriction
// This is for testing purposes only
declare module '../server/combat/skillManager' {
  var activeCastsNew: any[];
  var projectiles: any[];
}

describe('Cast State Machine', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Clear the arrays between tests using the module augmentation above
    // @ts-ignore - Accessing private variables for testing
    const skillManagerModule = require('../server/combat/skillManager');
    skillManagerModule.activeCastsNew = [];
    skillManagerModule.projectiles = [];
    
    // Mock the nanoid function
    vi.mock('nanoid', () => ({
      nanoid: () => 'test-id'
    }));
    
    // Mock date
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 4, 4, 0, 0, 0, 0)); // May 4, 2025
  });
  
  it('should transition from Casting to Traveling state', () => {
    // @ts-ignore - Accessing private variables for testing
    const skillManagerModule = require('../server/combat/skillManager');
    
    // Create a cast in Casting state
    const testCast = {
      castId: 'cast1',
      casterId: 'player1',
      skillId: 'fireball',
      state: CastState.Casting,
      origin: { x: 0, z: 0 },
      targetPos: { x: 10, z: 10 },
      startedAt: Date.now() - 1000, // Started 1 second ago
      castTimeMs: 500 // 500ms cast time
    };
    
    // Add it to the activeCasts array
    skillManagerModule.activeCastsNew.push(testCast);
    
    // Run the tick function
    tickCasts(100, mockServer, mockWorld);
    
    // Check the state has changed to Traveling
    expect(testCast.state).toBe(CastState.Traveling);
    
    // Check that a projectile was created
    expect(skillManagerModule.projectiles.length).toBe(1);
    expect(skillManagerModule.projectiles[0].castId).toBe('cast1');
    
    // Check that a ProjSpawn2 message was emitted
    expect(mockEmit).toHaveBeenCalledWith('msg', expect.objectContaining({
      type: 'ProjSpawn2',
      castId: 'cast1'
    }));
  });
  
  it('should handle direct-impact skills without Traveling state', () => {
    // @ts-ignore - Accessing private variables for testing
    const skillManagerModule = require('../server/combat/skillManager');
    
    // Create a skill definition for a non-projectile skill
    const originalSkills = { ...SKILLS };
    vi.mock('../shared/skillsDefinition', () => ({
      SKILLS: {
        ...originalSkills,
        'instant_heal': {
          name: 'Instant Heal',
          castMs: 500,
          cooldownMs: 5000,
          manaCost: 10,
          range: 0,
          projectile: undefined // No projectile = instant effect
        }
      },
      SkillId: 'string'
    }));
    
    // Create a cast in Casting state for non-projectile skill
    const instantCast = {
      castId: 'cast2',
      casterId: 'player1',
      skillId: 'instant_heal',
      state: CastState.Casting,
      origin: { x: 0, z: 0 },
      startedAt: Date.now() - 1000, // Started 1 second ago
      castTimeMs: 500 // 500ms cast time
    };
    
    // Add it to the activeCasts array
    skillManagerModule.activeCastsNew.push(instantCast);
    
    // Run the tick function
    tickCasts(100, mockServer, mockWorld);
    
    // Check the state has changed directly to Impact (skipping Traveling)
    expect(instantCast.state).toBe(CastState.Impact);
    
    // No projectile should be created
    expect(skillManagerModule.projectiles.length).toBe(0);
    
    // Check that a CastSnapshot message was emitted with Impact state
    expect(mockEmit).toHaveBeenCalledWith('msg', expect.objectContaining({
      type: 'CastSnapshot',
      data: expect.objectContaining({
        castId: 'cast2',
        state: CastState.Impact
      })
    }));
  });
  
  it('should not transition states if cast time is not complete', () => {
    // @ts-ignore - Accessing private variables for testing
    const skillManagerModule = require('../server/combat/skillManager');
    
    // Create a cast that is still in progress
    const inProgressCast = {
      castId: 'cast3',
      casterId: 'player1',
      skillId: 'fireball',
      state: CastState.Casting,
      origin: { x: 0, z: 0 },
      targetPos: { x: 10, z: 10 },
      startedAt: Date.now() - 200, // Started 200ms ago
      castTimeMs: 500 // 500ms cast time - not finished yet
    };
    
    // Add it to the activeCasts array
    skillManagerModule.activeCastsNew.push(inProgressCast);
    
    // Run the tick function
    tickCasts(100, mockServer, mockWorld);
    
    // Check the state has not changed
    expect(inProgressCast.state).toBe(CastState.Casting);
    
    // No projectile should be created
    expect(skillManagerModule.projectiles.length).toBe(0);
    
    // No message should be emitted
    expect(mockEmit).not.toHaveBeenCalled();
  });
});
