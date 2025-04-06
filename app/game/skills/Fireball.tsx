'use client';

import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, MathUtils } from 'three';
import { useGameStore } from '../systems/gameStore';
import { SKILLS } from '../models/Skill';

interface FireballProps {
  startPosition: Vector3;
  targetPosition: Vector3;
  onHit: () => void;
}

export function FireballProjectile({ startPosition, targetPosition, onHit }: FireballProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const direction = new Vector3().subVectors(targetPosition, startPosition).normalize();
  const speed = SKILLS.fireball.projectileSpeed || 10;
  const [reachedTarget, setReachedTarget] = useState(false);
  const initialPositionSet = useRef(false);
  const timeOffset = useRef(Math.random() * Math.PI * 2);
  const [intensity, setIntensity] = useState(2);
  
  // Trail particles
  const particles = useRef<Array<{
    position: Vector3;
    scale: number;
    opacity: number;
    lifetime: number;
    rotationSpeed: Vector3;
  }>>([]);
  
  useEffect(() => {
    console.log("Fireball created: From", startPosition, "To", targetPosition);
    // Clean up particles when component unmounts
    return () => {
      particles.current = [];
    };
  }, [startPosition, targetPosition]);
  
  useFrame((state, delta) => {
    if (reachedTarget || !meshRef.current) return;
    
    // Set initial position only once
    if (!initialPositionSet.current && meshRef.current) {
      meshRef.current.position.copy(startPosition);
      initialPositionSet.current = true;
    }
    
    // Ensure we have a ref before attempting to move
    if (!meshRef.current) return;
    
    // Move projectile toward target
    const moveAmount = direction.clone().multiplyScalar(speed * delta);
    meshRef.current.position.add(moveAmount);
    
    // Make the fireball pulsate
    const pulseFactor = MathUtils.lerp(0.9, 1.1, Math.sin(state.clock.elapsedTime * 8 + timeOffset.current));
    meshRef.current.scale.set(pulseFactor, pulseFactor, pulseFactor);
    
    // Random wobble movement for more dynamic feel
    if (groupRef.current) {
      groupRef.current.position.x += Math.sin(state.clock.elapsedTime * 15) * 0.02;
      groupRef.current.position.y += Math.cos(state.clock.elapsedTime * 12) * 0.02;
    }
    
    // Varying light intensity
    const newIntensity = 2 + Math.sin(state.clock.elapsedTime * 10 + timeOffset.current) * 0.5;
    setIntensity(newIntensity);
    
    // Add trail particles at varying rates based on speed
    const particleChance = 0.5 + (speed / 30);
    if (Math.random() > (1 - particleChance)) {
      particles.current.push({
        position: meshRef.current.position.clone().add(
          new Vector3(
            (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5) * 0.3
          )
        ),
        scale: 0.1 + Math.random() * 0.3,
        opacity: 0.8,
        lifetime: 0.5 + Math.random() * 0.3,
        rotationSpeed: new Vector3(
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2
        )
      });
    }
    
    // Update trail particles
    for (let i = particles.current.length - 1; i >= 0; i--) {
      const particle = particles.current[i];
      particle.lifetime -= delta;
      particle.opacity = Math.max(0, particle.lifetime * 1.6);
      particle.scale *= 0.97; // Gradually shrink
      
      if (particle.lifetime <= 0) {
        particles.current.splice(i, 1);
      }
    }
    
    // Check if we reached the target
    const currentDist = meshRef.current.position.distanceTo(targetPosition);
    if (currentDist < 0.8) {
      console.log("Fireball hit target");
      setReachedTarget(true);
      onHit();
    }
    
    // Rotate to face direction
    meshRef.current.lookAt(
      meshRef.current.position.clone().add(direction)
    );
    
    // Spin the fireball around its forward axis
    meshRef.current.rotateZ(delta * 5);
  });
  
  if (reachedTarget) {
    return <FireballImpact position={targetPosition} />;
  }
  
  return (
    <group ref={groupRef}>
      {/* Main fireball */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial
          emissive="#ff6600"
          emissiveIntensity={intensity}
          color="#ff0000"
          toneMapped={false}
        />
        <pointLight color="#ff6600" intensity={intensity} distance={5} />
      </mesh>
      
      {/* Inner core - more intense glow */}
      <mesh position={meshRef.current ? meshRef.current.position : startPosition} scale={0.7}>
        <sphereGeometry args={[0.2, 12, 12]} />
        <meshStandardMaterial
          emissive="#ffff00"
          emissiveIntensity={intensity * 1.2}
          color="#ffcc00"
          toneMapped={false}
        />
      </mesh>
      
      {/* Trail particles */}
      {particles.current.map((particle, index) => (
        <mesh key={index} position={particle.position}>
          <sphereGeometry args={[particle.scale, 8, 8]} />
          <meshStandardMaterial
            emissive="#ff6600"
            emissiveIntensity={1}
            color="#ff4500"
            transparent
            opacity={particle.opacity}
          />
        </mesh>
      ))}
    </group>
  );
}

interface ImpactProps {
  position: Vector3;
}

function FireballImpact({ position }: ImpactProps) {
  const [lifetime, setLifetime] = useState(1.0);
  const meshRef = useRef<THREE.Mesh>(null);
  const fragments = useRef<Array<{
    position: Vector3;
    velocity: Vector3;
    scale: number;
    opacity: number;
    rotationSpeed: Vector3;
  }>>([]);
  
  // Create explosion fragments
  useEffect(() => {
    // Create fragments that fly outward
    for (let i = 0; i < 15; i++) {
      const angle = Math.random() * Math.PI * 2;
      const height = Math.random() * Math.PI - Math.PI / 2;
      const speed = 2 + Math.random() * 5;
      
      fragments.current.push({
        position: position.clone(),
        velocity: new Vector3(
          Math.cos(angle) * Math.cos(height) * speed,
          Math.sin(height) * speed,
          Math.sin(angle) * Math.cos(height) * speed
        ),
        scale: 0.1 + Math.random() * 0.2,
        opacity: 1.0,
        rotationSpeed: new Vector3(
          Math.random() * 5,
          Math.random() * 5, 
          Math.random() * 5
        )
      });
    }
  }, [position]);
  
  useFrame((state, delta) => {
    if (meshRef.current) {
      // Expand impact with some turbulence
      const expansionSpeed = 5 + Math.sin(state.clock.elapsedTime * 20) * 0.5;
      meshRef.current.scale.addScalar(delta * expansionSpeed);
      
      // Decrease opacity over time
      if (meshRef.current.material instanceof THREE.Material) {
        (meshRef.current.material as THREE.MeshStandardMaterial).opacity = lifetime;
      }
    }
    
    // Update fragments
    for (const fragment of fragments.current) {
      // Apply gravity
      fragment.velocity.y -= delta * 4;
      
      // Update position
      fragment.position.addScaledVector(fragment.velocity, delta);
      
      // Fade out
      fragment.opacity = Math.max(0, fragment.opacity - delta * 1.5);
      
      // Shrink slightly
      fragment.scale *= 0.98;
    }
    
    // Update lifetime
    setLifetime(prev => Math.max(0, prev - delta));
  });
  
  if (lifetime <= 0) return null;
  
  return (
    <group>
      {/* Main impact shockwave */}
      <mesh ref={meshRef} position={position}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshStandardMaterial
          emissive="#ff6600"
          emissiveIntensity={2}
          color="#ff4500"
          transparent
          opacity={lifetime}
        />
        <pointLight color="#ff6600" intensity={4 * lifetime} distance={10} />
      </mesh>
      
      {/* Secondary flash */}
      <mesh position={position} scale={lifetime < 0.5 ? lifetime * 2 : 1}>
        <sphereGeometry args={[0.8, 12, 12]} />
        <meshStandardMaterial
          emissive="#ffff00"
          emissiveIntensity={3}
          color="#ffcc00"
          transparent
          opacity={Math.min(1, lifetime * 3)}
        />
      </mesh>
      
      {/* Flying fragments */}
      {fragments.current.map((fragment, index) => (
        <mesh
          key={index}
          position={fragment.position}
          scale={fragment.scale}
        >
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            emissive="#ff6600"
            emissiveIntensity={2}
            color="#ff4500"
            transparent
            opacity={fragment.opacity}
          />
        </mesh>
      ))}
    </group>
  );
}