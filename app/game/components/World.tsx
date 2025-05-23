'use client';

import { RigidBody } from '@react-three/rapier';
import { useRef, memo, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { useGameStore } from '../systems/gameStore';
import { GAME_ZONES } from '../systems/zoneSystem';
import * as THREE from 'three';
import Loot from './Loot';

// Optimize the Loot component with memo to prevent unnecessary re-renders
const MemoizedLoot = memo(Loot);

export default function World() {
  const terrainRef = useRef<THREE.Mesh>(null);
  const updatePlayerZone = useGameStore(state => state.updatePlayerZone);
  // Subscribe to groundLoot changes
  const groundLoot = useGameStore(state => state.groundLoot);
  
  // Update player's current zone
  useFrame(() => {
    updatePlayerZone();
  });
  
  return (
    <>
      {/* Ground - Expanded to 10x size */}
      <RigidBody type="fixed" colliders="trimesh">
        <mesh 
          ref={terrainRef} 
          position={[0, -0.5, 0]} 
          rotation={[-Math.PI / 2, 0, 0]} 
          receiveShadow
          userData={{ groundPlane: true }}
        >
          <planeGeometry args={[1000, 1000, 64, 64]} />
          <meshStandardMaterial 
            color="#3a7e4c" 
            roughness={0.8}
            side={THREE.DoubleSide} // Render both sides to ensure visibility
          />
        </mesh>
      </RigidBody>
      
      {/* Zone Markers */}
      {GAME_ZONES.map(zone => (
        <group key={zone.id}>
          {/* Zone boundary indicator - semi-transparent circle */}
          <mesh 
            position={[zone.position.x, 0.1, zone.position.z]} 
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <circleGeometry args={[zone.radius, 32]} />
            <meshBasicMaterial 
              color={getZoneColor(zone.id)} 
              transparent 
              opacity={0.1} 
            />
          </mesh>
          
          {/* Zone name text - Raised higher and made smaller */}
          <Billboard 
            position={[zone.position.x, 8, zone.position.z]}
            follow={true}
            lockX={false}
            lockY={false}
            lockZ={false}
          >
            <Text
              color="white"
              fontSize={3}
              outlineWidth={0.3}
              outlineColor="black"
              textAlign="center"
              material-transparent
              material-opacity={0.7}
            >
              {zone.name}
              {`\nLevel ${zone.minLevel}-${zone.maxLevel}`}
            </Text>
          </Billboard>
        </group>
      ))}
      
      {/* Ground Loot Items - Render outside of zone loop for proper subscription */}
      {Object.entries(groundLoot).map(([lootId, lootData]) => (
        <MemoizedLoot 
          key={lootId} 
          lootId={lootId} 
          position={lootData.position} 
          items={lootData.items} 
        />
      ))}
      
      {/* Environmental Objects */}
      <group>
        {/* Distribute environmental objects based on zones */}
        {GAME_ZONES.map(zone => (
          <group key={`env-${zone.id}`}>
            {zone.id === 'dark_forest' && (
              <Forest 
                position={[zone.position.x, 0, zone.position.z]} 
                count={50} 
                spread={zone.radius * 0.8} 
              />
            )}
            
            {zone.id === 'rocky_highlands' && (
              <>
                <Rocks 
                  position={[zone.position.x, 0, zone.position.z]} 
                  count={20} 
                  spread={zone.radius * 0.7} 
                />
                <BoulderField 
                  position={[zone.position.x, 0, zone.position.z]} 
                  count={15} 
                  spread={zone.radius * 0.6} 
                />
              </>
            )}
            
            {zone.id === 'misty_lake' && (
              <>
                <mesh 
                  position={[zone.position.x, -0.2, zone.position.z]} 
                  rotation={[-Math.PI / 2, 0, 0]}
                >
                  <circleGeometry args={[zone.radius * 0.6, 32]} />
                  <meshStandardMaterial 
                    color="#0077be" 
                    transparent 
                    opacity={0.8} 
                  />
                </mesh>
                <Bushes 
                  position={[zone.position.x, 0, zone.position.z]} 
                  count={30} 
                  spread={zone.radius * 0.8} 
                />
              </>
            )}
            
            {zone.id === 'starter_meadow' && (
              <>
                <Forest 
                  position={[zone.position.x, 0, zone.position.z]} 
                  count={20} 
                  spread={zone.radius * 0.7} 
                />
                <Bushes 
                  position={[zone.position.x, 0, zone.position.z]} 
                  count={40} 
                  spread={zone.radius * 0.8} 
                />
                <FallenLogs 
                  position={[zone.position.x, 0, zone.position.z]} 
                  count={8} 
                  spread={zone.radius * 0.6} 
                />
              </>
            )}
          </group>
        ))}
      </group>
    </>
  );
}

// Helper function to get color for zone visualization
function getZoneColor(zoneId: string): string {
  const colors: { [key: string]: string } = {
    starter_meadow: '#90EE90',    // Light green
    dark_forest: '#228B22',       // Forest green
    rocky_highlands: '#A0522D',   // Brown
    misty_lake: '#4682B4',        // Steel blue
    cursed_ruins: '#800080',      // Purple
    dragon_peaks: '#FF4500',      // Red-Orange
    shadow_valley: '#483D8B',     // Dark slate blue
    crystal_caverns: '#00CED1'    // Turquoise
  };
  return colors[zoneId] || '#FFFFFF';
}

// Helper component to create a forest with customizable spread - Memoized to prevent re-creation
const Forest = memo<{ position?: number[]; count?: number; spread?: number }>(({ position = [0, 0, 0], count = 5, spread = 40 }) => {
  // Use stable tree positions based on position and count
  const trees = useMemo(() => {
    // Use position as seed for consistent tree placement
    const seed = position[0] + position[2] + count;
    const result = [];
    
    for (let i = 0; i < count; i++) {
      // Create deterministic "random" positions based on seed
      const pseudoRandom1 = Math.sin(seed + i * 12.9898) * 43758.5453;
      const pseudoRandom2 = Math.sin(seed + i * 78.233) * 43758.5453;
      const pseudoRandom3 = Math.sin(seed + i * 37.719) * 43758.5453;
      
      const x = position[0] + (pseudoRandom1 - Math.floor(pseudoRandom1) - 0.5) * spread;
      const z = position[2] + (pseudoRandom2 - Math.floor(pseudoRandom2) - 0.5) * spread;
      const scale = 1.5 + (pseudoRandom3 - Math.floor(pseudoRandom3)) * 1.0;
      
      result.push(
        <Tree key={`tree-${i}`} position={[x, position[1], z]} scale={scale} />
      );
    }
    
    return result;
  }, [position, count, spread]);
  
  return <group>{trees}</group>;
});

Forest.displayName = 'Forest';

// Simple tree component - Made slightly larger
function Tree({ position = [0, 0, 0], scale = 1 }) {
  return (
    <group position={[position[0], position[1], position[2]]} scale={scale}>
      {/* Tree trunk */}
      <mesh position={[0, 1, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.4, 2]} />
        <meshStandardMaterial color="#8B4513" />
      </mesh>
      
      {/* Tree foliage */}
      <mesh position={[0, 3, 0]} castShadow>
        <coneGeometry args={[1.5, 3, 8]} />
        <meshStandardMaterial color="#2e8b57" />
      </mesh>
    </group>
  );
}

// Rock formation component with customizable spread - Memoized
const Rocks = memo<{ position?: number[]; count?: number; spread?: number }>(({ position = [0, 0, 0], count = 3, spread = 20 }) => {
  const rocks = useMemo(() => {
    const seed = position[0] + position[2] + count + 1000; // Different seed offset
    const result = [];
    
    for (let i = 0; i < count; i++) {
      const pseudoRandom1 = Math.sin(seed + i * 12.9898) * 43758.5453;
      const pseudoRandom2 = Math.sin(seed + i * 78.233) * 43758.5453;
      const pseudoRandom3 = Math.sin(seed + i * 37.719) * 43758.5453;
      
      const x = position[0] + (pseudoRandom1 - Math.floor(pseudoRandom1) - 0.5) * spread;
      const z = position[2] + (pseudoRandom2 - Math.floor(pseudoRandom2) - 0.5) * spread;
      const scale = 1.0 + (pseudoRandom3 - Math.floor(pseudoRandom3)) * 1.5;
      
      result.push(
        <RigidBody key={`rock-${i}`} type="fixed" position={[x, position[1], z]}>
          <mesh castShadow>
            <dodecahedronGeometry args={[scale, 0]} />
            <meshStandardMaterial color="#808080" roughness={0.8} />
          </mesh>
        </RigidBody>
      );
    }
    
    return result;
  }, [position, count, spread]);
  
  return <group>{rocks}</group>;
});

Rocks.displayName = 'Rocks';

// Larger boulders with more diverse shapes - Memoized
const BoulderField = memo<{ position?: number[]; count?: number; spread?: number }>(({ position = [0, 0, 0], count = 5, spread = 30 }) => {
  const boulders = useMemo(() => {
    const seed = position[0] + position[2] + count + 2000; // Different seed offset
    const result = [];
    
    for (let i = 0; i < count; i++) {
      const pseudoRandom1 = Math.sin(seed + i * 12.9898) * 43758.5453;
      const pseudoRandom2 = Math.sin(seed + i * 78.233) * 43758.5453;
      const pseudoRandom3 = Math.sin(seed + i * 37.719) * 43758.5453;
      const pseudoRandom4 = Math.sin(seed + i * 41.233) * 43758.5453;
      const pseudoRandom5 = Math.sin(seed + i * 53.719) * 43758.5453;
      
      const x = position[0] + (pseudoRandom1 - Math.floor(pseudoRandom1) - 0.5) * spread;
      const z = position[2] + (pseudoRandom2 - Math.floor(pseudoRandom2) - 0.5) * spread;
      const scale = 2.0 + (pseudoRandom3 - Math.floor(pseudoRandom3)) * 2.5;
      const rotationY = (pseudoRandom4 - Math.floor(pseudoRandom4)) * Math.PI * 2;
      const shape = Math.floor((pseudoRandom5 - Math.floor(pseudoRandom5)) * 3);
      
      result.push(
        <RigidBody key={`boulder-${i}`} type="fixed" position={[x, position[1] + scale/3, z]}>
          <mesh castShadow rotation={[(pseudoRandom1 - Math.floor(pseudoRandom1)) * 0.3, rotationY, (pseudoRandom2 - Math.floor(pseudoRandom2)) * 0.3]}>
            {shape === 0 && <icosahedronGeometry args={[scale, 0]} />}
            {shape === 1 && <octahedronGeometry args={[scale, 0]} />}
            {shape === 2 && <boxGeometry args={[scale, scale * 0.7, scale * 0.9]} />}
            <meshStandardMaterial color="#615e5d" roughness={0.9} />
          </mesh>
        </RigidBody>
      );
    }
    
    return result;
  }, [position, count, spread]);
  
  return <group>{boulders}</group>;
});

BoulderField.displayName = 'BoulderField';

// Bushes and small vegetation - Memoized
const Bushes = memo<{ position?: number[]; count?: number; spread?: number }>(({ position = [0, 0, 0], count = 15, spread = 30 }) => {
  const bushes = useMemo(() => {
    const seed = position[0] + position[2] + count + 3000; // Different seed offset
    const result = [];
    
    for (let i = 0; i < count; i++) {
      const pseudoRandom1 = Math.sin(seed + i * 12.9898) * 43758.5453;
      const pseudoRandom2 = Math.sin(seed + i * 78.233) * 43758.5453;
      const pseudoRandom3 = Math.sin(seed + i * 37.719) * 43758.5453;
      const pseudoRandom4 = Math.sin(seed + i * 41.233) * 43758.5453;
      const pseudoRandom5 = Math.sin(seed + i * 53.719) * 43758.5453;
      
      const x = position[0] + (pseudoRandom1 - Math.floor(pseudoRandom1) - 0.5) * spread;
      const z = position[2] + (pseudoRandom2 - Math.floor(pseudoRandom2) - 0.5) * spread;
      const scale = 0.5 + (pseudoRandom3 - Math.floor(pseudoRandom3)) * 1.0;
      const rotationY = (pseudoRandom4 - Math.floor(pseudoRandom4)) * Math.PI * 2;
      const colorVariation = (pseudoRandom5 - Math.floor(pseudoRandom5)) * 0.2;
      
      const greenHue = 0.3 + (pseudoRandom1 - Math.floor(pseudoRandom1)) * 0.1;
      const color = `rgb(${Math.floor((0.15 + colorVariation) * 255)}, 
                        ${Math.floor((greenHue + colorVariation) * 255)}, 
                        ${Math.floor((0.15 + colorVariation) * 255)})`;
      
      result.push(
        <group key={`bush-${i}`} position={[x, position[1], z]} rotation={[0, rotationY, 0]} scale={scale}>
          <mesh position={[0, 0.4, 0]} castShadow>
            <sphereGeometry args={[0.8, 8, 8]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
          <mesh position={[0.4, 0.6, 0.4]} castShadow>
            <sphereGeometry args={[0.6, 8, 8]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
          <mesh position={[-0.4, 0.5, 0.2]} castShadow>
            <sphereGeometry args={[0.7, 8, 8]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
        </group>
      );
    }
    
    return result;
  }, [position, count, spread]);
  
  return <group>{bushes}</group>;
});

Bushes.displayName = 'Bushes';

// Fallen logs scattered in the forest - Memoized
const FallenLogs = memo<{ position?: number[]; count?: number; spread?: number }>(({ position = [0, 0, 0], count = 5, spread = 30 }) => {
  const logs = useMemo(() => {
    const seed = position[0] + position[2] + count + 4000; // Different seed offset
    const result = [];
    
    for (let i = 0; i < count; i++) {
      const pseudoRandom1 = Math.sin(seed + i * 12.9898) * 43758.5453;
      const pseudoRandom2 = Math.sin(seed + i * 78.233) * 43758.5453;
      const pseudoRandom3 = Math.sin(seed + i * 37.719) * 43758.5453;
      const pseudoRandom4 = Math.sin(seed + i * 41.233) * 43758.5453;
      const pseudoRandom5 = Math.sin(seed + i * 53.719) * 43758.5453;
      const pseudoRandom6 = Math.sin(seed + i * 67.341) * 43758.5453;
      
      const x = position[0] + (pseudoRandom1 - Math.floor(pseudoRandom1) - 0.5) * spread;
      const z = position[2] + (pseudoRandom2 - Math.floor(pseudoRandom2) - 0.5) * spread;
      const scaleX = 0.5 + (pseudoRandom3 - Math.floor(pseudoRandom3)) * 0.3;
      const scaleZ = 0.5 + (pseudoRandom4 - Math.floor(pseudoRandom4)) * 0.3;
      const length = 3 + (pseudoRandom5 - Math.floor(pseudoRandom5)) * 5;
      const rotationY = (pseudoRandom6 - Math.floor(pseudoRandom6)) * Math.PI * 2;
      
      result.push(
        <RigidBody key={`log-${i}`} type="fixed" position={[x, position[1], z]}>
          <group rotation={[0, rotationY, (pseudoRandom1 - Math.floor(pseudoRandom1)) * 0.3 - 0.15]}>
            {/* Log body */}
            <mesh position={[0, 0.5 * scaleZ, 0]} castShadow>
              <cylinderGeometry args={[scaleX, scaleX, length, 8]} />
              <mesh rotation={[0, 0, Math.PI / 2]} />
              <meshStandardMaterial color="#654321" roughness={0.9} />
            </mesh>
            
            {/* End caps */}
            <mesh position={[length/2, 0.5 * scaleZ, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <circleGeometry args={[scaleX, 8]} />
              <meshStandardMaterial color="#5a3a1a" roughness={0.95} />
            </mesh>
            
            <mesh position={[-length/2, 0.5 * scaleZ, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
              <circleGeometry args={[scaleX, 8]} />
              <meshStandardMaterial color="#5a3a1a" roughness={0.95} />
            </mesh>
          </group>
        </RigidBody>
      );
    }
    
    return result;
  }, [position, count, spread]);
  
  return <group>{logs}</group>;
});

FallenLogs.displayName = 'FallenLogs';
