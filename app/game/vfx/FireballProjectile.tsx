import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Mesh, Color, Group, MeshBasicMaterial } from 'three';
import useProjectileMovement from './useProjectileMovement';
import useParticleSystem, { Particle } from './useParticleSystem';

interface FireballProjectileProps {
  id?: string;
  origin: {x: number; y: number; z: number};
  dir: {x: number; y: number; z: number};
  speed: number;
  launchTs?: number;
}

export default function FireballProjectile({ 
  id = `fireball-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, 
  origin, 
  dir, 
  speed, 
  launchTs = performance.now() 
}: FireballProjectileProps) {
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
  
  // Log initial values
  useEffect(() => {
    console.log(`[Fireball ${id}] Created with:`, {
      origin: `(${origin.x.toFixed(2)}, ${origin.y.toFixed(2)}, ${origin.z.toFixed(2)})`,
      dir: `(${dir.x.toFixed(2)}, ${dir.y.toFixed(2)}, ${dir.z.toFixed(2)})`, 
      speed,
      launchTs
    });
  }, [id, origin, dir, speed, launchTs]);
  
  // Add debug logging for position updates
  useEffect(() => {
    console.log(`[Fireball ${id}] Position updated: (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`);
  }, [id, position]);

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
  useFrame((state, delta) => {
    if (!coreRef.current) return;
    
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
