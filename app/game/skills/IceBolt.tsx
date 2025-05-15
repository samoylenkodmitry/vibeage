'use client';

import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, MathUtils } from 'three';
import * as THREE from 'three';
import { SKILLS } from '../models/Skill';

interface IceBoltProps {
  startPosition: Vector3;
  targetPosition: Vector3;
  onHit: () => void;
}

export function IceBoltProjectile({ startPosition, targetPosition, onHit }: IceBoltProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const direction = new Vector3().subVectors(targetPosition, startPosition).normalize();
  const speed = SKILLS.icebolt.projectileSpeed || 15;
  const [reachedTarget, setReachedTarget] = useState(false);
  const initialPositionSet = useRef(false);
  const spiralOffset = useRef(Math.random() * Math.PI * 2);
  const spiralRadius = useRef(0.1 + Math.random() * 0.1);
  const [intensity, setIntensity] = useState(1.5);
  
  // Ice crystal particles
  const crystals = useRef<Array<{
    position: Vector3;
    scale: number;
    opacity: number;
    lifetimeMs: number;
    rotation: { x: number, y: number, z: number };
  }>>([]);
  
  useEffect(() => {
    console.log("Ice Bolt created: From", startPosition, "To", targetPosition);
    // Clean up particles when component unmounts
    return () => {
      crystals.current = [];
    };
  }, [startPosition, targetPosition]);
  
  useFrame((state, delta) => {
    if (reachedTarget || !meshRef.current) return;
    
    // Set initial position only once
    if (!initialPositionSet.current && meshRef.current) {
      meshRef.current.position.copy(startPosition);
      initialPositionSet.current = true;
    }
    
    // Calculate the spiral path around the direct line to target
    const spiralTime = state.clock.elapsedTime * 5;
    const spiralVector = new Vector3();
    
    // Find perpendicular vectors to create a spiral around the direction vector
    const up = new Vector3(0, 1, 0);
    const right = new Vector3().crossVectors(direction, up).normalize();
    if (right.lengthSq() === 0) {
      right.set(1, 0, 0); // Fallback if direction is parallel to up
    }
    const perpendicular = new Vector3().crossVectors(direction, right).normalize();
    
    // Create a spiral motion
    spiralVector.addScaledVector(right, Math.cos(spiralTime + spiralOffset.current) * spiralRadius.current);
    spiralVector.addScaledVector(perpendicular, Math.sin(spiralTime + spiralOffset.current) * spiralRadius.current);
    
    // Move projectile toward target with spiral offset
    const directMove = direction.clone().multiplyScalar(speed * delta);
    meshRef.current.position.add(directMove);
    meshRef.current.position.add(spiralVector.clone().multiplyScalar(0.1));
    
    // Pulsating ice effect
    const pulseFactor = MathUtils.lerp(0.9, 1.1, Math.sin(state.clock.elapsedTime * 10) * 0.5 + 0.5);
    if (meshRef.current) {
      meshRef.current.scale.set(pulseFactor, pulseFactor, pulseFactor);
    }
    
    // Rotate the ice bolt for a spinning effect with wobble
    if (meshRef.current) {
      meshRef.current.rotation.z += delta * 12;
      meshRef.current.rotation.x += delta * Math.sin(state.clock.elapsedTime * 3) * 0.2;
    }
    
    // Varying light intensity
    const newIntensity = 1.5 + Math.sin(state.clock.elapsedTime * 8) * 0.3;
    setIntensity(newIntensity);
    
    // Add trail crystal at varying rates
    const crystalChance = 0.4 + (speed / 40);
    if (Math.random() > (1 - crystalChance)) {
      crystals.current.push({
        position: meshRef.current.position.clone().add(
          new Vector3(
            (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5) * 0.3
          )
        ),
        scale: 0.05 + Math.random() * 0.15,
        opacity: 0.9,
        lifetimeMs: 700 + Math.random() * 300, // 0.4 + 0.3 seconds in ms
        rotation: {
          x: Math.random() * Math.PI,
          y: Math.random() * Math.PI,
          z: Math.random() * Math.PI
        }
      });
    }
    
    // Update trail crystals
    for (let i = crystals.current.length - 1; i >= 0; i--) {
      const crystal = crystals.current[i];
      crystal.lifetimeMs -= delta * 1000;
      crystal.opacity = Math.max(0, crystal.lifetimeMs / 450); // fade out over 0.45s
      crystal.scale *= 0.97;
      if (crystal.lifetimeMs <= 0) {
        crystals.current.splice(i, 1);
      }
    }
    
    // Check if we reached the target
    const currentDist = meshRef.current.position.distanceTo(targetPosition);
    if (currentDist < 0.8) {
      console.log("Ice Bolt hit target");
      setReachedTarget(true);
      onHit();
    }
    
    // Look in direction of travel
    meshRef.current.lookAt(
      meshRef.current.position.clone().add(direction)
    );
  });
  
  if (reachedTarget) {
    return <IceBoltImpact position={targetPosition} />;
  }
  
  return (
    <group ref={groupRef}>
      {/* Main ice bolt */}
      <mesh ref={meshRef}>
        <coneGeometry args={[0.2, 0.9, 8]} />
        <meshStandardMaterial
          emissive="#88cfff"
          emissiveIntensity={intensity}
          color="#ffffff"
          toneMapped={false}
          transparent
          opacity={0.8}
        />
        <pointLight color="#88cfff" intensity={intensity} distance={4} />
      </mesh>
      
      {/* Secondary ice shard components */}
      <group position={meshRef.current 
        ? [meshRef.current.position.x, meshRef.current.position.y, meshRef.current.position.z] 
        : [startPosition.x, startPosition.y, startPosition.z]}>
        <mesh rotation={[Math.PI / 4, 0, Math.PI / 6]} scale={0.6}>
          <octahedronGeometry args={[0.3, 0]} />
          <meshStandardMaterial
            emissive="#a0d8ff"
            emissiveIntensity={intensity * 0.7}
            color="#ffffff"
            transparent
            opacity={0.7}
          />
        </mesh>
        <mesh rotation={[-Math.PI / 4, Math.PI / 2, -Math.PI / 6]} scale={0.5} position={[0, 0.2, 0]}>
          <octahedronGeometry args={[0.25, 0]} />
          <meshStandardMaterial
            emissive="#cceeff"
            emissiveIntensity={intensity * 0.5}
            color="#ffffff"
            transparent
            opacity={0.6}
          />
        </mesh>
      </group>
      
      {/* Frost aura */}
      <mesh position={meshRef.current 
        ? [meshRef.current.position.x, meshRef.current.position.y, meshRef.current.position.z] 
        : [startPosition.x, startPosition.y, startPosition.z]} scale={1.2}>
        <sphereGeometry args={[0.3, 12, 12]} />
        <meshStandardMaterial
          emissive="#88cfff"
          emissiveIntensity={0.5}
          color="#ffffff"
          transparent
          opacity={0.2}
        />
      </mesh>
      
      {/* Trail crystals */}
      {crystals.current.map((crystal, index) => (
        <mesh 
          key={index} 
          position={[crystal.position.x, crystal.position.y, crystal.position.z]}
          rotation={[crystal.rotation.x, crystal.rotation.y, crystal.rotation.z]}
        >
          <octahedronGeometry args={[crystal.scale, 0]} />
          <meshStandardMaterial
            emissive="#88cfff"
            emissiveIntensity={1}
            color="#b0e0ff"
            transparent
            opacity={crystal.opacity}
          />
        </mesh>
      ))}
    </group>
  );
}

interface ImpactProps {
  position: Vector3;
}

function IceBoltImpact({ position }: ImpactProps) {
  const [lifetimeMs, setLifetimeMs] = useState(3000);
  const mainImpactRef = useRef<THREE.Mesh>(null);
  const iceCrystalsRef = useRef<Array<{
    position: Vector3;
    scale: number;
    opacity: number;
    rotation: Vector3;
    velocity: Vector3;
  }>>([]);
  
  // Create ice crystal explosion
  useEffect(() => {
    // Create outward crystals
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const height = (Math.random() - 0.5) * Math.PI;
      const distance = 0.2 + Math.random() * 0.4;
      const speed = 1 + Math.random() * 3;
      
      const direction = new Vector3(
        Math.cos(angle) * Math.cos(height),
        Math.sin(height),
        Math.sin(angle) * Math.cos(height)
      ).normalize();
      
      iceCrystalsRef.current.push({
        position: position.clone().add(direction.clone().multiplyScalar(distance)),
        scale: 0.05 + Math.random() * 0.15,
        opacity: 1.0,
        rotation: new Vector3(
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2
        ),
        velocity: direction.multiplyScalar(speed)
      });
    }
  }, [position]);
  
  useFrame((state, delta) => {
    // Update lifetime at a slower rate
    setLifetimeMs(prev => Math.max(0, prev - delta * 800));
    
    // Expand the main impact effect
    if (mainImpactRef.current) {
      const expansionScale = Math.min(2, 0.5 + (1 - lifetimeMs / 3000) * 3); 
      mainImpactRef.current.scale.set(expansionScale, expansionScale, expansionScale);
      
      if (mainImpactRef.current.material instanceof THREE.Material) {
        (mainImpactRef.current.material as THREE.MeshStandardMaterial).opacity = Math.min(1, lifetimeMs / 600);
      }
    }      // Update crystal fragments
    for (const crystal of iceCrystalsRef.current) {
      // Apply movement and some gravity, but slower
      crystal.velocity.y -= delta * 1.5; // Gentler gravity
      crystal.position.addScaledVector(crystal.velocity, delta * 0.7); // Slower movement
      
      // Add some rotation, slightly slower
      crystal.rotation.x += delta * (Math.random() * 0.3 + 0.3);
      crystal.rotation.y += delta * (Math.random() * 0.3 + 0.3);
      crystal.rotation.z += delta * (Math.random() * 0.3 + 0.3);
      
      // Set opacity based on lifetime, slower fade-out
      crystal.opacity = Math.max(0, lifetimeMs * 0.6 / 3000);
      
      // Shrink more gradually
      crystal.scale *= 0.995;
    }
  });
  
  if (lifetimeMs <= 0) return null;
  
  return (
    <group>
      {/* Initial flash */}
      <mesh position={[position.x, position.y, position.z]}>
        <sphereGeometry args={[0.6, 16, 16]} />
        <meshStandardMaterial
          emissive="#ffffff"
          emissiveIntensity={3}
          color="#88cfff"
          transparent
          opacity={Math.min(1, lifetimeMs / 300)}
        />
      </mesh>
      
      {/* Main frost sphere */}
      <mesh ref={mainImpactRef} position={[position.x, position.y, position.z]}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshStandardMaterial
          emissive="#88cfff"
          emissiveIntensity={2}
          color="#ffffff"
          transparent
          opacity={lifetimeMs * 0.7 / 1000}
        />
        <pointLight color="#88cfff" intensity={2 * (lifetimeMs / 1000)} distance={8} />
      </mesh>
      
      {/* Frost ring */}
      <mesh position={[position.x, position.y, position.z]} rotation={[Math.PI / 2, 0, 0]} scale={0.3 + (1 - lifetimeMs / 1500) * 2.5}>
        <torusGeometry args={[1, 0.1, 16, 36]} />
        <meshStandardMaterial
          emissive="#88cfff"
          emissiveIntensity={1}
          color="#ffffff"
          transparent
          opacity={Math.max(0, lifetimeMs * 0.7 / 1000)}
        />
      </mesh>
      
      {/* Ice crystal fragments */}
      {iceCrystalsRef.current.map((crystal, index) => (
        <mesh 
          key={index} 
          position={[crystal.position.x, crystal.position.y, crystal.position.z]}
          rotation={[crystal.rotation.x, crystal.rotation.y, crystal.rotation.z]}
          scale={crystal.scale}
        >
          <octahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            emissive="#88cfff"
            emissiveIntensity={0.5}
            color="#ffffff"
            transparent
            opacity={crystal.opacity}
          />
        </mesh>
      ))}
      
      {/* Ground frost effect (appears to spread on ground) */}
      <mesh position={[position.x, 0.05, position.z]} rotation={[-Math.PI / 2, 0, 0]} scale={1 + (1 - lifetimeMs / 1500) * 3}>
        <circleGeometry args={[1, 32]} />
        <meshStandardMaterial
          emissive="#88cfff"
          emissiveIntensity={0.5}
          color="#ffffff"
          transparent
          opacity={Math.max(0, lifetimeMs * 0.4 / 1000)}
        />
      </mesh>
    </group>
  );
}