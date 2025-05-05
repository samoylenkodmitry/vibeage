'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Mesh, Color } from 'three';
import useProjectileMovement from './useProjectileMovement';
import useParticleSystem, { Particle } from './useParticleSystem';

interface IceBoltVfxProps {
  id?: string;
  origin: {x: number; y: number; z: number};
  dir: {x: number; y: number; z: number};
  speed: number;
  launchTs?: number;
}

// Define as a named function first
export function IceBoltVfx({ 
  id = `icebolt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, 
  origin, 
  dir, 
  speed,
  launchTs = performance.now()
}: IceBoltVfxProps) {
  const coreRef = useRef<Mesh>(null);
  
  // Use the projectile movement hook for consistent positioning
  const { position } = useProjectileMovement({
    origin,
    dir,
    speed,
    launchTs
  });
  
  // Setup particle system for ice mist effects
  const iceParticles = useParticleSystem({
    emitterPosition: () => position,
    emitterShape: 'sphere',
    emitterRadius: 0.2,
    particleLifetime: { min: 0.1, max: 0.3 },
    particleSpeed: { min: 0.3, max: 1 },
    particleSize: { min: 0.03, max: 0.1 },
    particleOpacity: { min: 0.5, max: 0.8 },
    emissionRate: 25,
    maxParticles: 40,
    generateParticle: () => {
      return {
        id: `icemist-${id}-${Math.random().toString(36).substring(2, 9)}`,
        position: new Vector3(
          position.x + (Math.random() - 0.5) * 0.2,
          position.y + (Math.random() - 0.5) * 0.2,
          position.z + (Math.random() - 0.5) * 0.2
        ),
        velocity: new Vector3(
          (Math.random() - 0.5) * 1,
          (Math.random() - 0.5) * 1,
          (Math.random() - 0.5) * 1
        ),
        scale: 0.03 + Math.random() * 0.07,
        opacity: 0.5 + Math.random() * 0.3,
        lifetime: 0,
        maxLifetime: 0.1 + Math.random() * 0.2,
        color: new Color().setHSL(
          0.58 + Math.random() * 0.05, // cyan-blue hue
          0.5 + Math.random() * 0.3,   // saturation
          0.7 + Math.random() * 0.3    // lightness
        ),
      };
    },
    updateParticle: (particle: Particle, deltaTime: number) => {
      if (particle.lifetime + deltaTime > particle.maxLifetime) {
        return null; // Remove particle
      }
      
      // Update particle
      return {
        ...particle,
        opacity: particle.opacity * (1 - (particle.lifetime / particle.maxLifetime)),
        lifetime: particle.lifetime + deltaTime
      };
    }
  });
  
  // Add some rotation to the ice bolt
  useFrame((state) => {
    if (coreRef.current) {
      coreRef.current.rotation.z = state.clock.elapsedTime * 5;
    }
  });
  
  return (
    <group position={[position.x, position.y, position.z]}>
      {/* Main ice bolt */}
      <mesh ref={coreRef} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry key={`icebolt-geo-${id}`} args={[0.25, 1]} />
        <meshBasicMaterial key={`icebolt-mat-${id}`} color="skyblue" transparent opacity={0.8} />
      </mesh>
      
      {/* Render ice mist particles */}
      {iceParticles.particles.map(particle => (
        <mesh
          key={particle.id}
          position={[particle.position.x, particle.position.y, particle.position.z]}
          scale={[particle.scale, particle.scale, particle.scale]}
        >
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial
            color="aliceblue"
            transparent
            opacity={particle.opacity}
          />
        </mesh>
      ))}
    </group>
  );
}

// Also export as default
export default IceBoltVfx;
