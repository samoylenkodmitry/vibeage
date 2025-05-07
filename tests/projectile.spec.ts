import { describe, test, expect, beforeEach, vi } from 'vitest';
import { useProjectileStore } from '../app/game/systems/projectileStore';
import { ProjSpawn2, ProjHit2 } from '../shared/messages';

// Mock the uuid for consistent testing
vi.mock('crypto', () => ({
  randomUUID: () => 'mock-uuid-123'
}));

describe('Projectile Contract Hardening', () => {
  // Reset the store before each test
  beforeEach(() => {
    useProjectileStore.setState({ live: {} });
  });

  test('should correctly add and remove projectiles', () => {
    // Create 50 projectiles
    for (let i = 0; i < 50; i++) {
      const proj: ProjSpawn2 = {
        type: 'ProjSpawn2',
        castId: `proj-${i}`,
        origin: { x: 0, y: 1.5, z: 0 },
        dir: { x: 1, z: 0 },
        speed: 30,
        launchTs: Date.now(),
        skillId: 'fireball'
      };
      
      useProjectileStore.getState().add(proj);
    }
    
    // Check that we have 50 projectiles in the store
    expect(Object.keys(useProjectileStore.getState().live).length).toBe(50);
    
    // Emit corresponding hit events
    for (let i = 0; i < 50; i++) {
      const hit: ProjHit2 = {
        type: 'ProjHit2',
        castId: `proj-${i}`,
        hitIds: [],
        dmg: []
      };
      
      useProjectileStore.getState().hit(hit);
    }
    
    // Check that all projectiles are removed
    expect(Object.keys(useProjectileStore.getState().live).length).toBe(0);
  });

  test('should maintain projectile data integrity', () => {
    // Add a projectile with all required fields
    const proj: ProjSpawn2 = {
      type: 'ProjSpawn2',
      castId: 'test-projectile',
      origin: { x: 10, y: 1.5, z: 20 },
      dir: { x: 0.707, z: 0.707 }, // Normalized vector (45 degrees)
      speed: 25,
      launchTs: 1620000000000,
      skillId: 'iceBolt'
    };
    
    useProjectileStore.getState().add(proj);
    
    // Check the projectile in the store
    const storedProj = useProjectileStore.getState().live['test-projectile'];
    expect(storedProj).toBeDefined();
    expect(storedProj.origin.x).toBe(10);
    expect(storedProj.origin.y).toBe(1.5);
    expect(storedProj.origin.z).toBe(20);
    expect(storedProj.dir.x).toBeCloseTo(0.707, 2);
    expect(storedProj.dir.z).toBeCloseTo(0.707, 2);
    expect(storedProj.speed).toBe(25);
    expect(storedProj.launchTs).toBe(1620000000000);
    expect(storedProj.skillId).toBe('iceBolt');
  });
});
