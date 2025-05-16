import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Mesh, Color, Group, MeshBasicMaterial, SphereGeometry } from 'three';
import useParticleSystem, { Particle } from './useParticleSystem';

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

  // currentVisualPosition will update whenever 'pos' or 'origin.y' props change
  const currentVisualPosition = useMemo(() => new Vector3(pos.x, origin.y, pos.z), [pos, origin.y]);
  
  useEffect(() => {
    // This effect handles the setup and cleanup of the pooled Three.js group.
    console.log(`[FireballProjectile] Mount/Setup Effect for ID: ${id}. Pooled Group: ${pooled ? 'Exists' : 'Missing'}`);
    const currentPooledGroup = pooled; // Capture for use in cleanup
    
    if (currentPooledGroup) {
      // Clear any existing children if this is a reused group
      while (currentPooledGroup.children.length > 0) {
        currentPooledGroup.remove(currentPooledGroup.children[0]);
      }
      
      // Create core mesh
      const coreMesh = new Mesh(
        new SphereGeometry(0.25, 16, 16),
        new MeshBasicMaterial({ 
          color: 0xff5500,
          transparent: true,
          opacity: 0.9
        })
      );
      
      // Create outer glow mesh
      const glowMesh = new Mesh(
        new SphereGeometry(0.4, 16, 16),
        new MeshBasicMaterial({
          color: 0xff8800,
          transparent: true,
          opacity: 0.6
        })
      );
      
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
      return {
        id: `flame-${id}-${Math.random().toString(36).substring(2, 9)}`,
        position: new Vector3(
          currentVisualPosition.x + (Math.random() - 0.5) * 0.3,
          currentVisualPosition.y + (Math.random() - 0.5) * 0.3,
          currentVisualPosition.z + (Math.random() - 0.5) * 0.3
        ),
        velocity: new Vector3(
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2
        ),
        scale: 0.05 + Math.random() * 0.15,
        opacity: 0.6 + Math.random() * 0.4,
        lifetime: 0,
        maxLifetime: 0.1 + Math.random() * 0.4,
        color: new Color().setHSL(
          0.05 + Math.random() * 0.06, // orange-red hue
          0.7 + Math.random() * 0.3,   // saturation
          0.5 + Math.random() * 0.5    // lightness
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
        position: particle.position.addScaledVector(particle.velocity, deltaTime),
        opacity: particle.opacity * (1 - (particle.lifetime / particle.maxLifetime)),
        lifetime: particle.lifetime + deltaTime
      };
    }
  });
  
  // Add wobble effect to core and update position
  useFrame((state) => {
    // Log occasionally for fireballs
    if (id.includes('fireball') && Math.random() < 0.01) {
      console.log(`[FireballProjectile ${id}] useFrame. VisualPos: (${currentVisualPosition.x.toFixed(2)}, ${currentVisualPosition.y.toFixed(2)}, ${currentVisualPosition.z.toFixed(2)}). Pooled visible: ${pooled?.visible}`);
    }
    
    // Update pooled group position
    if (pooled) {
      pooled.position.copy(currentVisualPosition);
      pooled.visible = true; // Explicitly ensure visibility
    }
    
    if (coreRef.current) {
      // Fire core pulsing
      const time = state.clock.elapsedTime;
      const pulseFactor = Math.sin(time * 15 + timeOffset.current) * 0.15 + 1;
      coreRef.current.scale.set(pulseFactor, pulseFactor, pulseFactor);
      
      // Random fire flickering through material opacity
      if (coreRef.current.material instanceof MeshBasicMaterial) {
        const flickerOpacity = 0.8 + Math.sin(time * 20) * 0.2;
        coreRef.current.material.opacity = flickerOpacity;
      }
    }
  });
  
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
