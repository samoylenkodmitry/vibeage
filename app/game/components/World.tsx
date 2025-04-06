'use client';

import { RigidBody } from '@react-three/rapier';
import { useRef } from 'react';

export default function World() {
  const terrainRef = useRef<THREE.Mesh>(null);
  
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
      
      {/* Environmental Objects - Trees, Rocks, etc - Distributed across larger area */}
      <group>
        {/* Forest areas - More forests with higher density */}
        <Forest position={[150, 0, 150]} count={40} spread={50} />
        <Forest position={[-150, 0, -150]} count={35} spread={40} />
        <Forest position={[200, 0, -200]} count={50} spread={60} />
        <Forest position={[-200, 0, 200]} count={35} spread={45} />
        <Forest position={[0, 0, 300]} count={45} spread={70} />
        <Forest position={[-300, 0, 0]} count={40} spread={55} />
        <Forest position={[300, 0, -300]} count={38} spread={50} />
        <Forest position={[-250, 0, -350]} count={40} spread={60} />
        <Forest position={[100, 0, -50]} count={30} spread={40} />
        <Forest position={[-80, 0, 80]} count={25} spread={30} />
        <Forest position={[40, 0, 120]} count={20} spread={25} />
        
        {/* Dense forest patches - very high tree density */}
        <Forest position={[75, 0, 75]} count={25} spread={15} />
        <Forest position={[-180, 0, -90]} count={30} spread={20} />
        
        {/* Rocks - More rock formations across the map */}
        <Rocks position={[50, 0, -100]} count={15} spread={30} />
        <Rocks position={[-80, 0, 120]} count={12} spread={25} />
        <Rocks position={[180, 0, 220]} count={18} spread={40} />
        <Rocks position={[-220, 0, -180]} count={14} spread={35} />
        <Rocks position={[350, 0, 100]} count={20} spread={45} />
        <Rocks position={[-100, 0, 350]} count={16} spread={38} />
        <Rocks position={[0, 0, 0]} count={8} spread={25} />
        <Rocks position={[120, 0, -160]} count={10} spread={20} />
        <Rocks position={[-300, 0, 150]} count={12} spread={30} />
        
        {/* Rock clusters - tightly grouped stones */}
        <Rocks position={[25, 0, 60]} count={6} spread={5} />
        <Rocks position={[-120, 0, -80]} count={8} spread={8} />
        <Rocks position={[200, 0, -50]} count={7} spread={6} />
        
        {/* Boulder fields */}
        <BoulderField position={[100, 0, 200]} count={15} spread={40} />
        <BoulderField position={[-150, 0, -250]} count={12} spread={35} />
        
        {/* Bushes and small vegetation */}
        <Bushes position={[30, 0, 80]} count={30} spread={40} />
        <Bushes position={[-70, 0, -40]} count={25} spread={35} />
        <Bushes position={[120, 0, -90]} count={35} spread={50} />
        <Bushes position={[-200, 0, 150]} count={40} spread={60} />
        <Bushes position={[180, 0, 80]} count={20} spread={30} />
        
        {/* Fallen logs */}
        <FallenLogs position={[60, 0, 120]} count={8} spread={40} />
        <FallenLogs position={[-100, 0, -150]} count={10} spread={50} />
      </group>
      
      {/* Water bodies - Larger lakes and more of them */}
      <mesh position={[200, -0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#0077be" transparent opacity={0.8} />
      </mesh>
      
      <mesh position={[-150, -0.2, 250]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[120, 80]} />
        <meshStandardMaterial color="#0077be" transparent opacity={0.8} />
      </mesh>
      
      <mesh position={[300, -0.2, -280]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[150, 150]} />
        <meshStandardMaterial color="#0077be" transparent opacity={0.8} />
      </mesh>
      
      {/* Small ponds */}
      <mesh position={[50, -0.25, 100]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[20, 24]} />
        <meshStandardMaterial color="#0077be" transparent opacity={0.8} />
      </mesh>
      
      <mesh position={[-80, -0.25, -70]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[15, 24]} />
        <meshStandardMaterial color="#0077be" transparent opacity={0.8} />
      </mesh>
      
      {/* Hills/Elevation changes */}
      <Hill position={[120, 0, 80]} radius={50} height={15} />
      <Hill position={[-180, 0, -120]} radius={60} height={20} />
      <Hill position={[250, 0, -150]} radius={40} height={10} />
    </>
  );
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
            <cylinderGeometry args={[scaleX, scaleX, length, 8]} rotation={[0, 0, Math.PI / 2]} />
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
    <RigidBody type="fixed" position={position}>
      <mesh castShadow receiveShadow>
        <coneGeometry args={[radius, height, 32]} />
        <meshStandardMaterial color="#4a8f5c" roughness={0.8} />
      </mesh>
    </RigidBody>
  );
}