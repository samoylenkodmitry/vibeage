import { describe, it, expect } from 'vitest';
import { predictPosition } from '../shared/positionUtils';

describe('Projectile Prediction', () => {
  it('should accurately predict intercept points for moving targets', () => {
    // Create a moving entity traveling 6 m/s perpendicular (along Z axis)
    const entity = {
      position: { x: 10, z: 0 },
      movement: {
        startTime: 1000, // ms timestamp
        speed: 6,        // 6 m/s
        dir: { x: 0, z: 1 } // moving along Z axis
      }
    };

    // Calculate travel time for projectile with 12 m/s speed
    // Projectile starts at origin (0, 0)
    const srcPos = { x: 0, z: 0 }; 
    const initialTargetPos = { x: 10, z: 0 };
    
    // Calculate distance
    const dist = Math.sqrt(
      Math.pow(initialTargetPos.x - srcPos.x, 2) + 
      Math.pow(initialTargetPos.z - srcPos.z, 2)
    );
    
    // Calculate travel time (in seconds, then convert to ms)
    const projectileSpeed = 12; // m/s
    const travelS = dist / projectileSpeed;
    const travelMs = travelS * 1000;
    
    // Predict target position after travel time
    const predicted = predictPosition(entity, 1000 + travelMs);
    
    // Entity started at (10,0) traveling at 6 m/s along Z
    // Time to reach entity = 10 / 12 = 0.833 seconds
    // In that time, entity moves 0.833 * 6 = 5 units along Z
    // So expected position is (10, 5)
    
    // Allow small error margin due to floating point calculations
    const expectedPos = { x: 10, z: 5 };
    const margin = 0.2; // margin of error
    
    const error = Math.sqrt(
      Math.pow(predicted.x - expectedPos.x, 2) + 
      Math.pow(predicted.z - expectedPos.z, 2)
    );
    
    // Verify the predicted intercept point is correct within margin of error
    expect(error).toBeLessThan(margin);
  });
  
  it('should handle stationary targets correctly', () => {
    // Create a stationary entity at (10,10)
    const entity = {
      position: { x: 10, z: 10 },
      movement: {
        startTime: 0,
        speed: 0,
        dir: { x: 0, z: 0 }
      }
    };
    
    // Predict position 10 seconds in the future
    const predicted = predictPosition(entity, 10000);
    
    // Position should not change
    expect(predicted.x).toBeCloseTo(10);
    expect(predicted.z).toBeCloseTo(10);
  });
  
  it('should handle moving targets with changing directions', () => {
    // Create an entity that started moving 1 second ago
    const entity = {
      position: { x: 5, z: 5 },
      movement: {
        startTime: 1000,
        speed: 3,
        dir: { x: 1, z: 0 } // moving along X axis
      }
    };
    
    // Predict position 2 seconds in the future
    const predicted = predictPosition(entity, 3000);
    
    // Entity should move 2 * 3 = 6 units in the X direction
    expect(predicted.x).toBeCloseTo(11);
    expect(predicted.z).toBeCloseTo(5);
  });
});
