'use client';

import React, { useRef, useEffect, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { WeatherCondition } from '../systems/weatherEventSystem';

interface WeatherEffectsProps {
  weather: WeatherCondition | null;
  playerPosition?: { x: number; y: number; z: number };
}

const WeatherEffects = memo<WeatherEffectsProps>(function WeatherEffects({ 
  weather, 
  playerPosition = { x: 0, y: 0, z: 0 } 
}) {
  const particlesRef = useRef<THREE.Points>(null);
  
  // Generate particles based on weather type
  const particles = React.useMemo(() => {
    if (!weather?.visualEffects.particles) return null;

    const { particles: particleConfig } = weather.visualEffects;
    const count = Math.floor(particleConfig.density * 1000);
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      
      // Position particles around the player
      positions[i3] = playerPosition.x + (Math.random() - 0.5) * 200;
      positions[i3 + 1] = Math.random() * 50 + 10;
      positions[i3 + 2] = playerPosition.z + (Math.random() - 0.5) * 200;

      // Set velocities based on particle type
      switch (particleConfig.type) {
        case 'rain':
          velocities[i3] = (Math.random() - 0.5) * 2;
          velocities[i3 + 1] = -particleConfig.speed * (0.8 + Math.random() * 0.4);
          velocities[i3 + 2] = (Math.random() - 0.5) * 2;
          break;
        case 'snow':
          velocities[i3] = (Math.random() - 0.5) * 3;
          velocities[i3 + 1] = -particleConfig.speed * 0.5 * (0.5 + Math.random() * 0.5);
          velocities[i3 + 2] = (Math.random() - 0.5) * 3;
          break;
        case 'ash':
          velocities[i3] = (Math.random() - 0.5) * 4;
          velocities[i3 + 1] = -particleConfig.speed * 0.3 * (0.3 + Math.random() * 0.7);
          velocities[i3 + 2] = (Math.random() - 0.5) * 4;
          break;
        case 'sparkles':
          velocities[i3] = (Math.random() - 0.5) * 1;
          velocities[i3 + 1] = (Math.random() - 0.5) * 2;
          velocities[i3 + 2] = (Math.random() - 0.5) * 1;
          break;
        case 'mist':
          velocities[i3] = (Math.random() - 0.5) * 2;
          velocities[i3 + 1] = Math.random() * 2;
          velocities[i3 + 2] = (Math.random() - 0.5) * 2;
          break;
        default:
          velocities[i3] = 0;
          velocities[i3 + 1] = -5;
          velocities[i3 + 2] = 0;
      }
    }

    return { positions, velocities, count };
  }, [weather, playerPosition]);

  // Update particles animation
  useFrame((state, delta) => {
    if (!particles || !particlesRef.current || !weather?.visualEffects.particles) return;

    const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
    const { velocities } = particles;
    const { particles: particleConfig } = weather.visualEffects;

    for (let i = 0; i < particles.count; i++) {
      const i3 = i * 3;
      
      // Update positions
      positions[i3] += velocities[i3] * delta;
      positions[i3 + 1] += velocities[i3 + 1] * delta;
      positions[i3 + 2] += velocities[i3 + 2] * delta;

      // Reset particles that fall below ground or move too far
      if (positions[i3 + 1] < 0 || 
          Math.abs(positions[i3] - playerPosition.x) > 100 ||
          Math.abs(positions[i3 + 2] - playerPosition.z) > 100) {
        
        positions[i3] = playerPosition.x + (Math.random() - 0.5) * 200;
        positions[i3 + 1] = Math.random() * 50 + 10;
        positions[i3 + 2] = playerPosition.z + (Math.random() - 0.5) * 200;
      }

      // Special behavior for sparkles and mist
      if (particleConfig.type === 'sparkles') {
        positions[i3 + 1] += Math.sin(state.clock.elapsedTime * 2 + i) * 0.5 * delta;
      } else if (particleConfig.type === 'mist') {
        positions[i3] += Math.sin(state.clock.elapsedTime * 0.5 + i) * 0.2 * delta;
        positions[i3 + 2] += Math.cos(state.clock.elapsedTime * 0.5 + i) * 0.2 * delta;
      }
    }

    particlesRef.current.geometry.attributes.position.needsUpdate = true;
  });

  // Update scene fog and lighting effects
  useEffect(() => {
    if (!weather) return;

    let scene = particlesRef.current?.parent;
    while (scene && scene.type !== 'Scene') {
      scene = scene.parent;
    }
    
    if (scene) {
      const sceneTyped = scene as THREE.Scene;
      
      // Update fog
      if (weather.visualEffects.fogDensity > 0) {
        sceneTyped.fog = new THREE.Fog(
          weather.visualEffects.fogColor,
          50,
          200 / weather.visualEffects.fogDensity
        );
      } else {
        sceneTyped.fog = null;
      }

      // Update background color
      sceneTyped.background = new THREE.Color(weather.visualEffects.skyColor);
    }
  }, [weather]);

  if (!weather?.visualEffects.particles || !particles) {
    return null;
  }

  const getParticleSize = (type: string) => {
    switch (type) {
      case 'rain': return 0.1;
      case 'snow': return 0.3;
      case 'ash': return 0.2;
      case 'sparkles': return 0.15;
      case 'mist': return 0.5;
      default: return 0.2;
    }
  };

  const getParticleOpacity = (type: string) => {
    switch (type) {
      case 'rain': return 0.8;
      case 'snow': return 0.9;
      case 'ash': return 0.7;
      case 'sparkles': return 0.9;
      case 'mist': return 0.3;
      default: return 0.7;
    }
  };

  return (
    <Points ref={particlesRef as any} positions={particles.positions}>
      <PointMaterial
        color={weather.visualEffects.particles.color}
        size={getParticleSize(weather.visualEffects.particles.type)}
        transparent
        opacity={getParticleOpacity(weather.visualEffects.particles.type)}
        sizeAttenuation
        depthWrite={false}
        blending={weather.visualEffects.particles.type === 'sparkles' ? THREE.AdditiveBlending : THREE.NormalBlending}
      />
    </Points>
  );
});

// Lightning effect component for storms
const LightningEffect = memo<{ intensity: number }>(function LightningEffect({ intensity }) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  
  useFrame(() => {
    if (!lightRef.current) return;
    
    // Random lightning flashes
    if (Math.random() < 0.001 * intensity) {
      lightRef.current.intensity = 3;
      setTimeout(() => {
        if (lightRef.current) {
          lightRef.current.intensity = 0;
        }
      }, 100 + Math.random() * 200);
    }
  });

  return (
    <directionalLight
      ref={lightRef}
      position={[0, 100, 0]}
      intensity={0}
      color="#ADD8E6"
      castShadow={false}
    />
  );
});

// Wind effect component for visual atmosphere
const WindEffect = memo<{ strength: number; direction: [number, number, number] }>(function WindEffect({ 
  strength, 
  direction 
}) {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (!groupRef.current) return;
    
    // Simulate wind by gently rotating the entire environment
    // Use direction to influence the rotation axis
    const [dx, dy, dz] = direction;
    groupRef.current.rotation.y += Math.sin(state.clock.elapsedTime * 0.1) * strength * 0.001 * dx;
    groupRef.current.rotation.x += Math.cos(state.clock.elapsedTime * 0.1) * strength * 0.0005 * dy;
    groupRef.current.rotation.z += Math.sin(state.clock.elapsedTime * 0.15) * strength * 0.0003 * dz;
  });

  return <group ref={groupRef} />;
});

// Main weather system component
const WeatherSystem = memo<WeatherEffectsProps>(function WeatherSystem({ 
  weather, 
  playerPosition 
}) {
  if (!weather) return null;

  const isStorm = weather.id === 'heavy_storm';
  const windStrength = weather.effects.movementSpeed < 1 ? (1 - weather.effects.movementSpeed) * 2 : 0;

  return (
    <group>
      <WeatherEffects weather={weather} playerPosition={playerPosition} />
      {isStorm && <LightningEffect intensity={1} />}
      {windStrength > 0 && <WindEffect strength={windStrength} direction={[1, 0, 1]} />}
      
      {/* Ambient light adjustment based on weather */}
      <ambientLight 
        intensity={weather.visualEffects.lightIntensity * 0.3} 
        color={weather.visualEffects.skyColor} 
      />
    </group>
  );
});

export default WeatherSystem;
