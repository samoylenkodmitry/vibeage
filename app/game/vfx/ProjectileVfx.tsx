import { useFrame } from '@react-three/fiber';
import { useRef, useState, useEffect } from 'react';
import { Vector3, Mesh, MathUtils, Color, Group, Material, MeshStandardMaterial, PointLight } from 'three';
import { useProjectileStoreLegacy } from '../systems/projectileManager';
import useProjectileMovement from './useProjectileMovement';
import useParticleSystem, { Particle } from './useParticleSystem';
import { Vector3Pool, ColorPool, SphereMeshPool, LightPool } from '../utils/ClientObjectPool';

interface ProjectileVfxProps {
  id?: string;
  origin: {x: number; y: number; z: number};
  dir: {x: number; y: number; z: number};
  speed: number;
  launchTs?: number;
  pooled?: Group; // Add pooled group prop
  onDone?: () => void; // Add callback for when projectile is done
}

export default function ProjectileVfx({
  id = `proj-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, 
  origin, 
  dir, 
  speed, 
  launchTs = performance.now(),
  pooled, // Use the pooled group passed from VfxManager
  onDone
}: ProjectileVfxProps) {
  const ref = useRef<Mesh>(null);
  const groupRef = useRef<Group>(null);
  const timeOffset = useRef(Math.random() * Math.PI * 2);
  const [intensity, setIntensity] = useState(2);
  const isActive = useRef(true);
  
  // Get projectile opacity from store
  const projectileState = useProjectileStoreLegacy(state => state.enhanced[id]);
  const opacity = projectileState?.opacity ?? 1.0;
  const isFadingOut = projectileState?.fadeOutStartTs !== undefined;
  
  // Initialize pooled group on first mount if provided
  useEffect(() => {
    if (!pooled) return;
    
    // Clear any existing children if this is a reused group
    while (pooled.children.length > 0) {
      pooled.remove(pooled.children[0]);
    }
    
    // Create main projectile sphere
    const coreMesh = SphereMeshPool.acquire();
    
    // Set material properties
    if (coreMesh.material instanceof MeshStandardMaterial) {
      coreMesh.material.color.set("orange");
      coreMesh.material.emissive.set("orange");
      coreMesh.material.emissiveIntensity = 2;
      coreMesh.material.transparent = true;
      coreMesh.material.opacity = 1.0;
    }
    
    // Add light
    const light = LightPool.acquire();
    light.color.set("orange");
    light.intensity = 2;
    light.distance = 3;
    
    // Add meshes to the pooled group
    pooled.add(coreMesh);
    pooled.add(light);
    
    // Store references
    ref.current = coreMesh;
    
    return () => {
      // Release pooled objects
      if (ref.current) {
        SphereMeshPool.release(ref.current);
      }
      pooled.children.forEach(child => {
        if (child instanceof PointLight) {
          LightPool.release(child);
        }
      });
      
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
  
  // Use the projectile movement hook for consistent positioning
  const { position} = useProjectileMovement({
    origin,
    dir,
    speed,
    launchTs,
    shouldAutoDestroy: false, // Let the VfxManager handle destruction
  });
  
  // Setup particle system for trail effects
  const trailParticles = useParticleSystem({
    emitterPosition: () => position,
    emitterShape: 'sphere',
    emitterRadius: 0.1,
    particleLifetime: { min: 0.4, max: 0.6 },
    particleSpeed: { min: 0.1, max: 0.5 },
    particleSize: { min: 0.1, max: 0.2 },
    particleOpacity: { min: 0.6, max: 0.8 },
    emissionRate: isFadingOut ? 5 : 15, // Reduce emission when fading out
    maxParticles: 40,
    generateParticle: () => {
      // Use pooled vectors for particle creation
      const tempPos = Vector3Pool.acquire();
      const tempVel = Vector3Pool.acquire();
      const tempRot = Vector3Pool.acquire();
      const tempRotSpeed = Vector3Pool.acquire();
      const tempColor = ColorPool.acquire();
      
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
      
      tempColor.set(0xff8c00);
      
      const particle = {
        id: `trail-${id}-${Math.random().toString(36).substring(2, 9)}`,
        position: new Vector3().copy(tempPos),
        velocity: new Vector3().copy(tempVel),
        scale: 0.1 + Math.random() * 0.1,
        opacity: 0.6 * opacity, // Adjust for projectile opacity
        lifetime: 0,
        maxLifetime: 0.4 + Math.random() * 0.2,
        color: new Color().copy(tempColor),
        rotation: new Vector3().copy(tempRot),
        rotationSpeed: new Vector3().copy(tempRotSpeed),
      };
      
      // Release pooled objects
      Vector3Pool.release(tempPos);
      Vector3Pool.release(tempVel);
      Vector3Pool.release(tempRot);
      Vector3Pool.release(tempRotSpeed);
      ColorPool.release(tempColor);
      
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
        opacity: Math.max(0, (particle.maxLifetime - particle.lifetime) / particle.maxLifetime) * opacity,
        scale: particle.scale * 0.98, // Shrink over time
        lifetime: particle.lifetime + deltaTime
      };
    }
  });
  
  useFrame((state) => {
    if (!ref.current) return;
    
    // Update pooled group position if available
    if (pooled) {
      pooled.position.set(position.x, position.y, position.z);
      pooled.visible = true;
      
      // Update material opacity for all child meshes
      pooled.children.forEach(child => {
        if (child instanceof Mesh && child.material instanceof Material) {
          (child.material as any).opacity = opacity;
        }
        if (child instanceof PointLight) {
          child.intensity = 2 * opacity + Math.sin(state.clock.elapsedTime * 10 + timeOffset.current) * 0.5 * opacity;
        }
      });
      
      // Add wobble effect
      if (pooled.children[0] instanceof Mesh) {
        const pulseFactor = MathUtils.lerp(0.9, 1.1, Math.sin(state.clock.elapsedTime * 8 + timeOffset.current));
        pooled.children[0].scale.set(pulseFactor, pulseFactor, pulseFactor);
      }
      
      // Add random movement
      pooled.position.x += Math.sin(state.clock.elapsedTime * 15) * 0.015;
      pooled.position.y += Math.cos(state.clock.elapsedTime * 12) * 0.015;
    }
    
    // Update material opacity
    if (ref.current.material instanceof Material) {
      (ref.current.material as any).opacity = opacity;
    }
    
    // Make the projectile pulsate
    const pulseFactor = MathUtils.lerp(0.9, 1.1, Math.sin(state.clock.elapsedTime * 8 + timeOffset.current));
    ref.current.scale.set(pulseFactor, pulseFactor, pulseFactor);
    
    // Random wobble movement
    if (groupRef.current) {
      groupRef.current.position.x += Math.sin(state.clock.elapsedTime * 15) * 0.015;
      groupRef.current.position.y += Math.cos(state.clock.elapsedTime * 12) * 0.015;
    }
    
    // Varying light intensity (reduced when fading out)
    const baseIntensity = 2 * opacity;
    const newIntensity = baseIntensity + Math.sin(state.clock.elapsedTime * 10 + timeOffset.current) * 0.5 * opacity;
    setIntensity(newIntensity);
  });
  
  return (
    <>
      {/* If we're using pooled objects, return the primitive */}
      {pooled ? (
        <primitive object={pooled} />
      ) : (
        <group ref={groupRef} position={[position.x, position.y, position.z]}>
          {/* Main projectile */}
          <mesh ref={ref}>
            <sphereGeometry key={`proj-geo-${id}`} args={[0.25, 16, 16]} />
            <meshStandardMaterial 
              key={`proj-mat-${id}`}
              color="orange"
              emissive="orange"
              emissiveIntensity={intensity}
              transparent={true}
              opacity={opacity}
            />
            
            {/* Add glow effect */}
            <pointLight 
              key={`proj-light-${id}`}
              color="orange"
              intensity={intensity} 
              distance={3} 
            />
          </mesh>
          
          {/* Trail particles */}
          {trailParticles.particles.map(particle => {
            const rotParticle = particle as Particle & { rotation?: Vector3 };
            const rotation = rotParticle.rotation;
            
            return (
              <mesh
                key={particle.id}
                position={[particle.position.x, particle.position.y, particle.position.z]}
                rotation={rotation ? [rotation.x, rotation.y, rotation.z] : [0, 0, 0]}
                scale={[particle.scale, particle.scale, particle.scale]}
              >
                <sphereGeometry args={[1, 8, 8]} />
                <meshBasicMaterial 
                  color="#ff8c00"
                  transparent={true} 
                  opacity={particle.opacity} 
                />
              </mesh>
            );
          })}
        </group>
      )}
    </>
  );
}
