'use client';

import React, { useRef, useState, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import { RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { NPC } from '../systems/questSystem';

interface NPCComponentProps {
  npc: NPC;
  onInteract?: (npcId: string) => void;
  playerPosition?: { x: number; y: number; z: number };
}

const NPCComponent = memo<NPCComponentProps>(function NPCComponent({ 
  npc, 
  onInteract, 
  playerPosition = { x: 0, y: 0, z: 0 } 
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [isHovered, setIsHovered] = useState(false);
  
  // Calculate distance to player
  const distanceToPlayer = Math.sqrt(
    Math.pow(npc.position.x - playerPosition.x, 2) +
    Math.pow(npc.position.z - playerPosition.z, 2)
  );
  
  const isNearPlayer = distanceToPlayer < 10; // Show interaction prompt when close

  // Gentle floating animation
  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.position.y = npc.position.y + Math.sin(clock.getElapsedTime() * 0.5) * 0.1 + 1;
    }
  });

  const handleClick = () => {
    if (onInteract && isNearPlayer) {
      onInteract(npc.id);
    }
  };

  const getModelGeometry = (model: string) => {
    switch (model) {
      case 'human':
        return (
          <group>
            {/* Body */}
            <mesh position={[0, 0.5, 0]}>
              <boxGeometry args={[0.6, 1, 0.4]} />
              <meshStandardMaterial color={npc.appearance.color} />
            </mesh>
            {/* Head */}
            <mesh position={[0, 1.3, 0]}>
              <sphereGeometry args={[0.25, 8, 8]} />
              <meshStandardMaterial color="#FFDBAC" />
            </mesh>
            {/* Arms */}
            <mesh position={[-0.4, 0.7, 0]}>
              <boxGeometry args={[0.2, 0.8, 0.2]} />
              <meshStandardMaterial color={npc.appearance.color} />
            </mesh>
            <mesh position={[0.4, 0.7, 0]}>
              <boxGeometry args={[0.2, 0.8, 0.2]} />
              <meshStandardMaterial color={npc.appearance.color} />
            </mesh>
            {/* Legs */}
            <mesh position={[-0.15, -0.4, 0]}>
              <boxGeometry args={[0.2, 0.8, 0.2]} />
              <meshStandardMaterial color="#654321" />
            </mesh>
            <mesh position={[0.15, -0.4, 0]}>
              <boxGeometry args={[0.2, 0.8, 0.2]} />
              <meshStandardMaterial color="#654321" />
            </mesh>
          </group>
        );
      
      case 'elf':
        return (
          <group>
            {/* Body - slightly slimmer */}
            <mesh position={[0, 0.5, 0]}>
              <boxGeometry args={[0.5, 1, 0.35]} />
              <meshStandardMaterial color={npc.appearance.color} />
            </mesh>
            {/* Head */}
            <mesh position={[0, 1.3, 0]}>
              <sphereGeometry args={[0.22, 8, 8]} />
              <meshStandardMaterial color="#F5DEB3" />
            </mesh>
            {/* Pointed ears */}
            <mesh position={[-0.25, 1.35, 0]}>
              <coneGeometry args={[0.05, 0.15, 4]} />
              <meshStandardMaterial color="#F5DEB3" />
            </mesh>
            <mesh position={[0.25, 1.35, 0]}>
              <coneGeometry args={[0.05, 0.15, 4]} />
              <meshStandardMaterial color="#F5DEB3" />
            </mesh>
            {/* Arms */}
            <mesh position={[-0.35, 0.7, 0]}>
              <boxGeometry args={[0.18, 0.8, 0.18]} />
              <meshStandardMaterial color={npc.appearance.color} />
            </mesh>
            <mesh position={[0.35, 0.7, 0]}>
              <boxGeometry args={[0.18, 0.8, 0.18]} />
              <meshStandardMaterial color={npc.appearance.color} />
            </mesh>
            {/* Legs */}
            <mesh position={[-0.12, -0.4, 0]}>
              <boxGeometry args={[0.18, 0.8, 0.18]} />
              <meshStandardMaterial color="#2F4F4F" />
            </mesh>
            <mesh position={[0.12, -0.4, 0]}>
              <boxGeometry args={[0.18, 0.8, 0.18]} />
              <meshStandardMaterial color="#2F4F4F" />
            </mesh>
          </group>
        );
      
      case 'dwarf':
        return (
          <group>
            {/* Body - wider and shorter */}
            <mesh position={[0, 0.4, 0]}>
              <boxGeometry args={[0.8, 0.8, 0.5]} />
              <meshStandardMaterial color={npc.appearance.color} />
            </mesh>
            {/* Head */}
            <mesh position={[0, 1.1, 0]}>
              <sphereGeometry args={[0.28, 8, 8]} />
              <meshStandardMaterial color="#FFDBAC" />
            </mesh>
            {/* Beard */}
            <mesh position={[0, 0.9, 0.1]}>
              <boxGeometry args={[0.3, 0.4, 0.1]} />
              <meshStandardMaterial color="#8B4513" />
            </mesh>
            {/* Arms */}
            <mesh position={[-0.5, 0.6, 0]}>
              <boxGeometry args={[0.25, 0.7, 0.25]} />
              <meshStandardMaterial color={npc.appearance.color} />
            </mesh>
            <mesh position={[0.5, 0.6, 0]}>
              <boxGeometry args={[0.25, 0.7, 0.25]} />
              <meshStandardMaterial color={npc.appearance.color} />
            </mesh>
            {/* Legs - short and stocky */}
            <mesh position={[-0.2, -0.2, 0]}>
              <boxGeometry args={[0.25, 0.6, 0.25]} />
              <meshStandardMaterial color="#654321" />
            </mesh>
            <mesh position={[0.2, -0.2, 0]}>
              <boxGeometry args={[0.25, 0.6, 0.25]} />
              <meshStandardMaterial color="#654321" />
            </mesh>
          </group>
        );
      
      case 'orc':
        return (
          <group>
            {/* Body - bulky */}
            <mesh position={[0, 0.5, 0]}>
              <boxGeometry args={[0.8, 1.2, 0.6]} />
              <meshStandardMaterial color={npc.appearance.color} />
            </mesh>
            {/* Head - larger */}
            <mesh position={[0, 1.4, 0]}>
              <sphereGeometry args={[0.35, 8, 8]} />
              <meshStandardMaterial color="#8FBC8F" />
            </mesh>
            {/* Tusks */}
            <mesh position={[-0.1, 1.25, 0.25]}>
              <coneGeometry args={[0.03, 0.2, 4]} />
              <meshStandardMaterial color="#FFFACD" />
            </mesh>
            <mesh position={[0.1, 1.25, 0.25]}>
              <coneGeometry args={[0.03, 0.2, 4]} />
              <meshStandardMaterial color="#FFFACD" />
            </mesh>
            {/* Arms - muscular */}
            <mesh position={[-0.5, 0.7, 0]}>
              <boxGeometry args={[0.3, 1, 0.3]} />
              <meshStandardMaterial color={npc.appearance.color} />
            </mesh>
            <mesh position={[0.5, 0.7, 0]}>
              <boxGeometry args={[0.3, 1, 0.3]} />
              <meshStandardMaterial color={npc.appearance.color} />
            </mesh>
            {/* Legs */}
            <mesh position={[-0.2, -0.3, 0]}>
              <boxGeometry args={[0.3, 0.9, 0.3]} />
              <meshStandardMaterial color="#2F4F4F" />
            </mesh>
            <mesh position={[0.2, -0.3, 0]}>
              <boxGeometry args={[0.3, 0.9, 0.3]} />
              <meshStandardMaterial color="#2F4F4F" />
            </mesh>
          </group>
        );
      
      case 'mysterious':
        return (
          <group>
            {/* Hooded robe */}
            <mesh position={[0, 0.5, 0]}>
              <coneGeometry args={[0.8, 2, 8]} />
              <meshStandardMaterial 
                color={npc.appearance.color} 
                transparent 
                opacity={0.8}
              />
            </mesh>
            {/* Hood */}
            <mesh position={[0, 1.5, 0]}>
              <sphereGeometry args={[0.4, 8, 8]} />
              <meshStandardMaterial 
                color={npc.appearance.color} 
                transparent 
                opacity={0.9}
              />
            </mesh>
            {/* Glowing eyes */}
            <mesh position={[-0.1, 1.5, 0.3]}>
              <sphereGeometry args={[0.03, 6, 6]} />
              <meshStandardMaterial 
                color="#FFD700" 
                emissive="#FFD700"
                emissiveIntensity={0.8}
              />
            </mesh>
            <mesh position={[0.1, 1.5, 0.3]}>
              <sphereGeometry args={[0.03, 6, 6]} />
              <meshStandardMaterial 
                color="#FFD700" 
                emissive="#FFD700"
                emissiveIntensity={0.8}
              />
            </mesh>
            {/* Floating particles around the mysterious figure */}
            <mesh position={[0.5, 1, 0.5]}>
              <sphereGeometry args={[0.02, 4, 4]} />
              <meshStandardMaterial 
                color="#9370DB" 
                emissive="#9370DB"
                emissiveIntensity={0.6}
                transparent
                opacity={0.7}
              />
            </mesh>
            <mesh position={[-0.3, 1.2, -0.4]}>
              <sphereGeometry args={[0.02, 4, 4]} />
              <meshStandardMaterial 
                color="#9370DB" 
                emissive="#9370DB"
                emissiveIntensity={0.6}
                transparent
                opacity={0.7}
              />
            </mesh>
          </group>
        );
      
      default:
        return (
          <mesh>
            <boxGeometry args={[0.6, 1.8, 0.4]} />
            <meshStandardMaterial color={npc.appearance.color} />
          </mesh>
        );
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'quest_giver': return '!';
      case 'merchant': return '$';
      case 'trainer': return '★';
      case 'guard': return '⚔';
      case 'scholar': return '📚';
      default: return '?';
    }
  };

  return (
    <group>
      <RigidBody type="fixed" position={[npc.position.x, npc.position.y, npc.position.z]}>
        <mesh
          ref={meshRef}
          scale={npc.appearance.size}
          onPointerEnter={() => setIsHovered(true)}
          onPointerLeave={() => setIsHovered(false)}
          onClick={handleClick}
          userData={{ npcId: npc.id, interactive: true }}
        >
          {getModelGeometry(npc.appearance.model)}
        </mesh>
      </RigidBody>

      {/* Name and title display */}
      <Billboard 
        position={[npc.position.x, npc.position.y + 3, npc.position.z]}
        follow={true}
        lockX={false}
        lockY={false}
        lockZ={false}
      >
        <Text
          color={isHovered ? "#FFD700" : "#FFFFFF"}
          fontSize={0.5}
          outlineWidth={0.1}
          outlineColor="black"
          textAlign="center"
          material-transparent
          material-opacity={0.9}
        >
          {npc.title ? `${npc.name}\n${npc.title}` : npc.name}
        </Text>
      </Billboard>

      {/* Type indicator */}
      <Billboard 
        position={[npc.position.x, npc.position.y + 2.2, npc.position.z]}
        follow={true}
        lockX={false}
        lockY={false}
        lockZ={false}
      >
        <Text
          color={npc.type === 'quest_giver' ? "#FFD700" : "#87CEEB"}
          fontSize={0.8}
          outlineWidth={0.2}
          outlineColor="black"
          textAlign="center"
          material-transparent
          material-opacity={0.9}
        >
          {getTypeIcon(npc.type)}
        </Text>
      </Billboard>

      {/* Interaction prompt when near */}
      {isNearPlayer && (
        <Billboard 
          position={[npc.position.x, npc.position.y + 4, npc.position.z]}
          follow={true}
          lockX={false}
          lockY={false}
          lockZ={false}
        >
          <Text
            color="#00FF00"
            fontSize={0.4}
            outlineWidth={0.1}
            outlineColor="black"
            textAlign="center"
            material-transparent
            material-opacity={0.8}
          >
            Press E to interact
          </Text>
        </Billboard>
      )}

      {/* Selection highlight */}
      {isHovered && (
        <mesh position={[npc.position.x, npc.position.y + 0.1, npc.position.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.5, 16]} />
          <meshBasicMaterial 
            color="#FFD700" 
            transparent 
            opacity={0.3} 
          />
        </mesh>
      )}
    </group>
  );
});

export default NPCComponent;
