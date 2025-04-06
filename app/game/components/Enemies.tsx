'use client';

import { useEffect, useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody } from '@react-three/rapier';
import { Html } from '@react-three/drei';
import { Vector3 } from 'three';
import * as THREE from 'three';
import { useGameStore } from '../systems/gameStore';
import { zoneManager } from '../systems/zoneSystem';

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
  const { id, type, position, health, maxHealth, isAlive, name, level } = enemy;
  const [isHovered, setIsHovered] = useState(false);
  const originalPosition = useRef(new Vector3(enemy.position.x, enemy.position.y, enemy.position.z));
  const currentZone = useRef(zoneManager.getZoneAtPosition(enemy.position));
  
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
    <RigidBody type="fixed" position={[position.x, position.y, position.z]}>
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

// Helper function to get health bar color based on percentage
function getHealthColor(percentage: number): string {
  if (percentage > 0.6) return '#00ff00';
  if (percentage > 0.3) return '#ffff00';
  return '#ff0000';
}

// Helper function to get zone indicator color
function getZoneColor(zoneId: string): string {
  const colors: { [key: string]: string } = {
    starter_meadow: '#90EE90', // Light green
    dark_forest: '#228B22',    // Forest green
    rocky_highlands: '#A0522D', // Brown
    misty_lake: '#4682B4'      // Steel blue
  };
  return colors[zoneId] || '#FFFFFF';
}