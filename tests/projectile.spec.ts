import { describe, test, expect, beforeEach, vi } from 'vitest';
import { useProjectileStore } from '../app/game/systems/projectileStore';
import { CastState } from '../shared/types';
import { SkillId } from '../shared/skillsDefinition';

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
      const castSnapshot = {
        castId: `proj-${i}`,
        casterId: `player-1`,
        skillId: 'fireball' as SkillId,
        state: CastState.Traveling,
        origin: { x: 0, z: 0 },
        pos: { x: 0, z: 0 },
        dir: { x: 1, z: 0 },
        startedAt: Date.now(),
        castTimeMs: 1000,
        progressMs: 0
      };
      
      useProjectileStore.getState().add(castSnapshot);
    }
    
    // Check that we have 50 projectiles in the store
    expect(Object.keys(useProjectileStore.getState().live).length).toBe(50);
    
    // Mark each projectile as hit
    for (let i = 0; i < 50; i++) {
      useProjectileStore.getState().markProjectileAsHit(`proj-${i}`);
    }
    
    // Check that all projectiles are removed from live and moved to toRecycle
    expect(Object.keys(useProjectileStore.getState().live).length).toBe(0);
    expect(Object.keys(useProjectileStore.getState().toRecycle).length).toBe(50);
  });

  test('should maintain projectile data integrity', () => {
    // Add a projectile with all required fields
    const castSnapshot = {
      castId: 'test-projectile',
      casterId: 'player-1',
      skillId: 'iceBolt' as SkillId,
      state: CastState.Traveling,
      origin: { x: 10, z: 20 },
      pos: { x: 10, z: 20 },
      dir: { x: 0.707, z: 0.707 }, // Normalized vector (45 degrees)
      startedAt: 1620000000000,
      castTimeMs: 1000,
      progressMs: 0
    };
    
    useProjectileStore.getState().add(castSnapshot);
    
    // Check the projectile in the store
    const storedProj = useProjectileStore.getState().live['test-projectile'];
    expect(storedProj).toBeDefined();
    expect(storedProj.origin.x).toBe(10);
    expect(storedProj.origin.z).toBe(20);
    expect(storedProj.pos.x).toBe(10);
    expect(storedProj.pos.z).toBe(20);
    expect(storedProj.velocity?.x).toBeCloseTo(0.707, 2);
    expect(storedProj.velocity?.z).toBeCloseTo(0.707, 2);
    expect(storedProj.skillId).toBe('iceBolt');
  });
});
