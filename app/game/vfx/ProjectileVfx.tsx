import { useFrame } from '@react-three/fiber';
import { useRef, useState, useMemo, useEffect } from 'react';
import { Vector3, Mesh, Material, MathUtils, Color, Group } from 'three';
import { useProjectileStore } from '../systems/projectileManager';

interface ProjectileVfxProps {
  id: string;
  origin: {x: number; y: number; z: number};
  dir: {x: number; y: number; z: number};
  speed: number;
  launchTs?: number; // Add launch timestamp
}

interface TrailParticle {
  position: Vector3;
  scale: number;
  opacity: number;
  lifetimeMs: number;
  rotationSpeed: Vector3;
  rotation: Vector3;
}

function ProjectileVfx({id = `proj-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, origin, dir, speed, launchTs}: ProjectileVfxProps) {
  const ref = useRef<Mesh>(null);
  const groupRef = useRef<Group>(null);
  const pos = useRef(new Vector3(origin.x, origin.y, origin.z));
  const originalOrigin = useRef(new Vector3(origin.x, origin.y, origin.z));
  const originalDir = useRef(new Vector3(dir.x, dir.y, dir.z));
  const originalSpeed = useRef(speed);
  const originalLaunchTs = useRef(launchTs || performance.now());
  
  const timeOffset = useRef(Math.random() * Math.PI * 2);
  const [intensity, setIntensity] = useState(2);
  const [trailParticles, setTrailParticles] = useState<TrailParticle[]>([]);
  
  // Get projectile opacity from store
  const projectileState = useProjectileStore(state => state.projectiles[id]);
  const opacity = projectileState?.opacity ?? 1.0;
  const isFadingOut = projectileState?.fadeOutStartTs !== undefined;
  
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
    
    // If fading out, don't update position
    if (!isFadingOut) {
      // Calculate position based on server parameters and elapsed time
      // This ensures the projectile follows exactly the path determined by the server
      const elapsedTimeSec = (performance.now() - originalLaunchTs.current) / 1000;
      
      // Calculate the exact position based on origin, direction, speed, and time
      const distanceTraveled = originalSpeed.current * elapsedTimeSec;
      pos.current.x = originalOrigin.current.x + originalDir.current.x * distanceTraveled;
      pos.current.y = originalOrigin.current.y + originalDir.current.y * distanceTraveled;
      pos.current.z = originalOrigin.current.z + originalDir.current.z * distanceTraveled;
      
      // Apply the calculated position to the mesh
      ref.current.position.copy(pos.current);
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
    
    // Add trail particles (fewer when fading out)
    if (Math.random() > 0.6 && (!isFadingOut || Math.random() > 0.8)) {
      const newParticle: TrailParticle = {
        position: pos.current.clone().add(
          new Vector3(
            (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.2
          )
        ),
        scale: 0.1 + Math.random() * 0.2,
        opacity: 0.8 * opacity, // Adjust opacity based on projectile opacity
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
          opacity: Math.max(0, newLifetime / 400) * opacity, // fade out and respect projectile opacity
          scale: particle.scale * 0.97 // shrink over time
        };
      }).filter(p => p.lifetimeMs > 0)
    );
  });
  
  return (
    <group ref={groupRef}>
      {/* Main projectile */}
      <mesh ref={ref}>
        <sphereGeometry key={`proj-geo-${id}`} args={[0.25, 16, 16]} />
        <meshStandardMaterial 
          key={`proj-mat-${id}`}
          color={'orange'} 
          emissive={'orange'} 
          emissiveIntensity={intensity}
          transparent={true}
          opacity={opacity}
        />
        
        {/* Add glow effect */}
        <pointLight 
          key={`proj-light-${id}`}
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
          <sphereGeometry key={`trail-geo-${id}-${index}`} args={[0.15, 8, 8]} />
          <meshBasicMaterial 
            key={`trail-mat-${id}-${index}`}
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
