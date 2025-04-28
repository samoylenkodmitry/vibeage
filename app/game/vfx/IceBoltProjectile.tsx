import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Mesh, Color, Group } from 'three';

interface IceBoltProjectileProps {
  id: string;
  origin: {x: number; y: number; z: number};
  dir: {x: number; y: number; z: number};
  speed: number;
}

interface IceParticle {
  position: Vector3;
  scale: number;
  opacity: number;
  velocity: Vector3;
  lifetimeMs: number;
  rotation: Vector3;
  rotationSpeed: Vector3;
}

export function IceBoltProjectile({ id, origin, dir, speed }: IceBoltProjectileProps) {
  const coreRef = useRef<Mesh>(null);
  const groupRef = useRef<Group>(null);
  const pos = useRef(new Vector3(origin.x, origin.y, origin.z));
  const [particles, setParticles] = useState<IceParticle[]>([]);
  const timeOffset = useRef(Math.random() * Math.PI * 2);
  
  useFrame((state, delta) => {
    if (!coreRef.current) return;
    
    // Move projectile
    pos.current.x += dir.x * speed * delta;
    pos.current.y += dir.y * speed * delta;
    pos.current.z += dir.z * speed * delta;
    coreRef.current.position.copy(pos.current);
    
    // Rotate core
    coreRef.current.rotation.x += delta * 2;
    coreRef.current.rotation.z += delta * 3;
    
    // Subtle pulsing
    const pulseFactor = Math.sin(state.clock.elapsedTime * 8 + timeOffset.current) * 0.05 + 1;
    coreRef.current.scale.set(pulseFactor, pulseFactor, pulseFactor);
    
    // Add ice trail particles
    if (Math.random() > 0.6) {
      const newParticle: IceParticle = {
        position: pos.current.clone().add(
          new Vector3(
            (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.2
          )
        ),
        scale: 0.03 + Math.random() * 0.08,
        opacity: 0.7 + Math.random() * 0.3,
        velocity: new Vector3(
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.5
        ),
        lifetimeMs: 400 + Math.random() * 300,
        rotation: new Vector3(
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2
        ),
        rotationSpeed: new Vector3(
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2
        )
      };
      
      setParticles(prev => [...prev, newParticle]);
    }
    
    // Update ice particles
    setParticles(prev => 
      prev.map(particle => {
        // Drift slowly
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
          opacity: Math.max(0, particle.lifetimeMs / 500) // fade out
        };
      }).filter(p => p.lifetimeMs > 0 && p.opacity > 0.05)
    );
  });
  
  return (
    <group ref={groupRef}>
      {/* Main ice core - using an icosahedron for crystalline look */}
      <mesh ref={coreRef}>
        <icosahedronGeometry args={[0.2, 1]} />
        <meshStandardMaterial 
          color={new Color(0xaad4ff)}
          transparent={true}
          opacity={0.7}
          roughness={0.1}
          metalness={0.9}
          emissive={new Color(0x84b9ff)}
          emissiveIntensity={0.5}
        />
      </mesh>
      
      {/* Outer glow */}
      <mesh position={pos.current.toArray()}>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshBasicMaterial 
          color={new Color(0xc7e0ff)}
          transparent={true}
          opacity={0.3}
        />
      </mesh>
      
      {/* Ice particles - using boxGeometry for crystal-like shards */}
      {particles.map((particle, index) => (
        <mesh
          key={`ice-${id}-${index}`}
          position={[particle.position.x, particle.position.y, particle.position.z]}
          rotation={[particle.rotation.x, particle.rotation.y, particle.rotation.z]}
          scale={[particle.scale, particle.scale, particle.scale]}
        >
          <boxGeometry args={[0.1, 0.1, 0.1]} />
          <meshStandardMaterial 
            color={new Color(0xd1e6ff)}
            transparent={true}
            opacity={particle.opacity}
            roughness={0.1}
            metalness={0.8}
          />
        </mesh>
      ))}
    </group>
  );
}

// Make sure to export both as named and default export for compatibility
export default IceBoltProjectile;
