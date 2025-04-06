'use client';

import { useEffect, useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody } from '@react-three/rapier';
import { Html } from '@react-three/drei';
import { Vector3 } from 'three';
import { useGameStore } from '../systems/gameStore';

export default function Enemies() {
  const enemies = useGameStore(state => state.enemies);
  const selectedTargetId = useGameStore(state => state.selectedTargetId);
  const selectTarget = useGameStore(state => state.selectTarget);
  const playerPosition = useGameStore(state => state.player.position);
  
  useFrame((state, delta) => {
    // We could implement enemy AI and movement here
    // For now, enemies will just stay in position
  });
  
  return (
    <group>
      {enemies.map((enemy) => (
        <Enemy 
          key={enemy.id}
          enemy={enemy}
          isSelected={selectedTargetId === enemy.id}
          onSelect={() => selectTarget(enemy.id)}
          playerPosition={playerPosition}
        />
      ))}
    </group>
  );
}

interface EnemyProps {
  enemy: any;
  isSelected: boolean;
  onSelect: () => void;
  playerPosition: { x: number; y: number; z: number };
}

function Enemy({ enemy, isSelected, onSelect, playerPosition }: EnemyProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { id, type, position, health, maxHealth, isAlive, name } = enemy;
  const [isHovered, setIsHovered] = useState(false);
  
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
  
  // Check if player is close enough to interact with this enemy
  const isInRange = () => {
    const distance = Math.sqrt(
      Math.pow(position.x - playerPosition.x, 2) + 
      Math.pow(position.z - playerPosition.z, 2)
    );
    return distance < 20; // Detection range
  };
  
  if (!isAlive) return null;
  
  return (
    <RigidBody type="fixed" position={[position.x, position.y, position.z]}>
      {/* Clickable area */}
      <mesh 
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          if (isInRange()) {
            onSelect();
          }
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
            {name}
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