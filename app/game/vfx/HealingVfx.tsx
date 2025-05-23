import React, { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Mesh, Vector3 } from 'three';

interface HealingVfxProps {
  position: {x: number; y: number; z: number};
  amount?: number;
  duration?: number;
}

interface HealParticle {
  id: string;
  position: Vector3;
  velocity: Vector3;
  scale: number;
  opacity: number;
  color: Color;
  rotation: Vector3;
  rotationSpeed: Vector3;
  lifetime: number;
  maxLifetime: number;
}

export default function HealingVfx({ position, amount = 20, duration = 1.2 }: HealingVfxProps) {
  const [lifetime, setLifetime] = useState(duration);
  const ringRef = useRef<Mesh>(null);
  
  // Generate healing particles
  const particles = useMemo(() => {
    const particleCount = 15 + Math.min(15, Math.floor(amount / 5));
    
    return Array.from({ length: particleCount }, () => {
      const id = `heal-${Math.random().toString(36).substring(2, 9)}`;
      const angle = Math.random() * Math.PI * 2;
      const distance = 0.3 + Math.random() * 0.8;
      
      return {
        id,
        position: new Vector3(
          position.x + Math.cos(angle) * distance * 0.3,
          position.y + 0.5 + Math.random() * 0.8, // Start above the player
          position.z + Math.sin(angle) * distance * 0.3
        ),
        velocity: new Vector3(
          Math.cos(angle) * (0.2 + Math.random() * 0.3),
          0.8 + Math.random() * 0.6, // Move upward
          Math.sin(angle) * (0.2 + Math.random() * 0.3)
        ),
        scale: 0.08 + Math.random() * 0.12,
        opacity: 0.8 + Math.random() * 0.2,
        color: new Color(0x50ff50).lerp(new Color(0x80ff80), Math.random()),
        rotation: new Vector3(
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2
        ),
        rotationSpeed: new Vector3(
          Math.random() * 2,
          Math.random() * 2,
          Math.random() * 2
        ),
        lifetime: 0,
        maxLifetime: duration * (0.6 + Math.random() * 0.4)
      };
    });
  }, [position, amount, duration]);
  
  const [healParticles, setHealParticles] = useState<HealParticle[]>(particles);
  
  useFrame((_, delta) => {
    // Decrease lifetime
    setLifetime(prev => Math.max(0, prev - delta));
    
    // Update ring effect
    if (ringRef.current) {
      const progress = 1 - (lifetime / duration);
      ringRef.current.scale.x = 0.5 + progress * 1.0;
      ringRef.current.scale.z = 0.5 + progress * 1.0;
      
      if (ringRef.current.material) {
        (ringRef.current.material as any).opacity = 1 - progress * progress;
      }
    }
    
    // Update particles
    setHealParticles(prevParticles => 
      prevParticles.map(particle => {
        // Update lifetime
        const newLifetime = particle.lifetime + delta;
        if (newLifetime >= particle.maxLifetime) {
          return null; // Remove particle
        }
        
        // Calculate normalized progress (0 to 1)
        const progress = newLifetime / particle.maxLifetime;
        
        // Update position with slight float-up and some spiraling
        const spiral = 0.3 * Math.sin(progress * Math.PI * 4);
        
        return {
          ...particle,
          position: new Vector3(
            particle.position.x + particle.velocity.x * delta + Math.sin(newLifetime * 5) * spiral * delta,
            particle.position.y + particle.velocity.y * delta,
            particle.position.z + particle.velocity.z * delta + Math.cos(newLifetime * 5) * spiral * delta
          ),
          rotation: new Vector3(
            particle.rotation.x + particle.rotationSpeed.x * delta,
            particle.rotation.y + particle.rotationSpeed.y * delta,
            particle.rotation.z + particle.rotationSpeed.z * delta
          ),
          // Fade out near the end of lifetime
          opacity: particle.opacity * (1 - (progress * progress)),
          // Gradually decrease upward velocity
          velocity: new Vector3(
            particle.velocity.x,
            Math.max(0, particle.velocity.y - 0.2 * delta),
            particle.velocity.z
          ),
          lifetime: newLifetime
        };
      }).filter(Boolean) as HealParticle[]
    );
  });
  
  // Remove when lifetime is over and all particles are gone
  if (lifetime <= 0 && healParticles.length === 0) return null;
  
  return (
    <group>
      {/* Healing ring effect */}
      <mesh 
        ref={ringRef} 
        position={[position.x, position.y + 0.1, position.z]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[0.3, 0.5, 32]} />
        <meshBasicMaterial color="#60ff60" transparent={true} opacity={0.7} />
      </mesh>
      
      {/* Healing particles */}
      {healParticles.map(particle => (
        <mesh
          key={particle.id}
          position={[particle.position.x, particle.position.y, particle.position.z]}
          rotation={[particle.rotation.x, particle.rotation.y, particle.rotation.z]}
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
      
      {/* Add a small light for illumination effect */}
      <pointLight 
        position={[position.x, position.y + 0.5, position.z]} 
        color="#60ff60"
        intensity={Math.min(1.5, lifetime * 1.5)}
        distance={2.5}
        decay={2}
      />
    </group>
  );
}

// Helper function to spawn a healing VFX
export function spawnHealingVfx(position: {x: number; y: number; z: number}, amount?: number) {
  window.dispatchEvent(
    new CustomEvent('heal', { 
      detail: { 
        position, 
        amount: amount || 20
      } 
    })
  );
}
