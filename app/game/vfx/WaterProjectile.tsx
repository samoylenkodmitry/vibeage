import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Mesh, Color, Group, MeshStandardMaterial } from 'three';
import useProjectileMovement from './useProjectileMovement';
import useParticleSystem, { Particle } from './useParticleSystem';
import { 
  Vector3Pool, 
  ColorPool, 
  SphereMeshPool 
} from '../utils/ClientObjectPool';

interface WaterProjectileProps {
  id?: string;
  origin: {x: number; y: number; z: number};
  dir: {x: number; y: number; z: number};
  speed: number;
  launchTs?: number;
  pooled?: Group; // Add pooled group prop
  onDone?: () => void; // Add callback for when projectile is done
}

export default function WaterProjectile({ 
  id = `water-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, 
  origin, 
  dir, 
  speed, 
  launchTs = performance.now(),
  pooled, // Use the pooled group passed from VfxManager
  onDone
}: WaterProjectileProps) {
  const mainRef = useRef<Mesh>(null);
  const groupRef = useRef<Group>(null);
  const timeOffset = useRef(Math.random() * Math.PI * 2);
  const isActive = useRef(true);
  
  // Use the projectile movement hook for consistent positioning
  const { position } = useProjectileMovement({
    origin,
    dir,
    speed,
    launchTs
  });
  
  // Initialize pooled group on first mount if provided
  useEffect(() => {
    if (!pooled) return;
    
    // Clear any existing children if this is a reused group
    while (pooled.children.length > 0) {
      pooled.remove(pooled.children[0]);
    }
    
    // Create main water ball using pooled mesh
    const mainMesh = SphereMeshPool.acquire();
    if (mainMesh.material instanceof MeshStandardMaterial) {
      mainMesh.material.color.setStyle("#57c1eb");
      mainMesh.material.transparent = true;
      mainMesh.material.opacity = 0.7;
      mainMesh.material.roughness = 0.2;
      mainMesh.material.metalness = 0.7;
    }
    mainMesh.scale.set(0.4, 0.4, 0.4);
    
    // Add meshes to the pooled group
    pooled.add(mainMesh);
    
    // Store references
    mainRef.current = mainMesh;
    
    return () => {
      // Release pooled mesh back to pool
      if (mainMesh) {
        SphereMeshPool.release(mainMesh);
      }
      
      // Clear the group after releasing meshes
      if (pooled) {
        while (pooled.children.length > 0) {
          pooled.remove(pooled.children[0]);
        }
      }
      
      if (isActive.current && onDone) {
        isActive.current = false;
        onDone();
      }
    };
  }, [pooled, onDone]);
  
  // Handle cleanup when projectile is done
  useEffect(() => {
    return () => {
      if (isActive.current && onDone) {
        isActive.current = false;
        onDone();
      }
    };
  }, [onDone]);
  
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
      
      // Use pooled Vector3 objects for position, velocity, rotation
      const particlePos = Vector3Pool.acquire();
      const velocity = Vector3Pool.acquire();
      const rotation = Vector3Pool.acquire();
      const rotationSpeed = Vector3Pool.acquire();
      const color = ColorPool.acquire();
      
      particlePos.set(
        position.x + Math.cos(angle) * distance,
        position.y + Math.sin(angle) * distance + 0.1,
        position.z + Math.sin(angle) * distance
      );
      
      velocity.set(
        (Math.random() - 0.5) * 1.5,
        Math.random() * 1.5,
        (Math.random() - 0.5) * 1.5
      );
      
      rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      
      rotationSpeed.set(
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 3
      );
      
      color.setHex(0x57c1eb);
      
      const particle = {
        id: `droplet-${id}-${Math.random().toString(36).substring(2, 9)}`,
        position: new Vector3().copy(particlePos),
        velocity: new Vector3().copy(velocity),
        scale: 0.05 + Math.random() * 0.1,
        opacity: 0.7 + Math.random() * 0.3,
        lifetime: 0,
        maxLifetime: 0.3 + Math.random() * 0.2,
        color: new Color().copy(color),
        rotation: new Vector3().copy(rotation),
        rotationSpeed: new Vector3().copy(rotationSpeed)
      };
      
      // Release pooled objects back to their pools
      Vector3Pool.release(particlePos);
      Vector3Pool.release(velocity);
      Vector3Pool.release(rotation);
      Vector3Pool.release(rotationSpeed);
      ColorPool.release(color);
      
      return particle;
    },
    updateParticle: (particle: Particle, deltaTime: number) => {
      if (particle.lifetime + deltaTime > particle.maxLifetime) {
        return null; // Remove particle
      }
      
      // Update rotation if available
      const rotParticle = particle as Particle & { rotation?: Vector3, rotationSpeed?: Vector3 };
      
      // Use pooled Vector3 for rotation calculation
      const newRotation = rotParticle.rotation && rotParticle.rotationSpeed ? 
        Vector3Pool.acquire().copy(rotParticle.rotation).addScaledVector(rotParticle.rotationSpeed, deltaTime) : 
        undefined;
      
      // Update particle
      const updatedParticle = {
        ...particle,
        rotation: newRotation || rotParticle.rotation,
        opacity: Math.max(0, (particle.maxLifetime - particle.lifetime) / particle.maxLifetime), // fade out
        lifetime: particle.lifetime + deltaTime
      };
      
      // Release the pooled rotation vector if we created one
      if (newRotation && rotParticle.rotation && rotParticle.rotationSpeed) {
        // Copy the new rotation back to the particle's rotation object
        rotParticle.rotation.copy(newRotation);
        Vector3Pool.release(newRotation);
        updatedParticle.rotation = rotParticle.rotation;
      }
      
      return updatedParticle;
    }
  });
  
  // Apply water-like wobble effect and update pooled position
  useFrame((state) => {
    if (!mainRef.current) return;
    
    // Update pooled group position
    if (pooled) {
      pooled.position.set(position.x, position.y, position.z);
      pooled.visible = true;
    }
    
    // Water-like wobble effect
    const wobbleFactor = Math.sin(state.clock.elapsedTime * 12 + timeOffset.current) * 0.2 + 0.8;
    mainRef.current.scale.set(wobbleFactor, 1, wobbleFactor);
    
    // Random movement for more natural water motion
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 10) * 0.1;
      groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 4) * 0.05;
    }
  });

  // If we're using pooled objects, return the primitive
  if (pooled) {
    return <primitive object={pooled} />;
  }
  
  // Legacy rendering path for non-pooled usage
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
