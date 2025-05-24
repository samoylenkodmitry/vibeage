'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Mesh } from 'three';
import useParticleSystem, { Particle } from './useParticleSystem';
import { Vector3Pool } from '../utils/ClientObjectPool';

interface PetrifyFlashProps {
  position: {x: number; y: number; z: number};
}

// Export as named export
export function PetrifyFlash({ position }: PetrifyFlashProps) {
  const coreRef = useRef<Mesh>(null);
  const positionVector = useRef(new Vector3(position.x, position.y + 1, position.z));
  
  // Setup particle system for petrify flash
  const glowParticles = useParticleSystem({
    emitterPosition: positionVector.current,
    emitterShape: 'sphere',
    emitterRadius: 0.3,
    particleLifetime: { min: 0.3, max: 0.5 },
    particleSpeed: { min: 0.5, max: 2 },
    particleSize: { min: 0.1, max: 0.3 },
    particleOpacity: { min: 0.6, max: 1.0 },
    emissionRate: 25,
    maxParticles: 30,
    generateParticle: () => {
      // Use pooled vectors for particle creation
      const tempPos = Vector3Pool.acquire();
      const tempVel = Vector3Pool.acquire();
      
      tempPos.set(
        positionVector.current.x + (Math.random() - 0.5) * 0.5,
        positionVector.current.y + (Math.random() - 0.5) * 0.5,
        positionVector.current.z + (Math.random() - 0.5) * 0.5
      );
      
      tempVel.set(
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 3
      );
      
      const particle = {
        id: `petrify-${Math.random().toString(36).substring(2, 9)}`,
        position: new Vector3().copy(tempPos),
        velocity: new Vector3().copy(tempVel),
        scale: 0.1 + Math.random() * 0.2,
        opacity: 0.7 + Math.random() * 0.3,
        lifetime: 0,
        maxLifetime: 0.3 + Math.random() * 0.2,
      };
      
      // Release pooled objects
      Vector3Pool.release(tempPos);
      Vector3Pool.release(tempVel);
      
      return particle;
    },
    updateParticle: (particle: Particle, deltaTime: number) => {
      if (particle.lifetime + deltaTime > particle.maxLifetime) {
        return null; // Remove particle
      }
      
      return {
        ...particle,
        opacity: Math.max(0, (particle.maxLifetime - particle.lifetime) / particle.maxLifetime * 0.8),
        scale: particle.scale * 0.95, // Shrink over time
        lifetime: particle.lifetime + deltaTime
      };
    }
  });
  
  // Emit particles on first render
  useFrame((_, delta) => {
    // Pulse the core flash
    if (coreRef.current) {
      const pulseScale = Math.min(2, coreRef.current.scale.x + 5 * delta);
      coreRef.current.scale.set(pulseScale, pulseScale, pulseScale);
      
      // Get material and update opacity
      const material = coreRef.current.material as any;
      if (material && material.opacity) {
        material.opacity = 1 - pulseScale / 2;
      }
      
      // Reset when fully expanded
      if (pulseScale >= 2) {
        coreRef.current.scale.set(0, 0, 0);
      }
    }
  });
  
  return (
    <group>
      {/* Core flash */}
      <mesh ref={coreRef} position={[positionVector.current.x, positionVector.current.y, positionVector.current.z]}>
        <icosahedronGeometry args={[0.5, 1]} />
        <meshBasicMaterial color="yellow" transparent opacity={1} />
      </mesh>
      
      {/* Glow particles */}
      {glowParticles.particles.map(particle => (
        <mesh
          key={particle.id}
          position={[particle.position.x, particle.position.y, particle.position.z]}
          scale={[particle.scale, particle.scale, particle.scale]}
        >
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial
            color="yellow"
            transparent
            opacity={particle.opacity}
          />
        </mesh>
      ))}
    </group>
  );
}

// Also export as default for consistency
export default PetrifyFlash;
