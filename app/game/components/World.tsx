'use client';

import { RigidBody } from '@react-three/rapier';
import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { useGameStore } from '../systems/gameStore';
import { zoneManager, GAME_ZONES } from '../systems/zoneSystem';
import * as THREE from 'three';

export default function World() {
  const terrainRef = useRef<THREE.Mesh>(null);
  const updatePlayerZone = useGameStore(state => state.updatePlayerZone);
  
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
        >
          <planeGeometry args={[1000, 1000, 64, 64]} />
          <meshStandardMaterial 
            color="#3a7e4c" 
            roughness={0.8}
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
            >
              {zone.name}
              {`\nLevel ${zone.minLevel}-${zone.maxLevel}`}
            </Text>
          </Billboard>
        </group>
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

// Helper component to create a forest with customizable spread
function Forest({ position = [0, 0, 0], count = 5, spread = 40 }) {
  const trees = [];
  
  for (let i = 0; i < count; i++) {
    const x = position[0] + (Math.random() - 0.5) * spread;
    const z = position[2] + (Math.random() - 0.5) * spread;
    
    trees.push(
      <Tree key={`tree-${i}`} position={[x, position[1], z]} scale={1.5 + Math.random() * 1.0} />
    );
  }
  
  return <group>{trees}</group>;
}

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

// Rock formation component with customizable spread
function Rocks({ position = [0, 0, 0], count = 3, spread = 20 }) {
  const rocks = [];
  
  for (let i = 0; i < count; i++) {
    const x = position[0] + (Math.random() - 0.5) * spread;
    const z = position[2] + (Math.random() - 0.5) * spread;
    const scale = 1.0 + Math.random() * 1.5; // Larger rocks
    
    rocks.push(
      <RigidBody key={`rock-${i}`} type="fixed" position={[x, position[1], z]}>
        <mesh castShadow>
          <dodecahedronGeometry args={[scale, 0]} />
          <meshStandardMaterial color="#808080" roughness={0.8} />
        </mesh>
      </RigidBody>
    );
  }
  
  return <group>{rocks}</group>;
}

// Larger boulders with more diverse shapes
function BoulderField({ position = [0, 0, 0], count = 5, spread = 30 }) {
  const boulders = [];
  
  for (let i = 0; i < count; i++) {
    const x = position[0] + (Math.random() - 0.5) * spread;
    const z = position[2] + (Math.random() - 0.5) * spread;
    const scale = 2.0 + Math.random() * 2.5; // Much larger than regular rocks
    const rotationY = Math.random() * Math.PI * 2;
    
    // Choose between different boulder shapes
    const shape = Math.floor(Math.random() * 3);
    
    boulders.push(
      <RigidBody key={`boulder-${i}`} type="fixed" position={[x, position[1] + scale/3, z]}>
        <mesh castShadow rotation={[Math.random() * 0.3, rotationY, Math.random() * 0.3]}>
          {shape === 0 && <icosahedronGeometry args={[scale, 0]} />}
          {shape === 1 && <octahedronGeometry args={[scale, 0]} />}
          {shape === 2 && <boxGeometry args={[scale, scale * 0.7, scale * 0.9]} />}
          <meshStandardMaterial color="#615e5d" roughness={0.9} />
        </mesh>
      </RigidBody>
    );
  }
  
  return <group>{boulders}</group>;
}

// Bushes and small vegetation
function Bushes({ position = [0, 0, 0], count = 15, spread = 30 }) {
  const bushes = [];
  
  for (let i = 0; i < count; i++) {
    const x = position[0] + (Math.random() - 0.5) * spread;
    const z = position[2] + (Math.random() - 0.5) * spread;
    const scale = 0.5 + Math.random() * 1.0;
    const rotationY = Math.random() * Math.PI * 2;
    
    // Randomize bush color slightly
    const greenHue = 0.3 + Math.random() * 0.1;
    const colorVariation = Math.random() * 0.2;
    const color = `rgb(${Math.floor((0.15 + colorVariation) * 255)}, 
                      ${Math.floor((greenHue + colorVariation) * 255)}, 
                      ${Math.floor((0.15 + colorVariation) * 255)})`;
    
    bushes.push(
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
  
  return <group>{bushes}</group>;
}

// Fallen logs scattered in the forest
function FallenLogs({ position = [0, 0, 0], count = 5, spread = 30 }) {
  const logs = [];
  
  for (let i = 0; i < count; i++) {
    const x = position[0] + (Math.random() - 0.5) * spread;
    const z = position[2] + (Math.random() - 0.5) * spread;
    const scaleX = 0.5 + Math.random() * 0.3;
    const scaleZ = 0.5 + Math.random() * 0.3;
    const length = 3 + Math.random() * 5;
    const rotationY = Math.random() * Math.PI * 2;
    
    logs.push(
      <RigidBody key={`log-${i}`} type="fixed" position={[x, position[1], z]}>
        <group rotation={[0, rotationY, Math.random() * 0.3 - 0.15]}>
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
  
  return <group>{logs}</group>;
}

// Hills and elevated terrain
function Hill({ position = [0, 0, 0], radius = 30, height = 10 }) {
  return (
    <RigidBody type="fixed" position={[position[0], position[1], position[2]]}>
      <mesh castShadow receiveShadow>
        <coneGeometry args={[radius, height, 32]} />
        <meshStandardMaterial color="#4a8f5c" roughness={0.8} />
      </mesh>
    </RigidBody>
  );
}