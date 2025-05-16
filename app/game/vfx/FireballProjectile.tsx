import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Mesh, Color, Group, MeshBasicMaterial } from 'three';
import useParticleSystem, { Particle } from './useParticleSystem';

interface FireballProjectileProps {
  id?: string;
  origin: {x: number; y: number; z: number};
  pos: {x: number; z: number};
  pooled?: Group;  // Add pooled group prop
  onDone?: () => void; // Add callback for when projectile is done
}

export default function FireballProjectile({ 
  id = `fireball-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, 
  origin, 
  pos,
  pooled,
  onDone
}: FireballProjectileProps) {
  const coreRef = useRef<Mesh>(null);
  const groupRef = useRef<Group>(null);
  const timeOffset = useRef(Math.random() * Math.PI * 2);
  
  const position = new Vector3(pos.x, origin.y, pos.z);
  // Initialize pooled group on first mount if provided
  useEffect(() => {
    console.log(`[FireballProjectile] Mounted: ${id}`);
    
    if (!pooled) {
      console.error(`[FireballProjectile ${id}] Pooled group is UNDEFINED!`);
      return;
    }
    
    // Clear any existing children if this is a reused group
    while (pooled.children.length > 0) {
      pooled.remove(pooled.children[0]);
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
    pooled.add(coreMesh);
    pooled.add(glowMesh);
    
    // Ensure the group is visible
    pooled.visible = true;
    
    // Store references
    coreRef.current = coreMesh;
    
    console.log(`[FireballProjectile ${id}] Pooled group setup complete. Group ID: ${pooled.uuid}, Visible: ${pooled.visible}, Children: ${pooled.children.length}`);
    if (coreRef.current) {
      console.log(`[FireballProjectile ${id}] Core mesh material:`, coreRef.current.material);
    }
    
    return () => {
      console.log(`[FireballProjectile ${id}] Unmounting pooled: ${id}`);
      console.log(`[FireballProjectile ${id}] Unmounting. Pooled group ID: ${pooled?.uuid}`);
      
      if (onDone) {
        // Ensure the group is invisible when unmounted
        pooled.visible = false;
        onDone();
      }
    };
  }, [pooled, onDone, id, pos]);
  
  // Setup particle system for fire effects
  const fireParticles = useParticleSystem({
    emitterPosition: () => position,
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
          position.x + (Math.random() - 0.5) * 0.3,
          position.y + (Math.random() - 0.5) * 0.3,
          position.z + (Math.random() - 0.5) * 0.3
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
        position: new Vector3(
          particle.position.x + particle.velocity.x * deltaTime,
          particle.position.y + particle.velocity.y * deltaTime,
          particle.position.z + particle.velocity.z * deltaTime
        ),
        opacity: particle.opacity * (1 - (particle.lifetime / particle.maxLifetime)),
        lifetime: particle.lifetime + deltaTime
      };
    }
  });
  
  // Add wobble effect to core
  useFrame((state) => {
    if (!coreRef.current) return;
    
    // Log occasionally for fireballs
    if (id.includes('fireball') && Math.random() < 0.1) {
      console.log(`[FireballProjectile ${id}] useFrame. Position: (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}). Pooled visible: ${pooled?.visible}`);
    }
    
    // Update pooled group position
    if (pooled) {
      pooled.position.set(position.x, position.y, position.z);
      pooled.visible = true; // Explicitly ensure visibility
    }
    
    // Fire core pulsing
    const time = state.clock.elapsedTime;
    const pulseFactor = Math.sin(time * 15 + timeOffset.current) * 0.15 + 1;
    coreRef.current.scale.set(pulseFactor, pulseFactor, pulseFactor);
    
    // Random fire flickering through material opacity
    if (coreRef.current.material instanceof MeshBasicMaterial) {
      const flickerOpacity = 0.8 + Math.sin(time * 20) * 0.2;
      coreRef.current.material.opacity = flickerOpacity;
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
      {/* Main fire core */}
      <mesh key={`core-${id}`} ref={coreRef}>
        <sphereGeometry key={`core-geo-${id}`} args={[0.25, 16, 16]} />
        <meshBasicMaterial 
          key={`core-mat-${id}`}
          color={0xff5500}
          transparent={true}
          opacity={0.9}
        />
      </mesh>
      
      {/* Outer glow */}
      <mesh key={`glow-${id}`}>
        <sphereGeometry key={`glow-geo-${id}`} args={[0.4, 16, 16]} />
        <meshBasicMaterial 
          key={`glow-mat-${id}`}
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
          scale={[particle.scale, particle.scale, particle.scale]}
        >
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial
            color={0xff7700}
            transparent={true}
            opacity={particle.opacity}
          />
        </mesh>
      ))}
    </group>
  );
}

// Import needed THREE types
import { SphereGeometry } from 'three';
