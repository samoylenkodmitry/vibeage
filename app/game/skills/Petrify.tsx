'use client';

import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, MathUtils } from 'three';
import * as THREE from 'three';
import { SKILLS } from '../models/Skill';

interface PetrifyProps {
  startPosition: Vector3;
  targetPosition: Vector3;
  onHit: () => void;
}

export function PetrifyProjectile({ startPosition, targetPosition, onHit }: PetrifyProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const orbitRef = useRef<THREE.Group>(null);
  const [reachedTarget, setReachedTarget] = useState(false);
  const initialPositionSet = useRef(false);
  const [intensity, setIntensity] = useState(2.2);
  const timeOffset = useRef(Math.random() * 10);

  // Dust particles that orbit the main projectile
  const particles = useRef<Array<{
    position: Vector3;
    scale: number;
    opacity: number;
    lifetime: number;
    orbitSpeed: number;
    orbitRadius: number;
    orbitOffset: number;
    height: number;
  }>>([]);

  const direction = new Vector3().subVectors(targetPosition, startPosition).normalize();
  const speed = 12; // Slightly slower than ice bolt for a weightier feel

  useEffect(() => {
    console.log("Petrify created: From", startPosition, "To", targetPosition);
    
    // Create initial orbiting dust particles
    for (let i = 0; i < 12; i++) {
      particles.current.push({
        position: new Vector3(),
        scale: 0.05 + Math.random() * 0.12,
        opacity: 0.7 + Math.random() * 0.3,
        lifetime: 1.0,
        orbitSpeed: 1.0 + Math.random() * 2.0,
        orbitRadius: 0.3 + Math.random() * 0.4,
        orbitOffset: Math.random() * Math.PI * 2,
        height: Math.random() * 0.4 - 0.2
      });
    }
    
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

    // Move projectile toward target
    const moveAmount = direction.clone().multiplyScalar(speed * delta);
    meshRef.current.position.add(moveAmount);

    // Orbital rotation effect
    if (orbitRef.current) {
      orbitRef.current.rotation.y += delta * 2.0;
      orbitRef.current.rotation.z += delta * 1.2;
    }

    // Pulsate the core
    if (coreRef.current) {
      const pulseFactor = MathUtils.lerp(0.8, 1.2, Math.sin(state.clock.elapsedTime * 5 + timeOffset.current) * 0.5 + 0.5);
      coreRef.current.scale.set(pulseFactor, pulseFactor, pulseFactor);
    }

    // Varying light intensity
    const newIntensity = 2.2 + Math.sin(state.clock.elapsedTime * 6 + timeOffset.current) * 0.3;
    setIntensity(newIntensity);

    // Update orbiting particles
    for (const particle of particles.current) {
      const time = state.clock.elapsedTime * particle.orbitSpeed + particle.orbitOffset;
      
      // Orbit around the projectile
      particle.position.x = Math.cos(time) * particle.orbitRadius;
      particle.position.z = Math.sin(time) * particle.orbitRadius;
      particle.position.y = Math.sin(time * 1.5) * 0.1 + particle.height;
    }

    // Check if we reached the target
    const currentDist = meshRef.current.position.distanceTo(targetPosition);
    if (currentDist < 0.8) {
      console.log("Petrify hit target");
      setReachedTarget(true);
      onHit();
    }

    // Look in direction of travel
    meshRef.current.lookAt(meshRef.current.position.clone().add(direction));
  });

  if (reachedTarget) {
    return <PetrifyImpact position={targetPosition} />;
  }

  return (
    <group>
      {/* Main petrify projectile body */}
      <mesh ref={meshRef}>
        <dodecahedronGeometry args={[0.35, 0]} />
        <meshStandardMaterial
          emissive="#aaaaaa"
          emissiveIntensity={intensity * 0.3}
          color="#444444"
          roughness={0.7}
          metalness={0.2}
        />

        {/* Inner glowing core */}
        <mesh ref={coreRef} scale={0.6}>
          <sphereGeometry args={[0.5, 16, 16]} />
          <meshStandardMaterial
            emissive="#c0c0c0"
            emissiveIntensity={intensity}
            color="#606060"
            transparent={true}
            opacity={0.9}
          />
        </mesh>

        {/* Stone fragments orbiting the core */}
        <group ref={orbitRef}>
          <mesh position={[0.25, 0, 0]} scale={0.2}>
            <tetrahedronGeometry args={[1, 0]} />
            <meshStandardMaterial
              color="#505050"
              roughness={1.0}
              metalness={0.1}
            />
          </mesh>
          <mesh position={[-0.2, 0.15, 0.2]} rotation={[0.5, 0.3, 0.2]} scale={0.15}>
            <dodecahedronGeometry args={[1, 0]} />
            <meshStandardMaterial
              color="#606060"
              roughness={1.0}
              metalness={0.1}
            />
          </mesh>
          <mesh position={[0, -0.2, -0.2]} rotation={[0.2, 0.5, 0]} scale={0.18}>
            <octahedronGeometry args={[1, 0]} />
            <meshStandardMaterial
              color="#555555"
              roughness={0.9}
              metalness={0.1}
            />
          </mesh>
        </group>

        {/* Light source */}
        <pointLight color="#e0e0e0" intensity={intensity * 0.6} distance={4} />
      </mesh>

      {/* Dust particles orbiting the projectile */}
      {particles.current.map((particle, index) => (
        <mesh 
          key={index} 
          position={[
            meshRef.current ? meshRef.current.position.x + particle.position.x : startPosition.x,
            meshRef.current ? meshRef.current.position.y + particle.position.y : startPosition.y,
            meshRef.current ? meshRef.current.position.z + particle.position.z : startPosition.z
          ]}
          scale={particle.scale}
        >
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            color="#909090"
            transparent={true}
            opacity={particle.opacity * 0.7}
            roughness={1.0}
          />
        </mesh>
      ))}
    </group>
  );
}

interface ImpactProps {
  position: Vector3;
}

function PetrifyImpact({ position }: ImpactProps) {
  const [lifetime, setLifetime] = useState(2.5);
  const waveRef = useRef<THREE.Mesh>(null);
  const crystalsRef = useRef<THREE.Group>(null);
  const centralPillarRef = useRef<THREE.Mesh>(null);
  const [initialScale] = useState(() => 0.1 + Math.random() * 0.2);
  
  // Stone fragments that emerge from the ground
  const fragments = useRef<Array<{
    position: Vector3;
    rotation: Vector3;
    initialScale: number;
    targetScale: number;
    currentScale: number;
    velocity: Vector3;
    rotationSpeed: Vector3;
    riseDelay: number;
    lifetime: number;
    retreating: boolean;
  }>>([]);
  
  // Dust particles for the impact
  const dustParticles = useRef<Array<{
    position: Vector3;
    initialY: number;
    scale: number;
    opacity: number;
    velocity: Vector3;
    rotationSpeed: Vector3;
    rotation: Vector3;
    lifetime: number;
    maxLifetime: number;
  }>>([]);

  useEffect(() => {
    // Create stone fragments that emerge from the ground in a circular pattern
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const distance = 0.5 + Math.random() * 0.8;
      const delay = (distance / 2.0) * 0.5; // Outer fragments rise later
      
      fragments.current.push({
        position: new Vector3(
          position.x + Math.cos(angle) * distance,
          0, // Start at ground level
          position.z + Math.sin(angle) * distance
        ),
        rotation: new Vector3(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI
        ),
        initialScale: 0,
        targetScale: 0.1 + Math.random() * 0.2,
        currentScale: 0,
        velocity: new Vector3(0, 1 + Math.random() * 2, 0),
        rotationSpeed: new Vector3(
          Math.random() * 0.5,
          Math.random() * 0.5,
          Math.random() * 0.5
        ),
        riseDelay: delay,
        lifetime: 2.5,
        retreating: false
      });
    }
    
    // Create dust particles that burst outward
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const height = Math.random() * Math.PI - Math.PI / 2;
      const speed = 1 + Math.random() * 3;
      const maxLifetime = 1.0 + Math.random() * 1.0;
      
      const direction = new Vector3(
        Math.cos(angle) * Math.cos(height),
        Math.abs(Math.sin(height)) * 1.5, // Ensure dust goes upward
        Math.sin(angle) * Math.cos(height)
      ).normalize();
      
      dustParticles.current.push({
        position: position.clone().add(
          new Vector3(
            (Math.random() - 0.5) * 0.2,
            0,
            (Math.random() - 0.5) * 0.2
          )
        ),
        initialY: position.y,
        scale: 0.05 + Math.random() * 0.15,
        opacity: 0.5 + Math.random() * 0.5,
        velocity: direction.multiplyScalar(speed),
        rotationSpeed: new Vector3(
          Math.random() * 5,
          Math.random() * 5,
          Math.random() * 5
        ),
        rotation: new Vector3(
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2
        ),
        lifetime: maxLifetime,
        maxLifetime: maxLifetime
      });
    }
    
  }, [position]);
  
  useFrame((state, delta) => {
    const cappedDelta = Math.min(delta, 0.1); // Prevent large jumps in animation
    
    // Update lifetime
    setLifetime(prev => Math.max(0, prev - cappedDelta));
    
    // Expand stone wave on ground
    if (waveRef.current) {
      // Calculate wave scale based on lifetime (grows quickly, then slows)
      const waveProgress = 1 - (lifetime / 2.5);
      const waveScale = Math.min(4, waveProgress * 5);
      waveRef.current.scale.set(waveScale, 1, waveScale);
      
      // Adjust opacity to fade out over time
      if (waveRef.current.material instanceof THREE.Material) {
        (waveRef.current.material as THREE.MeshStandardMaterial).opacity = Math.max(0, lifetime * 0.4);
      }
    }
    
    // Rise and rotate central pillar
    if (centralPillarRef.current) {
      if (lifetime > 1.5) {
        // Rise from ground during first part of animation
        const riseProgress = (2.5 - lifetime) * 2; // 0 to 2
        const targetHeight = Math.min(0.8, riseProgress * 0.5);
        
        // Move position up
        centralPillarRef.current.position.y = targetHeight / 2;
        // Scale the height
        centralPillarRef.current.scale.y = targetHeight;
      } else {
        // Sink back into the ground during second part of animation
        const sinkProgress = (lifetime / 1.5); // 1 to 0
        const targetHeight = Math.max(0, sinkProgress * 0.8);
        
        // Move position down
        centralPillarRef.current.position.y = targetHeight / 2;
        // Scale the height
        centralPillarRef.current.scale.y = targetHeight;
      }
      
      // Rotate slowly
      centralPillarRef.current.rotation.y += cappedDelta * 0.8;
    }
    
    // Animate central crystals
    if (crystalsRef.current) {
      // Rotate crystal group
      crystalsRef.current.rotation.y += cappedDelta * 1.2;
      
      // Pulse scale
      const pulsePhase = Math.sin(state.clock.elapsedTime * 3) * 0.1 + 0.9;
      
      // Scale based on lifetime
      let scaleMultiplier;
      if (lifetime > 1.5) {
        // Growing
        scaleMultiplier = ((2.5 - lifetime) / 1.0) * pulsePhase;
      } else {
        // Shrinking
        scaleMultiplier = (lifetime / 1.5) * pulsePhase;
      }
      
      crystalsRef.current.scale.set(
        scaleMultiplier, 
        scaleMultiplier, 
        scaleMultiplier
      );
    }
    
    // Update stone fragments
    for (const fragment of fragments.current) {
      // Handle delay
      if (fragment.riseDelay > 0) {
        fragment.riseDelay -= cappedDelta;
        continue;
      }
      
      if (!fragment.retreating) {
        // Rising from the ground
        if (fragment.position.y < (0.3 + Math.random() * 0.3)) {
          fragment.position.addScaledVector(fragment.velocity, cappedDelta * 0.7);
          
          // Gradually grow to target size
          fragment.currentScale = MathUtils.lerp(
            fragment.currentScale,
            fragment.targetScale,
            cappedDelta * 5
          );
        } else {
          // Hover and rotate at peak
          fragment.position.y += Math.sin(state.clock.elapsedTime * 2) * cappedDelta * 0.05;
        }
        
        // Start retreating when lifetime is below threshold
        if (lifetime < 1.2) {
          fragment.retreating = true;
          // Reverse velocity for retreat
          fragment.velocity.multiplyScalar(-0.5);
        }
      } else {
        // Retreating back into ground
        if (fragment.position.y > 0) {
          fragment.position.addScaledVector(fragment.velocity, cappedDelta * 1.5);
          
          // Shrink as it retreats
          fragment.currentScale = MathUtils.lerp(
            fragment.currentScale,
            0,
            cappedDelta * 4
          );
        }
      }
      
      // Apply rotation
      fragment.rotation.x += fragment.rotationSpeed.x * cappedDelta;
      fragment.rotation.y += fragment.rotationSpeed.y * cappedDelta;
      fragment.rotation.z += fragment.rotationSpeed.z * cappedDelta;
    }
    
    // Update dust particles
    for (let i = dustParticles.current.length - 1; i >= 0; i--) {
      const dust = dustParticles.current[i];
      
      // Apply gravity
      dust.velocity.y -= cappedDelta * 3;
      
      // Update position
      dust.position.addScaledVector(dust.velocity, cappedDelta);
      
      // Update rotation
      dust.rotation.x += dust.rotationSpeed.x * cappedDelta;
      dust.rotation.y += dust.rotationSpeed.y * cappedDelta;
      dust.rotation.z += dust.rotationSpeed.z * cappedDelta;
      
      // Update lifetime
      dust.lifetime -= cappedDelta;
      
      // Update opacity based on lifetime
      dust.opacity = Math.max(0, dust.lifetime / dust.maxLifetime) * 0.5;
      
      // Remove dead particles
      if (dust.lifetime <= 0) {
        dustParticles.current.splice(i, 1);
      }
    }
  });
  
  if (lifetime <= 0) return null;
  
  return (
    <group>
      {/* Ground circular wave that expands outward */}
      <mesh 
        ref={waveRef} 
        position={[position.x, 0.02, position.z]} 
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[0.2, 0.7, 32]} />
        <meshStandardMaterial
          color="#757575"
          transparent={true}
          opacity={0.6}
          depthWrite={false}
        />
      </mesh>
      
      {/* Central pillar of stone that rises up */}
      <mesh
        ref={centralPillarRef}
        position={[position.x, 0, position.z]}
        scale={[0.4, 0, 0.4]}
      >
        <cylinderGeometry args={[1, 1.3, 1, 6, 1]} />
        <meshStandardMaterial
          color="#5a5a5a"
          roughness={0.9}
          metalness={0.2}
        />
      </mesh>
      
      {/* Crystal formation at the center */}
      <group
        ref={crystalsRef}
        position={[position.x, 0.4, position.z]}
      >
        <mesh rotation={[0.5, 0, 0.3]}>
          <octahedronGeometry args={[0.3, 0]} />
          <meshStandardMaterial
            color="#444444"
            emissive="#a0a0a0"
            emissiveIntensity={0.2}
            roughness={0.7}
            metalness={0.3}
          />
        </mesh>
        
        <mesh position={[0.1, 0.15, 0]} rotation={[-0.3, 0.5, 0.1]}>
          <octahedronGeometry args={[0.2, 0]} />
          <meshStandardMaterial
            color="#555555"
            emissive="#a0a0a0"
            emissiveIntensity={0.2}
            roughness={0.7}
            metalness={0.3}
          />
        </mesh>
        
        <mesh position={[-0.15, 0.08, 0.05]} rotation={[0.2, -0.3, 0.5]}>
          <octahedronGeometry args={[0.25, 0]} />
          <meshStandardMaterial
            color="#505050"
            emissive="#a0a0a0"
            emissiveIntensity={0.2}
            roughness={0.7}
            metalness={0.3}
          />
        </mesh>
      </group>
      
      {/* Initial flash */}
      <mesh position={[position.x, position.y, position.z]}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshStandardMaterial
          emissive="#ffffff"
          emissiveIntensity={2}
          color="#aaaaaa"
          transparent={true}
          opacity={Math.min(1, lifetime * 5)}
        />
        <pointLight color="#ffffff" intensity={Math.min(3, lifetime * 10)} distance={5} decay={2} />
      </mesh>
      
      {/* Stone fragments rising from ground */}
      {fragments.current.map((fragment, index) => (
        <mesh
          key={`fragment-${index}`}
          position={fragment.position}
          rotation={[fragment.rotation.x, fragment.rotation.y, fragment.rotation.z]}
          scale={fragment.currentScale}
        >
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            color={`rgb(${70 + Math.floor(Math.random() * 30)}, ${70 + Math.floor(Math.random() * 30)}, ${70 + Math.floor(Math.random() * 30)})`}
            roughness={0.9}
            metalness={0.1}
          />
        </mesh>
      ))}
      
      {/* Dust particles */}
      {dustParticles.current.map((dust, index) => (
        <mesh
          key={`dust-${index}`}
          position={dust.position}
          rotation={[dust.rotation.x, dust.rotation.y, dust.rotation.z]}
          scale={dust.scale}
        >
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            color="#808080"
            transparent={true}
            opacity={dust.opacity}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}