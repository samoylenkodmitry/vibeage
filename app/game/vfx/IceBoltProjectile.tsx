import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Mesh, Group } from 'three';
import useProjectileMovement from './useProjectileMovement';
import useParticleSystem, { Particle } from './useParticleSystem';
import { Vector3Pool } from '../utils/ClientObjectPool';

interface IceBoltProjectileProps {
  id: string;
  origin: {x: number; y: number; z: number};
  dir: {x: number; y: number; z: number};
  speed: number;
  launchTs?: number;
}

export function IceBoltProjectile({ 
  id = `icebolt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, 
  origin, 
  dir, 
  speed,
  launchTs = performance.now()
}: IceBoltProjectileProps) {
  const coreRef = useRef<Mesh>(null);
  const groupRef = useRef<Group>(null);
  const timeOffset = useRef(Math.random() * Math.PI * 2);
  
  // Use the projectile movement hook for consistent positioning
  const { position } = useProjectileMovement({
    origin,
    dir,
    speed,
    launchTs
  });
  
  // Setup particle system for ice crystal trail
  const iceParticles = useParticleSystem({
    emitterPosition: () => position,
    emitterShape: 'sphere',
    emitterRadius: 0.2,
    particleLifetime: { min: 0.4, max: 0.7 },
    particleSpeed: { min: 0.1, max: 0.5 },
    particleSize: { min: 0.03, max: 0.08 },
    particleOpacity: { min: 0.7, max: 1.0 },
    emissionRate: 15,
    maxParticles: 40,
    generateParticle: () => {
      // Use pooled vectors for particle creation
      const tempPos = Vector3Pool.acquire();
      const tempVel = Vector3Pool.acquire();
      const tempRot = Vector3Pool.acquire();
      const tempRotSpeed = Vector3Pool.acquire();
      
      tempPos.set(
        position.x + (Math.random() - 0.5) * 0.2,
        position.y + (Math.random() - 0.5) * 0.2,
        position.z + (Math.random() - 0.5) * 0.2
      );
      
      tempVel.set(
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5
      );
      
      tempRot.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      
      tempRotSpeed.set(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      );
      
      const particle = {
        id: `ice-${id}-${Math.random().toString(36).substring(2, 9)}`,
        position: new Vector3().copy(tempPos),
        velocity: new Vector3().copy(tempVel),
        scale: 0.03 + Math.random() * 0.08,
        opacity: 0.7 + Math.random() * 0.3,
        lifetime: 0,
        maxLifetime: 0.4 + Math.random() * 0.3,
        rotation: new Vector3().copy(tempRot),
        rotationSpeed: new Vector3().copy(tempRotSpeed)
      };
      
      // Release pooled objects
      Vector3Pool.release(tempPos);
      Vector3Pool.release(tempVel);
      Vector3Pool.release(tempRot);
      Vector3Pool.release(tempRotSpeed);
      
      return particle;
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
      
      // Update particle with fading
      return {
        ...particle,
        rotation: newRotation || rotParticle.rotation,
        opacity: Math.max(0, (particle.maxLifetime - particle.lifetime) / particle.maxLifetime),
        lifetime: particle.lifetime + deltaTime
      };
    }
  });
  
  // Apply animations to the ice projectile core
  useFrame((state, delta) => {
    if (coreRef.current) {
      // Rotate core
      coreRef.current.rotation.x += delta * 2;
      coreRef.current.rotation.z += delta * 3;
      
      // Subtle pulsing
      const pulseFactor = Math.sin(state.clock.elapsedTime * 8 + timeOffset.current) * 0.05 + 1;
      coreRef.current.scale.set(pulseFactor, pulseFactor, pulseFactor);
    }
  });
  
  return (
    <group ref={groupRef} position={[position.x, position.y, position.z]}>
      {/* Main ice core - using an icosahedron for crystalline look */}
      <mesh ref={coreRef}>
        <icosahedronGeometry args={[0.2, 1]} />
        <meshStandardMaterial 
          color="#aad4ff"
          transparent={true}
          opacity={0.7}
          roughness={0.1}
          metalness={0.9}
          emissive="#84b9ff"
          emissiveIntensity={0.5}
        />
      </mesh>
      
      {/* Outer glow */}
      <mesh>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshBasicMaterial 
          color="#c7e0ff"
          transparent={true}
          opacity={0.3}
        />
      </mesh>
      
      {/* Ice particles - using boxGeometry for crystal-like shards */}
      {iceParticles.particles.map(particle => {
        const rotParticle = particle as Particle & { rotation?: Vector3 };
        const rotation = rotParticle.rotation;
        
        return (
          <mesh
            key={particle.id}
            position={[particle.position.x, particle.position.y, particle.position.z]}
            rotation={rotation ? [rotation.x, rotation.y, rotation.z] : [0, 0, 0]}
            scale={[particle.scale, particle.scale, particle.scale]}
          >
            <boxGeometry args={[0.1, 0.1, 0.1]} />
            <meshStandardMaterial 
              color="#d1e6ff"
              transparent={true}
              opacity={particle.opacity}
              roughness={0.1}
              metalness={0.8}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// Make sure to export both as named and default export for compatibility
export default IceBoltProjectile;
