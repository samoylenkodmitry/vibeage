import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Mesh, Color, MathUtils, Group } from 'three';

interface WaterProjectileProps {
  id: string;
  origin: {x: number; y: number; z: number};
  dir: {x: number; y: number; z: number};
  speed: number;
}

interface DropletParticle {
  position: Vector3;
  scale: number;
  opacity: number;
  velocity: Vector3;
  lifetimeMs: number;
  rotation: Vector3;
  rotationSpeed: Vector3;
}

// Use named export instead of default
export function WaterProjectile({ id, origin, dir, speed }: WaterProjectileProps) {
  const mainRef = useRef<Mesh>(null);
  const groupRef = useRef<Group>(null);
  const pos = useRef(new Vector3(origin.x, origin.y, origin.z));
  const [particles, setParticles] = useState<DropletParticle[]>([]);
  const timeOffset = useRef(Math.random() * Math.PI * 2);
  
  useFrame((state, delta) => {
    if (!mainRef.current) return;
    
    // Move projectile
    pos.current.x += dir.x * speed * delta;
    pos.current.y += dir.y * speed * delta;
    pos.current.z += dir.z * speed * delta;
    mainRef.current.position.copy(pos.current);
    
    // Water-like wobble effect
    const wobbleFactor = Math.sin(state.clock.elapsedTime * 12 + timeOffset.current) * 0.2 + 0.8;
    mainRef.current.scale.set(wobbleFactor, 1, wobbleFactor);
    
    // Random movement for more natural water motion
    if (groupRef.current) {
      groupRef.current.position.y += Math.sin(state.clock.elapsedTime * 10) * 0.01;
      groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 4) * 0.05;
    }
    
    // Add water droplets
    if (Math.random() > 0.7) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * 0.3;
      
      const newParticle: DropletParticle = {
        position: pos.current.clone().add(
          new Vector3(
            Math.cos(angle) * distance,
            Math.sin(angle) * distance + 0.1,
            Math.sin(angle) * distance
          )
        ),
        scale: 0.05 + Math.random() * 0.1,
        opacity: 0.7 + Math.random() * 0.3,
        velocity: new Vector3(
          (Math.random() - 0.5) * 1.5,
          Math.random() * 1.5,
          (Math.random() - 0.5) * 1.5
        ),
        lifetimeMs: 300 + Math.random() * 200,
        rotation: new Vector3(),
        rotationSpeed: new Vector3(
          (Math.random() - 0.5) * 3,
          (Math.random() - 0.5) * 3,
          (Math.random() - 0.5) * 3
        )
      };
      
      setParticles(prev => [...prev, newParticle]);
    }
    
    // Update water particles
    setParticles(prev => 
      prev.map(particle => {
        // Apply gravity and update position
        particle.velocity.y -= 5 * delta;
        particle.position.x += particle.velocity.x * delta;
        particle.position.y += particle.velocity.y * delta;
        particle.position.z += particle.velocity.z * delta;
        
        // Update rotation
        particle.rotation.x += particle.rotationSpeed.x * delta;
        particle.rotation.y += particle.rotationSpeed.y * delta;
        particle.rotation.z += particle.rotationSpeed.z * delta;
        
        return {
          ...particle,
          lifetimeMs: particle.lifetimeMs - delta * 1000,
          opacity: Math.max(0, particle.lifetimeMs / 300) // fade out
        };
      }).filter(p => p.lifetimeMs > 0 && p.opacity > 0.1)
    );
  });
  
  return (
    <group ref={groupRef}>
      {/* Main water projectile */}
      <mesh ref={mainRef}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial 
          color={new Color(0x42a5f5)} // Light blue
          transparent={true}
          opacity={0.7}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>
      
      {/* Water particles */}
      {particles.map((particle, index) => (
        <mesh
          key={`droplet-${id}-${index}`}
          position={[particle.position.x, particle.position.y, particle.position.z]}
          rotation={[particle.rotation.x, particle.rotation.y, particle.rotation.z]}
          scale={[particle.scale, particle.scale, particle.scale]}
        >
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshBasicMaterial 
            color={new Color(0x81d4fa)} // Lighter blue for droplets
            transparent={true}
            opacity={particle.opacity}
          />
        </mesh>
      ))}
    </group>
  );
}

// Add default export as well for compatibility
export default WaterProjectile;
