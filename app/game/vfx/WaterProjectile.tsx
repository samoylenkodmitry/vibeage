import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Mesh, Color, Group } from 'three';
import useProjectileMovement from './useProjectileMovement';
import useParticleSystem, { Particle } from './useParticleSystem';

interface WaterProjectileProps {
  id: string;
  origin: {x: number; y: number; z: number};
  dir: {x: number; y: number; z: number};
  speed: number;
  launchTs?: number;
}

export default function WaterProjectile({ 
  id = `water-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, 
  origin, 
  dir, 
  speed, 
  launchTs = performance.now()
}: WaterProjectileProps) {
  const mainRef = useRef<Mesh>(null);
  const groupRef = useRef<Group>(null);
  const timeOffset = useRef(Math.random() * Math.PI * 2);
  
  // Use the projectile movement hook for consistent positioning
  const { position } = useProjectileMovement({
    origin,
    dir,
    speed,
    launchTs
  });
  
  // Log initial values
  useEffect(() => {
    console.log(`[Water ${id}] Created with:`, {
      origin: `(${origin.x.toFixed(2)}, ${origin.y.toFixed(2)}, ${origin.z.toFixed(2)})`,
      dir: `(${dir.x.toFixed(2)}, ${dir.y.toFixed(2)}, ${dir.z.toFixed(2)})`, 
      speed,
      launchTs
    });
  }, [id, origin, dir, speed, launchTs]);
  
  // Add debug logging for position updates
  useEffect(() => {
    console.log(`[Water ${id}] Position updated: (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`);
  }, [id, position]);
  
  // Setup particle system for water droplet effects
  const dropletParticles = useParticleSystem({
    emitterPosition: () => position,
    emitterShape: 'sphere',
    emitterRadius: 0.3,
    particleLifetime: { min: 0.3, max: 0.5 },
    particleSpeed: { min: 0.5, max: 2 },
    particleSize: { min: 0.05, max: 0.15 },
    particleOpacity: { min: 0.7, max: 1.0 },
    emissionRate: 15,
    maxParticles: 30,
    gravity: new Vector3(0, -9.8, 0),
    generateParticle: () => {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * 0.3;
      
      return {
        id: `droplet-${id}-${Math.random().toString(36).substring(2, 9)}`,
        position: new Vector3(
          position.x + Math.cos(angle) * distance,
          position.y + Math.sin(angle) * distance + 0.1,
          position.z + Math.sin(angle) * distance
        ),
        velocity: new Vector3(
          (Math.random() - 0.5) * 1.5,
          Math.random() * 1.5,
          (Math.random() - 0.5) * 1.5
        ),
        scale: 0.05 + Math.random() * 0.1,
        opacity: 0.7 + Math.random() * 0.3,
        lifetime: 0,
        maxLifetime: 0.3 + Math.random() * 0.2,
        color: new Color(0x57c1eb),
        rotation: new Vector3(
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2
        ),
        rotationSpeed: new Vector3(
          (Math.random() - 0.5) * 3,
          (Math.random() - 0.5) * 3,
          (Math.random() - 0.5) * 3
        )
      };
    },
    updateParticle: (particle: Particle, deltaTime: number) => {
      if (particle.lifetime + deltaTime > particle.maxLifetime) {
        return null; // Remove particle
      }
      
      // Update rotation if available
      const rotParticle = particle as Particle & { rotation?: Vector3, rotationSpeed?: Vector3 };
      const newRotation = rotParticle.rotation && rotParticle.rotationSpeed ? new Vector3(
        rotParticle.rotation.x + rotParticle.rotationSpeed.x * deltaTime,
        rotParticle.rotation.y + rotParticle.rotationSpeed.y * deltaTime,
        rotParticle.rotation.z + rotParticle.rotationSpeed.z * deltaTime
      ) : undefined;
      
      // Update particle
      return {
        ...particle,
        rotation: newRotation || rotParticle.rotation,
        opacity: Math.max(0, (particle.maxLifetime - particle.lifetime) / particle.maxLifetime), // fade out
        lifetime: particle.lifetime + deltaTime
      };
    }  });
  
  // Apply water-like wobble effect
  useFrame((state, delta) => {
    if (!mainRef.current) return;
    
    // Water-like wobble effect
    const wobbleFactor = Math.sin(state.clock.elapsedTime * 12 + timeOffset.current) * 0.2 + 0.8;
    mainRef.current.scale.set(wobbleFactor, 1, wobbleFactor);
    
    // Random movement for more natural water motion
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 10) * 0.1;
      groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 4) * 0.05;
    }
  });
  
  return (
    <group 
      ref={groupRef} 
      position={[position.x, position.y, position.z]} 
    >
      {/* Main water ball */}
      <mesh key={`core-${id}`} ref={mainRef}>
        <sphereGeometry key={`core-geo-${id}`} args={[0.4, 16, 16]} />
        <meshStandardMaterial 
          key={`core-mat-${id}`}
          color="#57c1eb"
          transparent={true}
          opacity={0.7}
          roughness={0.2}
          metalness={0.7}
        />
      </mesh>
      
      {/* Render water droplet particles */}
      {dropletParticles.particles.map(particle => {
        const rotParticle = particle as Particle & { rotation?: Vector3 };
        const rotation = rotParticle.rotation;
        
        return (
          <mesh
            key={particle.id}
            position={[particle.position.x, particle.position.y, particle.position.z]}
            rotation={rotation ? [rotation.x, rotation.y, rotation.z] : [0, 0, 0]}
            scale={[particle.scale, particle.scale, particle.scale]}
          >
            <icosahedronGeometry args={[1, 0]} />
            <meshStandardMaterial
              color="#57c1eb"
              transparent
              opacity={particle.opacity}
              roughness={0.2}
              metalness={0.7}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// Maintain compatibility with both default and named exports
export { WaterProjectile };
