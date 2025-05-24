import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Mesh, Material, Vector3, MathUtils } from 'three';
import { 
  Vector3Pool, 
  ColorPool 
} from '../utils/ClientObjectPool';

interface SplashVfxProps {
  position: {x: number; y: number; z: number};
  radius: number;
}

interface WaterParticle {
  position: Vector3;
  initialY: number;
  velocity: Vector3;
  scale: number;
  opacity: number;
  color: Color;
  rotation: Vector3;
  rotationSpeed: Vector3;
  stretching: number;
}

interface MistParticle {
  position: Vector3;
  scale: number;
  opacity: number;
  velocity: Vector3;
  lifetimeMs: number;
  maxLifetimeMs: number;
}

export default function SplashVfx({ position, radius }: SplashVfxProps) {
  const ringRef = useRef<Mesh>(null);
  const [lifetime, setLifetime] = useState(1.0); // 1 second lifetime

  // Generate water droplet particles using object pools
  const particles = useMemo(() => {
    const particleCount = 10 + Math.floor(radius * 5); // Scale particles with radius
    return Array.from({ length: particleCount }, () => {
      // Use pooled Vector3 and Color objects for initial creation
      const particlePos = Vector3Pool.acquire();
      const velocity = Vector3Pool.acquire();
      const rotation = Vector3Pool.acquire();
      const rotationSpeed = Vector3Pool.acquire();
      const color = ColorPool.acquire();
      
      particlePos.set(
        position.x + (Math.random() - 0.5) * radius * 0.6,
        position.y + Math.random() * 0.5,
        position.z + (Math.random() - 0.5) * radius * 0.6
      );
      
      velocity.set(
        (Math.random() - 0.5) * 10,
        Math.random() * 8 + 6,
        (Math.random() - 0.5) * 10
      );
      
      rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      
      rotationSpeed.set(
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8
      );
      
      color.setRGB(
        0.3 + Math.random() * 0.4,  // r: 0.3-0.7
        0.7 + Math.random() * 0.3,  // g: 0.7-1.0
        0.8 + Math.random() * 0.2   // b: 0.8-1.0
      );
      
      const particle = {
        position: new Vector3().copy(particlePos),
        initialY: position.y,
        velocity: new Vector3().copy(velocity),
        scale: 0.1 + Math.random() * 0.25,
        opacity: 0.6 + Math.random() * 0.4,
        color: new Color().copy(color),
        rotation: new Vector3().copy(rotation),
        rotationSpeed: new Vector3().copy(rotationSpeed),
        stretching: 1
      };
      
      // Release pooled objects back to their pools
      Vector3Pool.release(particlePos);
      Vector3Pool.release(velocity);
      Vector3Pool.release(rotation);
      Vector3Pool.release(rotationSpeed);
      ColorPool.release(color);
      
      return particle;
    });
  }, [position, radius]);
  
  // State for tracking particles
  const [waterParticles, setWaterParticles] = useState<WaterParticle[]>(particles);
  const mistParticlesRef = useRef<MistParticle[]>([]);
  
  // Create initial mist particles
  useEffect(() => {
    // Clear existing mist particles to prevent duplicates
    mistParticlesRef.current = [];
    
    // Create mist particles
    const mistCount = Math.floor(10 * (radius / 3));
    
    for (let i = 0; i < mistCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = (0.3 + Math.random() * 0.7) * radius;
      const maxLifetimeMs = 500 + Math.random() * 800;
      
      // Use pooled Vector3 objects for mist particles
      const mistPos = Vector3Pool.acquire();
      const mistVelocity = Vector3Pool.acquire();
      
      mistPos.set(
        position.x + Math.cos(angle) * distance * 0.7,
        position.y + Math.random() * 0.5,
        position.z + Math.sin(angle) * distance * 0.7
      );
      
      mistVelocity.set(
        Math.cos(angle) * (0.5 + Math.random()),
        0.7 + Math.random() * 0.5,
        Math.sin(angle) * (0.5 + Math.random())
      );
      
      mistParticlesRef.current.push({
        position: new Vector3().copy(mistPos),
        scale: 0.3 + Math.random() * 0.4,
        opacity: 0.4 + Math.random() * 0.3,
        velocity: new Vector3().copy(mistVelocity),
        lifetimeMs: maxLifetimeMs,
        maxLifetimeMs
      });
      
      // Release pooled objects
      Vector3Pool.release(mistPos);
      Vector3Pool.release(mistVelocity);
    }
  }, [position, radius]);
  
  useFrame((_, delta) => {
    if (!ringRef.current) return;
    
    // Cap delta to prevent performance issues with large frame times
    const cappedDelta = Math.min(delta, 0.033); // Max 33ms (30 FPS minimum)
    
    // Shrink lifetime
    setLifetime(prev => Math.max(0, prev - cappedDelta));
    
    // Scale up the ring
    const progress = 1 - lifetime;
    ringRef.current.scale.x = radius * progress;
    ringRef.current.scale.z = radius * progress;
    
    // Fade out
    if (ringRef.current.material instanceof Material) {
      ringRef.current.material.opacity = lifetime;
    }
    
    // Update water particles
    setWaterParticles(prevParticles => 
      prevParticles.map(particle => {
        // Use pooled Vector3 for physics calculations
        const deltaMovement = Vector3Pool.acquire();
        deltaMovement.copy(particle.velocity).multiplyScalar(cappedDelta);
        
        // Apply gravity with capped delta
        particle.velocity.y -= 15 * cappedDelta;
        
        // Update position with capped delta
        particle.position.add(deltaMovement);
        
        // Handle bouncing
        if (particle.position.y < particle.initialY && particle.velocity.y < 0) {
          particle.velocity.y = -particle.velocity.y * 0.4;
          particle.velocity.x *= 0.8;
          particle.velocity.z *= 0.8;
          particle.position.y = particle.initialY + 0.05;
          
          // Reduce opacity on bounce
          particle.opacity *= 0.7;
        }
        
        // Release pooled vector
        Vector3Pool.release(deltaMovement);
        
        // Update rotation with capped delta
        particle.rotation.x += particle.rotationSpeed.x * cappedDelta;
        particle.rotation.y += particle.rotationSpeed.y * cappedDelta;
        particle.rotation.z += particle.rotationSpeed.z * cappedDelta;
        
        // Fade out over time
        particle.opacity = Math.max(0, particle.opacity - 0.5 * cappedDelta);
        
        return particle;
      }).filter(p => p.opacity > 0.1)
    );
    
    // Update mist particles
    const mistParticles = mistParticlesRef.current;
    for (let i = mistParticles.length - 1; i >= 0; i--) {
      const particle = mistParticles[i];
      
      // Update lifetime
      particle.lifetimeMs -= delta * 1000;
      
      // Use pooled Vector3 for mist particle movement
      const deltaMovement = Vector3Pool.acquire();
      deltaMovement.copy(particle.velocity).multiplyScalar(delta * 0.5);
      
      // Update position
      particle.position.add(deltaMovement);
      
      // Fade out particles
      particle.opacity = MathUtils.lerp(0, 0.7, particle.lifetimeMs / particle.maxLifetimeMs);
      
      // Release pooled vector
      Vector3Pool.release(deltaMovement);
      
      // Remove dead particles
      if (particle.lifetimeMs <= 0) {
        mistParticles.splice(i, 1);
      }
    }
  });
  
  // Remove when lifetime is over and all particles are gone
  if (lifetime <= 0 && waterParticles.length === 0 && mistParticlesRef.current.length === 0) return null;
  
  return (
    <group>
      {/* Main ring */}
      <mesh 
        ref={ringRef} 
        position={[position.x, position.y + 0.05, position.z]} // Slightly above ground
        rotation={[Math.PI / 2, 0, 0]} // Flat on ground
      >
        <ringGeometry args={[radius * 0.8, radius, 32]} />
        <meshBasicMaterial color="#00a0ff" transparent={true} opacity={1} />
      </mesh>
      
      {/* Water particles */}
      {waterParticles.map((particle, index) => (
        <mesh
          key={`water-${index}`}
          position={[particle.position.x, particle.position.y, particle.position.z]}
          rotation={[particle.rotation.x, particle.rotation.y, particle.rotation.z]}
          scale={[particle.scale, particle.scale * particle.stretching, particle.scale]}
        >
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshBasicMaterial 
            color={particle.color.getHexString()} 
            transparent={true} 
            opacity={particle.opacity}
          />
        </mesh>
      ))}
      
      {/* Mist particles */}
      {mistParticlesRef.current.map((particle, index) => (
        <mesh
          key={`mist-${index}`}
          position={[particle.position.x, particle.position.y, particle.position.z]}
        >
          <sphereGeometry args={[0.15, 8, 8]} />
          <meshBasicMaterial
            color="#88ccff"
            transparent={true}
            opacity={particle.opacity}
          />
        </mesh>
      ))}
    </group>
  );
}

// Helper functions for spawning visual effects
export function spawnSplashVfx(position: {x: number; y: number; z: number}, radius: number, type?: string) {
  window.dispatchEvent(
    new CustomEvent('spawnSplash', { 
      detail: { 
        position, 
        radius,
        effectType: type || 'water'
      } 
    })
  );
}

export function spawnStunFlash(position: {x: number; y: number; z: number}) {
  window.dispatchEvent(
    new CustomEvent('spawnStunFlash', { detail: { position } })
  );
}

// Create a FireSplash component for fire effects
export function FireSplash({ position, radius }: SplashVfxProps) {
  const ringRef = useRef<Mesh>(null);
  const [lifetime, setLifetime] = useState(1.0);
  
  // Generate fire particles
  const particles = useMemo(() => {
    const particleCount = 10 + Math.floor(radius * 5);
    return Array.from({ length: particleCount }, () => ({
      position: new Vector3(
        position.x + (Math.random() - 0.5) * radius * 0.6,
        position.y + Math.random() * 0.5,
        position.z + (Math.random() - 0.5) * radius * 0.6
      ),
      initialY: position.y,
      velocity: new Vector3(
        (Math.random() - 0.5) * 10,
        Math.random() * 10 + 4, // Stronger upward motion
        (Math.random() - 0.5) * 10
      ),
      scale: 0.1 + Math.random() * 0.25,
      opacity: 1.0,
      color: new Color().setHSL(
        0.05 + Math.random() * 0.06, // Orange-red hue
        0.7 + Math.random() * 0.3,   // Saturation
        0.5 + Math.random() * 0.5    // Lightness
      ),
      rotation: new Vector3(),
      rotationSpeed: new Vector3(
        Math.random() * 5, 
        Math.random() * 5, 
        Math.random() * 5
      ),
      stretching: 1.5 // More stretching for fire particles
    }));
  }, [position, radius]);
  
  const [fireParticles, setFireParticles] = useState<WaterParticle[]>(particles);
  
  useFrame((_, delta) => {
    if (!ringRef.current) return;
    
    // Shrink lifetime
    setLifetime(prev => Math.max(0, prev - delta));
    
    // Scale up the ring
    const progress = 1 - lifetime;
    ringRef.current.scale.x = radius * progress;
    ringRef.current.scale.z = radius * progress;
    
    // Fire-specific fading
    if (ringRef.current.material instanceof Material) {
      ringRef.current.material.opacity = lifetime * 0.8;
    }
    
    // Update fire particles
    setFireParticles(prevParticles => 
      prevParticles.map(particle => {
        // Apply upward force (opposite of gravity for fire)
        particle.velocity.y += 2 * delta;
        
        // Update position
        particle.position.x += particle.velocity.x * delta;
        particle.position.y += particle.velocity.y * delta;
        particle.position.z += particle.velocity.z * delta;
        
        // Update rotation
        particle.rotation.x += particle.rotationSpeed.x * delta;
        particle.rotation.y += particle.rotationSpeed.y * delta;
        particle.rotation.z += particle.rotationSpeed.z * delta;
        
        // Fade out over time (faster for fire)
        particle.opacity = Math.max(0, particle.opacity - 0.8 * delta);
        
        return particle;
      }).filter(p => p.opacity > 0.1)
    );
  });
  
  // Remove when lifetime is over and all particles are gone
  if (lifetime <= 0 && fireParticles.length === 0) return null;
  
  return (
    <group>
      {/* Fire ring */}
      <mesh 
        ref={ringRef} 
        position={[position.x, position.y + 0.05, position.z]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[radius * 0.8, radius, 32]} />
        <meshBasicMaterial color="#ff5500" transparent={true} opacity={1} />
      </mesh>
      
      {/* Fire particles */}
      {fireParticles.map((particle, index) => (
        <mesh
          key={`fire-${index}`}
          position={[particle.position.x, particle.position.y, particle.position.z]}
          rotation={[particle.rotation.x, particle.rotation.y, particle.rotation.z]}
          scale={[particle.scale, particle.scale * particle.stretching, particle.scale]}
        >
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshBasicMaterial 
            color={particle.color.getHexString()} 
            transparent={true} 
            opacity={particle.opacity}
          />
        </mesh>
      ))}
    </group>
  );
}

// Create an IceSplash component for ice effects
export function IceSplash({ position, radius }: SplashVfxProps) {
  const ringRef = useRef<Mesh>(null);
  const [lifetime, setLifetime] = useState(1.0);
  
  // Generate ice shard particles
  const particles = useMemo(() => {
    const particleCount = 10 + Math.floor(radius * 4);
    return Array.from({ length: particleCount }, () => ({
      position: new Vector3(
        position.x + (Math.random() - 0.5) * radius * 0.8,
        position.y + Math.random() * 0.3,
        position.z + (Math.random() - 0.5) * radius * 0.8
      ),
      initialY: position.y,
      velocity: new Vector3(
        (Math.random() - 0.5) * 12, // More horizontal spread
        Math.random() * 6 + 2,
        (Math.random() - 0.5) * 12  // More horizontal spread
      ),
      scale: 0.1 + Math.random() * 0.2,
      opacity: 0.8,
      color: new Color(0xaad4ff), // Ice blue color
      rotation: new Vector3(),
      rotationSpeed: new Vector3(
        Math.random() * 5, 
        Math.random() * 5, 
        Math.random() * 5
      ),
      stretching: 0.7 // Less stretching for ice crystals
    }));
  }, [position, radius]);
  
  const [iceParticles, setIceParticles] = useState<WaterParticle[]>(particles);
  
  useFrame((_, delta) => {
    if (!ringRef.current) return;
    
    // Shrink lifetime
    setLifetime(prev => Math.max(0, prev - delta));
    
    // Scale up the ring
    const progress = 1 - lifetime;
    ringRef.current.scale.x = radius * progress;
    ringRef.current.scale.z = radius * progress;
    
    // Ice-specific fading
    if (ringRef.current.material instanceof Material) {
      ringRef.current.material.opacity = lifetime * 0.9;
    }
    
    // Update ice particles
    setIceParticles(prevParticles => 
      prevParticles.map(particle => {
        // Apply gravity
        particle.velocity.y -= 12 * delta;
        
        // Update position
        particle.position.x += particle.velocity.x * delta;
        particle.position.y += particle.velocity.y * delta;
        particle.position.z += particle.velocity.z * delta;
        
        // Handle bouncing
        if (particle.position.y < particle.initialY && particle.velocity.y < 0) {
          particle.velocity.y = -particle.velocity.y * 0.2; // Less bouncy
          particle.velocity.x *= 0.8;
          particle.velocity.z *= 0.8;
          particle.position.y = particle.initialY + 0.05;
          
          // Reduce opacity on bounce (shatter effect)
          particle.opacity *= 0.5;
        }
        
        // Update rotation
        particle.rotation.x += particle.rotationSpeed.x * delta;
        particle.rotation.y += particle.rotationSpeed.y * delta;
        particle.rotation.z += particle.rotationSpeed.z * delta;
        
        // Fade out over time
        particle.opacity = Math.max(0, particle.opacity - 0.6 * delta);
        
        return particle;
      }).filter(p => p.opacity > 0.1)
    );
  });
  
  // Remove when lifetime is over and all particles are gone
  if (lifetime <= 0 && iceParticles.length === 0) return null;
  
  return (
    <group>
      {/* Ice ring */}
      <mesh 
        ref={ringRef} 
        position={[position.x, position.y + 0.05, position.z]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[radius * 0.8, radius, 32]} />
        <meshBasicMaterial color="#b3e0ff" transparent={true} opacity={1} />
      </mesh>
      
      {/* Ice particles */}
      {iceParticles.map((particle, index) => (
        <mesh
          key={`ice-${index}-${Math.random().toString(36).substring(2, 9)}`}
          position={[particle.position.x, particle.position.y, particle.position.z]}
          rotation={[particle.rotation.x, particle.rotation.y, particle.rotation.z]}
          scale={[particle.scale, particle.scale * particle.stretching, particle.scale]}
        >
          <boxGeometry args={[0.15, 0.15, 0.15]} /> {/* Use box for crystal-like shards */}
          <meshBasicMaterial 
            color="#aad4ff" 
            transparent={true} 
            opacity={particle.opacity}
          />
        </mesh>
      ))}
    </group>
  );
}
