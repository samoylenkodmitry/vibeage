'use client';

import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Mesh, Color, MeshBasicMaterial, Group } from 'three';
import useProjectileMovement from './useProjectileMovement';
import useParticleSystem, { Particle } from './useParticleSystem';
import { Vector3Pool, ColorPool, ConeMeshPool } from '../utils/ClientObjectPool';

interface IceBoltVfxProps {
  id?: string;
  origin: {x: number; y: number; z: number};
  dir: {x: number; y: number; z: number};
  speed: number;
  launchTs?: number;
  pooled?: Group; // Add pooled group prop
  onDone?: () => void; // Add callback for when projectile is done
}

// Define as a named function first
export function IceBoltVfx({ 
  id = `icebolt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, 
  origin, 
  dir, 
  speed,
  launchTs = performance.now(),
  pooled, // Use the pooled group passed from VfxManager
  onDone
}: IceBoltVfxProps) {
  const coreRef = useRef<Mesh>(null);
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
    
    // Create core mesh - rotating cone for ice bolt
    const coreMesh = ConeMeshPool.acquire();
    
    // Set material properties
    if (coreMesh.material instanceof MeshBasicMaterial) {
      coreMesh.material.color.set("skyblue");
      coreMesh.material.transparent = true;
      coreMesh.material.opacity = 0.8;
    }
    
    // Set initial rotation
    coreMesh.rotation.set(0, 0, Math.PI / 2);
    
    // Add meshes to the pooled group
    pooled.add(coreMesh);
    
    // Store references
    coreRef.current = coreMesh;
    
    return () => {
      // Release pooled mesh
      if (coreRef.current) {
        ConeMeshPool.release(coreRef.current);
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
      // Additional cleanup - release pooled mesh if not already done
      if (isActive.current && coreRef.current) {
        ConeMeshPool.release(coreRef.current);
      }
      
      if (isActive.current && onDone) {
        isActive.current = false;
        onDone();
      }
    };
  }, [onDone]);
  
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
      // Use pooled vectors for particle creation
      const tempPos = Vector3Pool.acquire();
      const tempVel = Vector3Pool.acquire();
      const tempColor = ColorPool.acquire();
      
      tempPos.set(
        position.x + (Math.random() - 0.5) * 0.2,
        position.y + (Math.random() - 0.5) * 0.2,
        position.z + (Math.random() - 0.5) * 0.2
      );
      
      tempVel.set(
        (Math.random() - 0.5) * 1,
        (Math.random() - 0.5) * 1,
        (Math.random() - 0.5) * 1
      );
      
      tempColor.setHSL(
        0.58 + Math.random() * 0.05, // cyan-blue hue
        0.5 + Math.random() * 0.3,   // saturation
        0.7 + Math.random() * 0.3    // lightness
      );
      
      const particle = {
        id: `icemist-${id}-${Math.random().toString(36).substring(2, 9)}`,
        position: new Vector3().copy(tempPos),
        velocity: new Vector3().copy(tempVel),
        scale: 0.03 + Math.random() * 0.07,
        opacity: 0.5 + Math.random() * 0.3,
        lifetime: 0,
        maxLifetime: 0.1 + Math.random() * 0.2,
        color: new Color().copy(tempColor),
      };
      
      // Release pooled objects
      Vector3Pool.release(tempPos);
      Vector3Pool.release(tempVel);
      ColorPool.release(tempColor);
      
      return particle;
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
  
  // Add some rotation to the ice bolt and update pooled group
  useFrame((state) => {
    if (coreRef.current) {
      coreRef.current.rotation.z = state.clock.elapsedTime * 5;
    }
    
    // Update pooled group position
    if (pooled) {
      pooled.position.set(position.x, position.y, position.z);
      pooled.visible = true;
    }
  });
  
  // If we're using pooled objects, return the primitive
  if (pooled) {
    return <primitive object={pooled} />;
  }
  
  // Legacy rendering path for non-pooled usage
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
