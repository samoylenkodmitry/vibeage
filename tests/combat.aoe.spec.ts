// filepath: /home/s/develop/projects/vibe/1/tests/combat.aoe.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Server } from 'socket.io';
import { tickProjectiles } from '../server/combat/skillManager';

// Mock socket.io server
const mockEmit = vi.fn();
const mockServer = {
  emit: mockEmit
} as unknown as Server;

// Access the private projectiles array for testing
declare module '../server/combat/skillManager' {
  var activeCastsNew: any[];
  var projectiles: any[];
}

describe('AOE Projectile Collision', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Clear the arrays between tests
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
    
    // Mock SKILLS
    vi.mock('../shared/skillsDefinition', () => ({
      SKILLS: {
        'fireball': {
          name: 'Fireball',
          castMs: 500,
          cooldownMs: 5000,
          manaCost: 20,
          dmg: 25,
          range: 15,
          projectile: {
            speed: 10,
            hitRadius: 3 // 3 unit AOE radius
          }
        }
      },
      SkillId: 'string'
    }));
  });
  
  it('should detect entities in the AOE radius', () => {
    // Create enemies for the test
    const enemies = [
      { id: 'enemy1', position: { x: 5, y: 0, z: 5 }, isAlive: true },
      { id: 'enemy2', position: { x: 7, y: 0, z: 7 }, isAlive: true },
      { id: 'enemy3', position: { x: 15, y: 0, z: 15 }, isAlive: true }
    ];
    
    // Mock world with entities in range
    const mockWorld = {
      getEnemyById: vi.fn(),
      getPlayerById: vi.fn(),
      getEntitiesInCircle: vi.fn((pos: {x: number, z: number}, radius: number) => {
        // Return enemies within the radius
        return enemies.filter(e => {
          const dx = e.position.x - pos.x;
          const dz = e.position.z - pos.z;
          const distSq = dx * dx + dz * dz;
          return distSq <= radius * radius;
        });
      })
    };
    
    // @ts-ignore - Accessing private variables for testing
    const skillManagerModule = require('../server/combat/skillManager');
    
    // Add a cast in Traveling state
    const testCast = {
      castId: 'cast1',
      casterId: 'player1',
      skillId: 'fireball',
      state: 1, // Traveling
      origin: { x: 0, z: 0 },
      targetPos: { x: 10, z: 10 },
      startedAt: Date.now() - 1500, // Started 1.5 seconds ago
      castTimeMs: 500 // 500ms cast time
    };
    skillManagerModule.activeCastsNew.push(testCast);
    
    // Add a projectile
    const testProjectile = {
      castId: 'cast1',
      pos: { x: 5, z: 5 }, // Position directly on top of enemy1
      dir: { x: 0.7071, z: 0.7071 }, // Normalized direction to the target
      speed: 10,
      distanceTraveled: 7.1, // √(5² + 5²) = 7.07 units traveled
      maxRange: 15,
      startTime: Date.now() - 1000,
      skillId: 'fireball'
    };
    skillManagerModule.projectiles.push(testProjectile);
    
    // Run the tick function
    tickProjectiles(100, mockServer, mockWorld);
    
    // Check that the AOE hit was detected
    expect(mockWorld.getEntitiesInCircle).toHaveBeenCalledWith(
      { x: 5, z: 5 }, // Projectile position
      3 // AOE radius
    );
    
    // Check that a ProjHit2 message was emitted with the hit enemies
    expect(mockEmit).toHaveBeenCalledWith('msg', expect.objectContaining({
      type: 'ProjHit2',
      castId: 'cast1',
      hitIds: expect.arrayContaining(['enemy1', 'enemy2']), // Both enemies are within the 3 unit radius
      dmg: expect.any(Array),
      impactPos: { x: 5, z: 5 } // Impact position is included
    }));
    
    // Verify the cast state changed to Impact
    expect(testCast.state).toBe(2); // Impact state
    
    // Check that the projectile was removed
    expect(skillManagerModule.projectiles.length).toBe(0);
  });
  
  it('should detonate projectile at max range with empty hit list', () => {
    // Mock world with no entities in range
    const mockWorld = {
      getEnemyById: vi.fn(),
      getPlayerById: vi.fn(),
      getEntitiesInCircle: vi.fn(() => []) // No entities in range
    };
    
    // @ts-ignore - Accessing private variables for testing
    const skillManagerModule = require('../server/combat/skillManager');
    
    // Add a cast in Traveling state
    const testCast = {
      castId: 'cast2',
      casterId: 'player1',
      skillId: 'fireball',
      state: 1, // Traveling
      origin: { x: 0, z: 0 },
      targetPos: { x: 20, z: 0 },
      startedAt: Date.now() - 1500,
      castTimeMs: 500
    };
    skillManagerModule.activeCastsNew.push(testCast);
    
    // Add a projectile at max range
    const testProjectile = {
      castId: 'cast2',
      pos: { x: 15, z: 0 },
      dir: { x: 1, z: 0 },
      speed: 10,
      distanceTraveled: 15, // At max range
      maxRange: 15,
      startTime: Date.now() - 1000,
      skillId: 'fireball'
    };
    skillManagerModule.projectiles.push(testProjectile);
    
    // Run the tick function
    tickProjectiles(100, mockServer, mockWorld);
    
    // Check that a ProjHit2 message was emitted with empty hit list
    expect(mockEmit).toHaveBeenCalledWith('msg', expect.objectContaining({
      type: 'ProjHit2',
      castId: 'cast2',
      hitIds: [], // No enemies hit
      dmg: [],
      impactPos: expect.any(Object) // Impact position is included
    }));
    
    // Verify the cast state changed to Impact
    expect(testCast.state).toBe(2); // Impact state
    
    // Check that the projectile was removed
    expect(skillManagerModule.projectiles.length).toBe(0);
  });
  
  it('should move projectiles based on deltaTime and direction', () => {
    // Mock world with no entities
    const mockWorld = {
      getEnemyById: vi.fn(),
      getPlayerById: vi.fn(),
      getEntitiesInCircle: vi.fn(() => [])
    };
    
    // @ts-ignore - Accessing private variables for testing
    const skillManagerModule = require('../server/combat/skillManager');
    
    // Add a projectile
    const testProjectile = {
      castId: 'cast3',
      pos: { x: 0, z: 0 },
      dir: { x: 1, z: 0 }, // Moving along the x-axis
      speed: 10, // 10 units per second
      distanceTraveled: 0,
      maxRange: 15,
      startTime: Date.now(),
      skillId: 'fireball'
    };
    skillManagerModule.projectiles.push(testProjectile);
    
    // Run the tick function with 100ms delta time
    tickProjectiles(100, mockServer, mockWorld);
    
    // Calculate expected movement: speed * deltaTime(sec) = 10 * 0.1 = 1 unit
    // Check the projectile moved correctly
    expect(testProjectile.pos.x).toBeCloseTo(1);
    expect(testProjectile.pos.z).toBeCloseTo(0);
    expect(testProjectile.distanceTraveled).toBeCloseTo(1);
    
    // Run another tick
    tickProjectiles(100, mockServer, mockWorld);
    
    // Check it moved again
    expect(testProjectile.pos.x).toBeCloseTo(2);
    expect(testProjectile.pos.z).toBeCloseTo(0);
    expect(testProjectile.distanceTraveled).toBeCloseTo(2);
  });
});
