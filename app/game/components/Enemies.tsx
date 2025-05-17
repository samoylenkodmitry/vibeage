'use client';

import { useFrame } from '@react-three/fiber';
import { useState, useRef, useEffect } from 'react';
import { RigidBody } from '@react-three/rapier';
import { Html } from '@react-three/drei';

import * as THREE from 'three';
import { useGameStore } from '../systems/gameStore';
import { getBuffer } from '../systems/interpolation';

export default function Enemies() {
  const enemies = useGameStore(state => state.enemies);
  const selectedTargetId = useGameStore(state => state.selectedTargetId);
  const selectTarget = useGameStore(state => state.selectTarget);

  // Convert enemies object to array
  const enemiesArray = Object.values(enemies);

  useFrame(() => {
    // Enemy movement is now handled in the Enemy component for each individual enemy
  });

  return (
    <group>
      {enemiesArray.map((enemy) => (
        <Enemy 
          key={enemy.id}
          enemy={enemy}
          isSelected={selectedTargetId === enemy.id}
          onSelect={() => selectTarget(enemy.id)}
        />
      ))}
    </group>
  );
}

interface EnemyProps {
  enemy: any;
  isSelected: boolean;
  onSelect: () => void;
}

function Enemy({ enemy, isSelected, onSelect }: EnemyProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const rigidBodyRef = useRef<any>(null);
  const { id, type, position, health, maxHealth, isAlive, level, velocity } = enemy;
  const [isHovered, setIsHovered] = useState(false);
  
  // Reference to track if we've updated the position for this frame
  const hasUpdatedThisFrameRef = useRef(false);
  
  // Use interpolation for smoother movement
  useFrame((state, delta) => {
    if (!isAlive || !rigidBodyRef.current) return;
    
    // Get the interpolation buffer for this enemy
    const buffer = getBuffer(id);
    
    // Sample the buffer with renderTs (current time minus interpolation delay)
    const renderTs = performance.now() - 100; // 100ms interpolation delay
    const serverInterpolatedSnap = buffer.sample(renderTs);
    
    if (serverInterpolatedSnap) {
      // Get target position from the snapshot
      const targetPos = new THREE.Vector3(
        serverInterpolatedSnap.pos.x,
        position.y, // Keep Y coordinate the same
        serverInterpolatedSnap.pos.z
      );
      
      // Get rotation from the snapshot if available
      const targetRotY = serverInterpolatedSnap.rot !== undefined 
        ? serverInterpolatedSnap.rot 
        : enemy.rotation?.y || 0;
      
      // Get current position
      const currentPos = new THREE.Vector3(
        rigidBodyRef.current.translation().x,
        position.y,
        rigidBodyRef.current.translation().z
      );
      
      const distance = currentPos.distanceTo(targetPos);
      
      // If we're far away from the target position, teleport
      if (distance > 5) {
        rigidBodyRef.current.setNextKinematicTranslation(targetPos);
        // Update rotation immediately on teleport
        rigidBodyRef.current.setNextKinematicRotation(new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, targetRotY, 0)
        ));
      } else {
        // Smooth interpolation - blend current position with target position
        const lerpFactor = Math.min(delta * 10, 1); // Adjust speed of interpolation
        
        // Create interpolated position
        const newPos = new THREE.Vector3().lerpVectors(currentPos, targetPos, lerpFactor);
        
        // Set kinematic position for next frame
        rigidBodyRef.current.setNextKinematicTranslation(newPos);
        
        // Smoothly interpolate rotation
        const currentRotation = rigidBodyRef.current.rotation();
        const currentEuler = new THREE.Euler().setFromQuaternion(
          new THREE.Quaternion(currentRotation.x, currentRotation.y, currentRotation.z, currentRotation.w)
        );
        
        // Interpolate rotation
        const newRotY = THREE.MathUtils.lerp(currentEuler.y, targetRotY, lerpFactor * 0.8);
        
        // Set kinematic rotation for next frame
        rigidBodyRef.current.setNextKinematicRotation(new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, newRotY, 0)
        ));
      }
    }
  });

  // Different models for different enemy types
  const getEnemyModel = () => {
    switch (type) {
      case 'goblin':
        return <GoblinModel isSelected={isSelected} isHovered={isHovered} />;
      case 'wolf':
        return <WolfModel isSelected={isSelected} isHovered={isHovered} />;
      case 'skeleton':
        return <SkeletonModel isSelected={isSelected} isHovered={isHovered} />;
      default:
        return <DefaultEnemyModel isSelected={isSelected} isHovered={isHovered} />;
    }
  };

  if (!isAlive) return null;
  
  // Get proper capitalized mob name
  const getMobName = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };
  
  return (
    <RigidBody 
      ref={rigidBodyRef} 
      type="kinematicPosition" 
      position={[position.x, position.y, position.z]}
      colliders="hull"
      restitution={0}
      friction={0.7}
    >
      {/* Clickable area */}
      <mesh 
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
          setIsHovered(true);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'default';
          setIsHovered(false);
        }}
      >
        <sphereGeometry args={[1.2, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      
      {/* Enemy model */}
      {getEnemyModel()}
      
      {/* Health bar and name tag */}
      <Html position={[0, 2.5, 0]} center sprite>
        <div className="flex flex-col items-center pointer-events-none">
          <div className={`text-white text-xs font-medium bg-black/50 px-2 py-1 rounded mb-1 ${isSelected ? 'ring-2 ring-red-500' : ''}`}>
            {`${getMobName(type)} Lv.${level}`}
          </div>
          <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-red-600"
              style={{ width: `${(health / maxHealth) * 100}%` }}
            />
          </div>
        </div>
      </Html>
      
      {/* Selection indicator */}
      {isSelected && (
        <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.4, 1.6, 32]} />
          <meshBasicMaterial color="#ff0000" transparent opacity={0.6} />
        </mesh>
      )}
    </RigidBody>
  );
}

// Enhanced enemy models with selection/hover feedback

interface ModelProps {
  isSelected: boolean;
  isHovered: boolean;
}

function GoblinModel({ isSelected, isHovered }: ModelProps) {
  const baseColor = "#4a7c59";
  const hoverColor = "#5d8e6b";
  const selectedColor = "#6aaa7e";
  
  const color = isSelected ? selectedColor : (isHovered ? hoverColor : baseColor);
  
  return (
    <group>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.6, 1.0, 0.6]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.2, 0]} castShadow>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function WolfModel({ isSelected, isHovered }: ModelProps) {
  const baseColor = "#6e6e6e";
  const hoverColor = "#808080";
  const selectedColor = "#9a9a9a";
  
  const color = isSelected ? selectedColor : (isHovered ? hoverColor : baseColor);
  
  return (
    <group>
      <mesh position={[0, 0.5, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <capsuleGeometry args={[0.4, 1.0, 8, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0.8, 0.5, 0]} castShadow>
        <boxGeometry args={[0.6, 0.3, 0.5]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function SkeletonModel({ isSelected, isHovered }: ModelProps) {
  const baseColor = "#d8d8d0";
  const hoverColor = "#e5e5dc";
  const selectedColor = "#f2f2ea";
  
  const color = isSelected ? selectedColor : (isHovered ? hoverColor : baseColor);
  
  return (
    <group>
      <mesh position={[0, 0.8, 0]} castShadow>
        <boxGeometry args={[0.6, 1.6, 0.3]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.8, 0]} castShadow>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function DefaultEnemyModel({ isSelected, isHovered }: ModelProps) {
  const baseColor = "#8B0000";
  const hoverColor = "#A52A2A";
  const selectedColor = "#DC143C";
  
  const color = isSelected ? selectedColor : (isHovered ? hoverColor : baseColor);
  
  return (
    <mesh position={[0, 1, 0]} castShadow>
      <boxGeometry args={[1, 2, 1]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}