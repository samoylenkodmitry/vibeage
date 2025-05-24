import { useRef, useEffect, useMemo } from 'react';
import { Vector3, Mesh, Color, Group, MeshBasicMaterial } from 'three';
import useParticleSystem, { Particle } from './useParticleSystem';
import { useProjectileSystem } from '../systems/ProjectileSystem';
import { 
  Vector3Pool, 
  ColorPool, 
  BasicSphereMeshPool 
} from '../utils/ClientObjectPool';

interface FireballProjectileProps {
  id?: string;
  origin: {x: number; y: number; z: number};
  pos: {x: number; z: number};
  pooled?: Group;
  onDone?: () => void;
}

export default function FireballProjectile({ 
  id = `fireball-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, 
  origin, 
  pos,
  pooled,
  onDone
}: FireballProjectileProps) {
  const coreRef = useRef<Mesh>(null);
  const timeOffset = useRef(Math.random() * Math.PI * 2);

  // Use pooled Vector3 for position calculations
  const currentVisualPosition = useMemo(() => {
    const pooledPos = Vector3Pool.acquire();
    pooledPos.set(pos.x, origin.y, pos.z);
    
    // Return a copy since we need to release the pooled vector
    const result = new Vector3().copy(pooledPos);
    Vector3Pool.release(pooledPos);
    return result;
  }, [pos, origin.y]);
  
  useEffect(() => {
    // This effect handles the setup and cleanup of the pooled Three.js group.
    console.log(`[FireballProjectile] Mount/Setup Effect for ID: ${id}. Pooled Group: ${pooled ? 'Exists' : 'Missing'}`);
    const currentPooledGroup = pooled; // Capture for use in cleanup
    
    if (currentPooledGroup) {
      // Clear any existing children if this is a reused group
      while (currentPooledGroup.children.length > 0) {
        currentPooledGroup.remove(currentPooledGroup.children[0]);
      }
      
      // Create core mesh using pooled geometry and material
      const coreMesh = BasicSphereMeshPool.acquire();
      if (coreMesh.material instanceof MeshBasicMaterial) {
        coreMesh.material.color.setHex(0xff5500);
        coreMesh.material.transparent = true;
        coreMesh.material.opacity = 0.9;
      }
      coreMesh.scale.set(0.25, 0.25, 0.25);
      
      // Create outer glow mesh using pooled geometry and material
      const glowMesh = BasicSphereMeshPool.acquire();
      if (glowMesh.material instanceof MeshBasicMaterial) {
        glowMesh.material.color.setHex(0xff8800);
        glowMesh.material.transparent = true;
        glowMesh.material.opacity = 0.6;
      }
      glowMesh.scale.set(0.4, 0.4, 0.4);
      
      // Add meshes to the pooled group
      currentPooledGroup.add(coreMesh);
      currentPooledGroup.add(glowMesh);
      
      // Ensure the group is visible
      currentPooledGroup.visible = true;
      
      // Store references
      coreRef.current = coreMesh;
      
      console.log(`[FireballProjectile ${id}] Pooled group setup complete. Group ID: ${currentPooledGroup.uuid}`);
    } else {
      console.error(`[FireballProjectile ${id}] Pooled group is UNDEFINED at mount!`);
    }
    
    return () => {
      // This cleanup runs ONLY when FireballProjectile unmounts from the scene.
      console.log(`[FireballProjectile ${id}] Unmount Cleanup. Pooled group ID: ${currentPooledGroup?.uuid}`);
      
      // Release pooled meshes back to their pools
      if (currentPooledGroup) {
        currentPooledGroup.children.forEach(child => {
          if (child instanceof Mesh) {
            BasicSphereMeshPool.release(child);
          }
        });
        // Clear the group after releasing meshes
        while (currentPooledGroup.children.length > 0) {
          currentPooledGroup.remove(currentPooledGroup.children[0]);
        }
      }
      
      if (onDone) {
        onDone(); // Notifies VfxManager to recycle the pooled group.
      }
    };
  // Dependencies: 'id', 'pooled', 'onDone'.
  }, [id, pooled, onDone]);
  
  // Setup particle system for fire effects
  const fireParticles = useParticleSystem({
    emitterPosition: () => currentVisualPosition,
    emitterShape: 'sphere',
    emitterRadius: 0.2,
    particleLifetime: { min: 0.1, max: 0.5 },
    particleSpeed: { min: 0.5, max: 2 },
    particleSize: { min: 0.05, max: 0.2 },
    particleOpacity: { min: 0.6, max: 1.0 },
    emissionRate: 40,
    maxParticles: 50,
    generateParticle: () => {
      // Use pooled Vector3 for position and velocity
      const basePosition = Vector3Pool.acquire();
      const velocity = Vector3Pool.acquire();
      const color = ColorPool.acquire();
      
      basePosition.set(
        currentVisualPosition.x + (Math.random() - 0.5) * 0.3,
        currentVisualPosition.y + (Math.random() - 0.5) * 0.3,
        currentVisualPosition.z + (Math.random() - 0.5) * 0.3
      );
      
      velocity.set(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      );
      
      color.setHSL(
        0.05 + Math.random() * 0.06, // orange-red hue
        0.7 + Math.random() * 0.3,   // saturation
        0.5 + Math.random() * 0.5    // lightness
      );
      
      const particle = {
        id: `flame-${id}-${Math.random().toString(36).substring(2, 9)}`,
        position: new Vector3().copy(basePosition),
        velocity: new Vector3().copy(velocity),
        scale: 0.05 + Math.random() * 0.15,
        opacity: 0.6 + Math.random() * 0.4,
        lifetime: 0,
        maxLifetime: 0.1 + Math.random() * 0.4,
        color: new Color().copy(color),
      };
      
      // Release pooled objects back to their pools
      Vector3Pool.release(basePosition);
      Vector3Pool.release(velocity);
      ColorPool.release(color);
      
      return particle;
    },
    updateParticle: (particle: Particle, deltaTime: number) => {
      if (particle.lifetime + deltaTime > particle.maxLifetime) {
        return null; // Remove particle
      }
      
      // Use pooled Vector3 for velocity scaling calculation
      const deltaMovement = Vector3Pool.acquire();
      deltaMovement.copy(particle.velocity).multiplyScalar(deltaTime);
      
      // Update particle
      const updatedParticle = {
        ...particle,
        position: particle.position.add(deltaMovement),
        opacity: particle.opacity * (1 - (particle.lifetime / particle.maxLifetime)),
        lifetime: particle.lifetime + deltaTime
      };
      
      Vector3Pool.release(deltaMovement);
      return updatedParticle;
    }
  });
  
  // Register with centralized projectile system instead of individual useFrame
  const { registerProjectile } = useProjectileSystem();
  
  useEffect(() => {
    if (!pooled) return;
    
    const cleanup = registerProjectile({
      id,
      skillId: 'fireball',
      object: pooled,
      position: currentVisualPosition,
      updateFn: (deltaTime: number, elapsedTime: number) => {
        // Log occasionally for fireballs
        if (id.includes('fireball') && Math.random() < 0.01) {
          console.log(`[FireballProjectile ${id}] ProjectileSystem update. VisualPos: (${currentVisualPosition.x.toFixed(2)}, ${currentVisualPosition.y.toFixed(2)}, ${currentVisualPosition.z.toFixed(2)}). Pooled visible: ${pooled?.visible}`);
        }
        
        // Update pooled group position
        if (pooled) {
          pooled.position.copy(currentVisualPosition);
          pooled.visible = true; // Explicitly ensure visibility
        }
        
        if (coreRef.current) {
          // Fire core pulsing
          const pulseFactor = Math.sin(elapsedTime * 15 + timeOffset.current) * 0.15 + 1;
          coreRef.current.scale.set(pulseFactor, pulseFactor, pulseFactor);
          
          // Random fire flickering through material opacity
          if (coreRef.current.material instanceof MeshBasicMaterial) {
            const flickerOpacity = 0.8 + Math.sin(elapsedTime * 20) * 0.2;
            coreRef.current.material.opacity = flickerOpacity;
          }
        }
        
        return true; // Keep alive
      }
    });
    
    return cleanup;
  }, [id, pooled, currentVisualPosition, registerProjectile]);
  
  // If we're using pooled objects, return the primitive
  if (pooled) {
    return <primitive object={pooled} />;
  }
  
  // Legacy rendering path for non-pooled usage
  console.warn(`[FireballProjectile ${id}] Rendering without a pooled group.`);
  return (
    <group position={[currentVisualPosition.x, currentVisualPosition.y, currentVisualPosition.z]}>
      {/* Main fire core */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.25, 16, 16]} />
        <meshBasicMaterial 
          color={0xff5500}
          transparent={true}
          opacity={0.9}
        />
      </mesh>
      
      {/* Outer glow */}
      <mesh>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshBasicMaterial 
          color={0xff8800}
          transparent={true}
          opacity={0.6}
        />
      </mesh>
      
      {/* Render fire particles */}
      {fireParticles.particles.map((particle) => (
        <mesh 
          key={particle.id} 
          position={[particle.position.x, particle.position.y, particle.position.z]} 
          scale={particle.scale}
        >
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial 
            color={`#${particle.color.getHexString()}`} 
            transparent={true} 
            opacity={particle.opacity} 
          />
        </mesh>
      ))}
    </group>
  );
}
