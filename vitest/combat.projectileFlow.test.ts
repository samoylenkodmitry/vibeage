import { describe, it, expect, vi, beforeEach} from 'vitest';
import { useProjectileStoreLegacy } from '../app/game/systems/projectileManager';
import { ProjSpawn2, ProjHit2 } from '../shared/messages';

describe('Enhanced Projectile Protocol', () => {
  beforeEach(() => {
    // Reset the store before each test
    useProjectileStoreLegacy.setState({ 
      enhanced: {} 
    });
    
    // Clear any mocks
    vi.clearAllMocks();
  });

  it('should add an enhanced projectile to the store when ProjSpawn2 is received', () => {
    // Create a sample ProjSpawn2 message
    const projSpawn2: ProjSpawn2 = {
      type: 'ProjSpawn2',
      castId: 'test-proj-1',
      origin: { x: 10, y: 1.5, z: 10 },
      dir: { x: 1, z: 0 },
      speed: 5,
      launchTs: Date.now(),
      hitRadius: 0.5,
      casterId: 'player-1',
      skillId: 'fireball'
    };

    // Call the addEnhancedProjectile method directly
    useProjectileStoreLegacy.getState().addEnhancedProjectile(projSpawn2);

    // Get the state and verify the projectile was added
    const state = useProjectileStoreLegacy.getState();
    
    // The projectile should exist in the enhanced map with the correct ID
    expect(state.enhanced[projSpawn2.castId]).toBeDefined();
    
    // Verify the projectile has the correct properties
    const storedProj = state.enhanced[projSpawn2.castId];
    expect(storedProj.projId).toBe(projSpawn2.castId);
    expect(storedProj.startPos).toEqual(projSpawn2.origin);
    expect(storedProj.dirXZ).toEqual(projSpawn2.dir);
    expect(storedProj.speed).toBe(projSpawn2.speed);
    expect(storedProj.launchTs).toBe(projSpawn2.launchTs);
    expect(storedProj.hitRadius).toBe(projSpawn2.hitRadius);
    expect(storedProj.casterId).toBe(projSpawn2.casterId);
    expect(storedProj.skillId).toBe(projSpawn2.skillId);
    expect(storedProj.state).toBe('active');
    expect(storedProj.opacity).toBe(1.0);
  });

  it('should handle a projectile hit when ProjHit2 is received', () => {
    // First add a projectile to the store
    const projSpawn2: ProjSpawn2 = {
      type: 'ProjSpawn2',
      castId: 'test-proj-2',
      origin: { x: 10, y: 1.5, z: 10 },
      dir: { x: 1, z: 0 },
      speed: 5,
      launchTs: Date.now(),
      hitRadius: 0.5,
      casterId: 'player-1',
      skillId: 'fireball'
    };
    
    // Add the projectile to the store
    useProjectileStoreLegacy.getState().addEnhancedProjectile(projSpawn2);
    
    // Create a ProjHit2 message for the same projectile
    const projHit2: ProjHit2 = {
      type: 'ProjHit2',
      castId: 'test-proj-2',
      hitIds: ['enemy-1'],
      dmg: [10],
      impactPos: { x: 15, z: 10 }
    };
    
    // Call the handleEnhancedHit method
    useProjectileStoreLegacy.getState().handleEnhancedHit(projHit2);
    
    // Get the state and verify the projectile was updated
    const state = useProjectileStoreLegacy.getState();
    
    // The projectile should still exist
    expect(state.enhanced[projHit2.castId]).toBeDefined();
    
    // The projectile should be marked as hit
    const storedProj = state.enhanced[projHit2.castId];
    expect(storedProj.state).toBe('hit');
    
    // The projectile should have a fadeOutStartTs
    expect(storedProj.fadeOutStartTs).toBeDefined();
  });

  it('should remove the projectile after fade-out completes', () => {
    // Mock Date.now to control time
    const now = Date.now();
    const dateNowSpy = vi.spyOn(Date, 'now');
    dateNowSpy.mockReturnValue(now);
    
    // First add a projectile to the store
    const projSpawn2: ProjSpawn2 = {
      type: 'ProjSpawn2',
      castId: 'test-proj-3',
      origin: { x: 10, y: 1.5, z: 10 },
      dir: { x: 1, z: 0 },
      speed: 5,
      launchTs: now,
      hitRadius: 0.5,
      casterId: 'player-1',
      skillId: 'fireball'
    };
    
    // Add the projectile
    useProjectileStoreLegacy.getState().addEnhancedProjectile(projSpawn2);
    
    // Hit the projectile
    const projHit2: ProjHit2 = {
      type: 'ProjHit2',
      castId: 'test-proj-3',
      hitIds: ['enemy-1'],
      dmg: [10]
    };
    
    useProjectileStoreLegacy.getState().handleEnhancedHit(projHit2);
    
    // Advance time to just before fade-out completes (using 500ms from the manager)
    dateNowSpy.mockReturnValue(now + 499);
    
    // Update opacity (normally done by animation frame)
    useProjectileStoreLegacy.getState().updateOpacity();
    
    // The projectile should still exist but with reduced opacity
    let state = useProjectileStoreLegacy.getState();
    expect(state.enhanced[projHit2.castId]).toBeDefined();
    expect(state.enhanced[projHit2.castId].opacity).toBeLessThan(1.0);
    
    // Advance time past the fade-out duration
    dateNowSpy.mockReturnValue(now + 501);
    
    // Update opacity again
    useProjectileStoreLegacy.getState().updateOpacity();
    
    // The projectile should be removed
    state = useProjectileStoreLegacy.getState();
    expect(state.enhanced[projHit2.castId]).toBeUndefined();
    
    // Restore Date.now
    dateNowSpy.mockRestore();
  });
});
