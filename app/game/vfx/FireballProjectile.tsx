import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Mesh, Color, Group, Material, MeshBasicMaterial } from 'three';

interface FireballProjectileProps {
  id: string;
  origin: {x: number; y: number; z: number};
  dir: {x: number; y: number; z: number};
  speed: number;
  launchTs?: number; // Add launch timestamp
}

interface FireParticle {
  position: Vector3;
  scale: number;
  opacity: number;
  velocity: Vector3;
  lifetimeMs: number;
  color: Color;
}

export function FireballProjectile({ id, origin, dir, speed, launchTs }: FireballProjectileProps) {
  const coreRef = useRef<Mesh>(null);
  const groupRef = useRef<Group>(null);
  const pos = useRef(new Vector3(origin.x, origin.y, origin.z));
  const originalOrigin = useRef(new Vector3(origin.x, origin.y, origin.z));
  const originalDir = useRef(new Vector3(dir.x, dir.y, dir.z));
  const originalSpeed = useRef(speed);
  const originalLaunchTs = useRef(launchTs || performance.now());
  
  const [particles, setParticles] = useState<FireParticle[]>([]);
  const timeOffset = useRef(Math.random() * Math.PI * 2);
  
  // Generate some initial fire particles
  useState(() => {
    const initialParticles: FireParticle[] = [];
    for (let i = 0; i < 15; i++) {
      initialParticles.push({
        position: new Vector3(
          origin.x + (Math.random() - 0.5) * 0.3,
          origin.y + (Math.random() - 0.5) * 0.3,
          origin.z + (Math.random() - 0.5) * 0.3
        ),
        scale: 0.05 + Math.random() * 0.15,
        opacity: 0.6 + Math.random() * 0.4,
        velocity: new Vector3(
          (Math.random() - 0.5) * 1,
          (Math.random() - 0.5) * 1,
          (Math.random() - 0.5) * 1
        ),
        lifetimeMs: 100 + Math.random() * 300,
        color: new Color().setHSL(
          0.05 + Math.random() * 0.06, // orange-red hue
          0.7 + Math.random() * 0.3,   // saturation
          0.5 + Math.random() * 0.5    // lightness
        )
      });
    }
    setParticles(initialParticles);
  });
  
  useFrame((state, delta) => {
    if (!coreRef.current) return;
    
    // Calculate position based on server parameters and elapsed time
    // This ensures the projectile follows exactly the path determined by the server
    const elapsedTimeSec = (performance.now() - originalLaunchTs.current) / 1000;
    
    // Calculate the exact position based on origin, direction, speed, and time
    const distanceTraveled = originalSpeed.current * elapsedTimeSec;
    pos.current.x = originalOrigin.current.x + originalDir.current.x * distanceTraveled;
    pos.current.y = originalOrigin.current.y + originalDir.current.y * distanceTraveled;
    pos.current.z = originalOrigin.current.z + originalDir.current.z * distanceTraveled;
    
    // Apply the calculated position to the mesh
    coreRef.current.position.copy(pos.current);
    
    // Fire core pulsing
    const pulseFactor = Math.sin(state.clock.elapsedTime * 15 + timeOffset.current) * 0.15 + 1;
    coreRef.current.scale.set(pulseFactor, pulseFactor, pulseFactor);
    
    // Random fire flickering through material opacity
    if (coreRef.current.material instanceof MeshBasicMaterial) {
      const flickerOpacity = 0.8 + Math.sin(state.clock.elapsedTime * 20) * 0.2;
      coreRef.current.material.opacity = flickerOpacity;
    }
    
    // Add fire trail particles
    if (Math.random() > 0.4) {
      const newParticle: FireParticle = {
        position: pos.current.clone().add(
          new Vector3(
            (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5) * 0.3 - 0.2 // bias toward trail behind
          )
        ),
        scale: 0.05 + Math.random() * 0.15,
        opacity: 0.6 + Math.random() * 0.4,
        velocity: new Vector3(
          (Math.random() - 0.5) * 1,
          (Math.random() * 1), // upward bias
          (Math.random() - 0.5) * 1
        ),
        lifetimeMs: 200 + Math.random() * 300,
        color: new Color().setHSL(
          0.05 + Math.random() * 0.06, // orange-red hue
          0.7 + Math.random() * 0.3,   // saturation
          0.5 + Math.random() * 0.5    // lightness
        )
      };
      
      setParticles(prev => [...prev, newParticle]);
    }
    
    // Update fire particles
    setParticles(prev => 
      prev.map(particle => {
        // Rise and drift
        particle.position.x += particle.velocity.x * delta;
        particle.position.y += particle.velocity.y * delta;
        particle.position.z += particle.velocity.z * delta;
        
        // Make particles rise faster as they age
        particle.velocity.y += delta * 0.5;
        
        // Expand slightly as they rise
        const newScale = particle.scale * (1 + delta * 0.3);
        
        return {
          ...particle,
          scale: newScale,
          lifetimeMs: particle.lifetimeMs - delta * 1000,
          opacity: Math.max(0, particle.lifetimeMs / 300) // fade out
        };
      }).filter(p => p.lifetimeMs > 0 && p.opacity > 0.05)
    );
  });
  
  return (
    <group ref={groupRef}>
      {/* Main fire core */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.25, 16, 16]} />
        <meshBasicMaterial 
          color={new Color(0xff5500)}
          transparent={true}
          opacity={0.9}
        />
      </mesh>
      
      {/* Outer glow */}
      <mesh position={pos.current.toArray()}>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshBasicMaterial 
          color={new Color(0xff8800)}
          transparent={true}
          opacity={0.4}
        />
      </mesh>
      
      {/* Fire particles */}
      {particles.map((particle, index) => (
        <mesh
          key={`flame-${id}-${index}`}
          position={[particle.position.x, particle.position.y, particle.position.z]}
          scale={[particle.scale, particle.scale, particle.scale]}
        >
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshBasicMaterial 
            color={particle.color}
            transparent={true}
            opacity={particle.opacity}
          />
        </mesh>
      ))}
    </group>
  );
}

// Make sure to export both as named and default export for compatibility
export default FireballProjectile;
