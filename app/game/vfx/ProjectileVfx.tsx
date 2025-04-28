import { useFrame } from '@react-three/fiber';
import { useRef, useState, useMemo } from 'react';
import { Vector3, Mesh, Material, MathUtils, Color, Group } from 'three';

interface ProjectileVfxProps {
  id: string;
  origin: {x: number; y: number; z: number};
  dir: {x: number; y: number; z: number};
  speed: number;
}

interface TrailParticle {
  position: Vector3;
  scale: number;
  opacity: number;
  lifetimeMs: number;
  rotationSpeed: Vector3;
  rotation: Vector3;
}

function ProjectileVfx({id, origin, dir, speed}: ProjectileVfxProps) {
  const ref = useRef<Mesh>(null);
  const groupRef = useRef<Group>(null);
  const pos = useRef(new Vector3(origin.x, origin.y, origin.z));
  const timeOffset = useRef(Math.random() * Math.PI * 2);
  const [intensity, setIntensity] = useState(2);
  const [trailParticles, setTrailParticles] = useState<TrailParticle[]>([]);
  
  // Normalize direction vector if needed
  const normalizedDir = useMemo(() => {
    const length = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
    if (length === 0) return { x: 0, y: 0, z: 0 };
    return {
      x: dir.x / length,
      y: dir.y / length,
      z: dir.z / length
    };
  }, [dir]);
  
  useFrame((state, delta) => {
    if (!ref.current) return;
    
    // Move projectile
    pos.current.addScaledVector(new Vector3(normalizedDir.x, normalizedDir.y, normalizedDir.z), speed * delta);
    ref.current.position.copy(pos.current);
    
    // Make the projectile pulsate
    const pulseFactor = MathUtils.lerp(0.9, 1.1, Math.sin(state.clock.elapsedTime * 8 + timeOffset.current));
    ref.current.scale.set(pulseFactor, pulseFactor, pulseFactor);
    
    // Random wobble movement
    if (groupRef.current) {
      groupRef.current.position.x += Math.sin(state.clock.elapsedTime * 15) * 0.015;
      groupRef.current.position.y += Math.cos(state.clock.elapsedTime * 12) * 0.015;
    }
    
    // Varying light intensity
    const newIntensity = 2 + Math.sin(state.clock.elapsedTime * 10 + timeOffset.current) * 0.5;
    setIntensity(newIntensity);
    
    // Add trail particles
    if (Math.random() > 0.6) {
      const newParticle: TrailParticle = {
        position: pos.current.clone().add(
          new Vector3(
            (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.2
          )
        ),
        scale: 0.1 + Math.random() * 0.2,
        opacity: 0.8,
        lifetimeMs: 400 + Math.random() * 200,
        rotationSpeed: new Vector3(
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2
        ),
        rotation: new Vector3()
      };
      
      setTrailParticles(prev => [...prev, newParticle]);
    }
    
    // Update trail particles
    setTrailParticles(prev => 
      prev.map(particle => {
        // Update lifetime
        const newLifetime = particle.lifetimeMs - delta * 1000;
        
        // Update rotation
        particle.rotation.x += particle.rotationSpeed.x * delta;
        particle.rotation.y += particle.rotationSpeed.y * delta;
        particle.rotation.z += particle.rotationSpeed.z * delta;
        
        return {
          ...particle,
          lifetimeMs: newLifetime,
          opacity: Math.max(0, newLifetime / 400), // fade out
          scale: particle.scale * 0.97 // shrink over time
        };
      }).filter(p => p.lifetimeMs > 0)
    );
  });
  
  return (
    <group ref={groupRef}>
      {/* Main projectile */}
      <mesh ref={ref}>
        <sphereGeometry args={[0.25, 16, 16]} />
        <meshStandardMaterial 
          color={'orange'} 
          emissive={'orange'} 
          emissiveIntensity={intensity}
        />
        
        {/* Add glow effect */}
        <pointLight 
          color={'orange'} 
          intensity={intensity} 
          distance={3} 
        />
      </mesh>
      
      {/* Trail particles */}
      {trailParticles.map((particle, index) => (
        <mesh
          key={`trail-${id}-${index}`}
          position={[particle.position.x, particle.position.y, particle.position.z]}
          rotation={[particle.rotation.x, particle.rotation.y, particle.rotation.z]}
          scale={[particle.scale, particle.scale, particle.scale]}
        >
          <sphereGeometry args={[0.15, 8, 8]} />
          <meshBasicMaterial 
            color={new Color(0xff8c00)} 
            transparent={true} 
            opacity={particle.opacity} 
          />
        </mesh>
      ))}
    </group>
  );
}

export default ProjectileVfx;
