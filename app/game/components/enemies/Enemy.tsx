'use client';

import { useFrame } from '@react-three/fiber';
import { useState, useRef } from 'react';
import { RigidBody } from '@react-three/rapier';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

import { getBuffer } from '../../systems/interpolation';
import { getEnemyModel } from './EnemyModels';
import { getMobName, EnemyComponentProps } from './EnemyUtils';

export function Enemy({ enemy, isSelected, onSelect }: EnemyComponentProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const rigidBodyRef = useRef<any>(null);
  const { id, type, position, health, maxHealth, isAlive, level } = enemy;
  const [isHovered, setIsHovered] = useState(false);
  
  // Use interpolation for smoother movement with performance optimizations
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
      
      // Add movement threshold to reduce micro-movements (performance optimization)
      if (distance < 0.01) return; // 1cm threshold
      
      // If we're far away from the target position, teleport
      if (distance > 5) {
        rigidBodyRef.current.setNextKinematicTranslation(targetPos);
        // Update rotation immediately on teleport
        rigidBodyRef.current.setNextKinematicRotation(new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, targetRotY, 0)
        ));
      } else {
        // Smooth interpolation - blend current position with target position
        const lerpFactor = Math.min(delta * 8, 1); // Reduced from 10 for less aggressive interpolation
        
        // Create interpolated position
        const newPos = new THREE.Vector3().lerpVectors(currentPos, targetPos, lerpFactor);
        
        // Set kinematic position for next frame
        rigidBodyRef.current.setNextKinematicTranslation(newPos);
        
        // Smoothly interpolate rotation with reduced frequency
        const currentRotation = rigidBodyRef.current.rotation();
        const currentEuler = new THREE.Euler().setFromQuaternion(
          new THREE.Quaternion(currentRotation.x, currentRotation.y, currentRotation.z, currentRotation.w)
        );
        
        // Interpolate rotation with reduced aggressiveness
        const newRotY = THREE.MathUtils.lerp(currentEuler.y, targetRotY, lerpFactor * 0.6); // Reduced from 0.8
        
        // Set kinematic rotation for next frame
        rigidBodyRef.current.setNextKinematicRotation(new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, newRotY, 0)
        ));
      }
    }
  });

  if (!isAlive) return null;
  
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
      {getEnemyModel(type, isSelected, isHovered)}
      
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
