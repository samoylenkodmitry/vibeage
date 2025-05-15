import * as THREE from 'three';
import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Color, MathUtils } from 'three';

interface WaterSplashProps {
  position: Vector3;
  radius?: number; // Area of effect radius
  onComplete: () => void;
}

export function WaterSplash({ position, radius = 5, onComplete }: WaterSplashProps) {
  const [lifetimeMs, setLifetimeMs] = useState(3500);
  const rippleRef = useRef<THREE.Mesh>(null);
  const isCompletingRef = useRef(false);
  
  // Water droplet particles
  const [particles, setParticles] = useState(() => {
    const particleCount = 35;
    return Array.from({ length: particleCount }, () => ({
      position: position.clone().add(
        new Vector3(
          (Math.random() - 0.5) * radius * 0.6, // Spread particles based on radius
          Math.random() * 0.5,
          (Math.random() - 0.5) * radius * 0.6  // Spread particles based on radius
        )
      ),
      initialY: position.y,
      velocity: new Vector3(
        (Math.random() - 0.5) * 10,
        Math.random() * 8 + 6,
        (Math.random() - 0.5) * 10
      ),
      scale: 0.1 + Math.random() * 0.25,
      opacity: 1.0,
      color: new Color().setHSL(0.58 + Math.random() * 0.05, 0.8, 0.5 + Math.random() * 0.2),
      rotationSpeed: new Vector3(
        Math.random() * 5, 
        Math.random() * 5, 
        Math.random() * 5
      ),
      rotation: new Vector3(),
      stretching: 1.0
    }));
  });
  
  // Water vapor/mist particles
  const mistParticles = useRef<Array<{
    position: Vector3;
    scale: number;
    opacity: number;
    velocity: Vector3;
    lifetimeMs: number;
    maxLifetimeMs: number;
  }>>([]);

  // Create initial mist particles
  useEffect(() => {
    // Clear existing mist particles to prevent duplicates
    mistParticles.current = [];
    
    // Create more mist particles for larger radius
    const mistCount = Math.floor(25 * (radius / 3));
    
    for (let i = 0; i < mistCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const height = Math.random() * 0.5;
      const distance = (0.3 + Math.random() * 0.7) * radius;
      const maxLifetimeMs = 500 + Math.random() * 1500;
      mistParticles.current.push({
        position: position.clone().add(new Vector3(
          Math.cos(angle) * distance * 0.7,
          height,
          Math.sin(angle) * distance * 0.7
        )),
        scale: 0.3 + Math.random() * 0.4,
        opacity: 0.4 + Math.random() * 0.3,
        velocity: new Vector3(
          Math.cos(angle) * (0.5 + Math.random()),
          0.7 + Math.random() * 0.5,
          Math.sin(angle) * (0.5 + Math.random())
        ),
        lifetimeMs: maxLifetimeMs,
        maxLifetimeMs
      });
    }
    
    // Reset the completing state when a new splash is created
    isCompletingRef.current = false;
    
    return () => {
      // Ensure particles are cleared when component unmounts
      mistParticles.current = [];
    };
    
  }, [position, radius]);

  useFrame((state, delta) => {
    // Use a smaller delta cap to prevent large time steps that can cause visual glitches
    const cappedDelta = Math.min(delta, 0.1);
    
    // Create time-based ripple with radius reflecting the area of effect
    const rippleScale = MathUtils.lerp(0.2, radius * 2, 1 - lifetimeMs / 3500);
    const rippleOpacity = MathUtils.lerp(0, 0.6, lifetimeMs / 3500);
    
    if (rippleRef.current) {
      rippleRef.current.scale.set(rippleScale, 1, rippleScale);
      if (rippleRef.current.material) {
        const material = rippleRef.current.material as THREE.Material;
        if (material.transparent !== undefined && material.opacity !== undefined) {
          material.opacity = rippleOpacity;
        }
      }
    }

    // Update water droplet particles
    setParticles(prevParticles => 
      prevParticles.map(particle => {
        // Apply gravity
        particle.velocity.y -= 15 * cappedDelta;
        
        // Update position
        particle.position.add(
          particle.velocity.clone().multiplyScalar(cappedDelta)
        );
        
        // Calculate stretching based on vertical velocity (for water droplet effect)
        particle.stretching = MathUtils.lerp(
          1.0, 
          1.5,
          Math.min(1, Math.abs(particle.velocity.y) / 10)
        );

        // Update rotation
        particle.rotation.x += particle.rotationSpeed.x * cappedDelta;
        particle.rotation.y += particle.rotationSpeed.y * cappedDelta;
        particle.rotation.z += particle.rotationSpeed.z * cappedDelta;

        // Bounce off ground with dampening
        if (particle.position.y < 0.1) {
          particle.position.y = 0.1;
          
          // Create splash mist when hitting ground with force
          if (-particle.velocity.y > 8) {
            for (let i = 0; i < 2; i++) {
              const angle = Math.random() * Math.PI * 2;
              const maxLifetimeMs = 300 + Math.random() * 600;
              
              // Distribute splash particles throughout the area of effect
              const splashDistance = Math.random() * radius * 0.8;
              
              mistParticles.current.push({
                position: particle.position.clone().add(new Vector3(
                  Math.cos(angle) * splashDistance,
                  0.1,
                  Math.sin(angle) * splashDistance
                )),
                scale: 0.2 + Math.random() * 0.2,
                opacity: 0.3 + Math.random() * 0.2,
                velocity: new Vector3(
                  Math.cos(angle) * (0.3 + Math.random() * 0.7),
                  0.3 + Math.random() * 0.4,
                  Math.sin(angle) * (0.3 + Math.random() * 0.7)
                ),
                lifetimeMs: maxLifetimeMs,
                maxLifetimeMs
              });
            }
          }
          
          // Reflect velocity with dampening
          particle.velocity.y = Math.abs(particle.velocity.y) * 0.3;
          
          // Add some horizontal movement on bounce
          particle.velocity.x *= 0.9;
          particle.velocity.z *= 0.9;
          
          // Reduce scale slightly on impact
          particle.scale *= 0.95;
        }

        // Update opacity based on lifetime and altitude
        // Water droplets fade as they reach maximum height or as lifetime ends
        const heightFactor = Math.max(0, 1 - Math.abs(particle.position.y - particle.initialY) / 6);
        particle.opacity = Math.min(lifetimeMs / 1000, heightFactor) * 0.9;

        return particle;
      })
    );
    
    // Update mist particles
    for (let i = mistParticles.current.length - 1; i >= 0; i--) {
      const mist = mistParticles.current[i];
      mist.lifetimeMs -= cappedDelta * 1000;
      mist.position.addScaledVector(mist.velocity, cappedDelta);
      mist.velocity.multiplyScalar(0.97);
      mist.scale = MathUtils.lerp(
        mist.scale,
        mist.scale * 1.1,
        cappedDelta * 2
      );
      const normalizedLife = mist.lifetimeMs / mist.maxLifetimeMs;
      mist.opacity = Math.sin(normalizedLife * Math.PI) * 0.5;
      if (mist.lifetimeMs <= 0) {
        mistParticles.current.splice(i, 1);
      }
    }

    // Update lifetime more slowly
    setLifetimeMs(prev => {
      const newLifetime = Math.max(0, prev - cappedDelta * 800);
      if (newLifetime <= 0 && !isCompletingRef.current) {
        isCompletingRef.current = true;
        setTimeout(() => {
          onComplete();
        }, 50);
      }
      return newLifetime;
    });
  });

  // If no lifetime left, don't render anything
  if (lifetimeMs <= 0) return null;

  return (
    <group>
      {/* Initial splash burst */}
      <mesh position={[position.x, position.y, position.z]}>
        <sphereGeometry args={[radius * 0.3, 16, 16]} />
        <meshStandardMaterial
          key={`splash-${position.x}-${position.z}`}
          color="#80c0ff"
          emissive="#4080ff"
          emissiveIntensity={0.5}
          transparent={true}
          opacity={Math.min(0.7, lifetimeMs * 2 / 1000)}
        />
        <pointLight
          color="#60a0ff"
          intensity={Math.min(2, lifetimeMs * 5 / 1000)}
          distance={radius * 2}
          decay={2}
        />
      </mesh>

      {/* Area of effect indicator on ground */}
      <mesh ref={rippleRef} position={[position.x, 0.05, position.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 1, 32]} />
        <meshStandardMaterial
          key={`ripple-${position.x}-${position.z}`}
          color="#80c0ff"
          emissive="#4080ff"
          emissiveIntensity={0.3}
          transparent={true}
          opacity={0.6}
          depthWrite={false}
        />
      </mesh>

      {/* Water column base - scale with radius */}
      <mesh position={[position.x, position.y * 0.5, position.z]} scale={[radius * 0.4, Math.min(1.5, lifetimeMs * 4 / 1000), radius * 0.4]}>
        <cylinderGeometry args={[0.4, 0.7, 0.5, 16]} />
        <meshStandardMaterial
          key={`column-${position.x}-${position.z}`}
          color="#60a0ff"
          emissive="#4080ff"
          emissiveIntensity={0.3}
          transparent={true}
          opacity={Math.min(0.8, lifetimeMs * 2 / 1000)}
        />
      </mesh>

      {/* Water droplets */}
      {particles.map((particle, i) => (
        <mesh 
          key={`droplet-${i}-${position.x}-${position.z}`}
          position={[particle.position.x, particle.position.y, particle.position.z]}
          rotation={[particle.rotation.x, particle.rotation.y, particle.rotation.z]}
          scale={[particle.scale, particle.scale * particle.stretching, particle.scale]}
        >
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial
            color={`#${particle.color.getHexString()}`}
            emissive="#4080ff"
            emissiveIntensity={0.2}
            transparent={true}
            opacity={particle.opacity}
          />
        </mesh>
      ))}

      {/* Mist/vapor particles */}
      {mistParticles.current.map((mist, i) => (
        <mesh
          key={`mist-${i}-${position.x}-${position.z}`}
          position={[mist.position.x, mist.position.y, mist.position.z]}
          scale={mist.scale}
        >
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial
            color="#b0e0ff"
            emissive="#80c0ff"
            emissiveIntensity={0.1}
            transparent={true}
            opacity={mist.opacity}
            depthWrite={false}
          />
        </mesh>
      ))}
      
      {/* Area of effect indicator */}
      <mesh position={[position.x, 0.1, position.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.9, radius, 32]} />
        <meshBasicMaterial
          color="#40a0ff"
          transparent={true}
          opacity={lifetimeMs * 0.3 / 1000}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}