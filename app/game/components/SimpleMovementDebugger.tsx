// Helper component for debugging player movement in the game
import React, { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import { useGameStore } from '../systems/gameStore';
import { getBuffer } from '../systems/interpolation';

interface MovementDebuggerProps {
  playerId: string;
  playerRef: React.RefObject<any>;
  isControlledPlayer: boolean;
}

export function MovementDebugger({ playerId, playerRef, isControlledPlayer }: MovementDebuggerProps) {
  // Only show debugging for the controlled player
  if (!isControlledPlayer) return null;
  
  const targetMarkerRef = useRef<THREE.Mesh>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [stats, setStats] = useState({ 
    distance: 0, 
    bufferSize: 0,
    position: { x: 0, z: 0 } 
  });
  
  // Get the target position from the game store
  const targetPos = useGameStore(state => state.targetWorldPos);
  
  // Toggle debug visualization with 'D' key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') {
        setShowDebug(prev => !prev);
        console.log(`Movement debugger ${!showDebug ? 'enabled' : 'disabled'}`);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDebug]);
  
  // Update visualization on each frame
  useFrame(() => {
    if (!showDebug || !playerRef?.current) return;
    
    // Get current player position
    const currentPos = playerRef.current.translation();
    if (!currentPos) return;
    
    // Update the target indicator
    if (targetMarkerRef.current && targetPos) {
      targetMarkerRef.current.position.set(targetPos.x, 0.1, targetPos.z);
      targetMarkerRef.current.visible = true;
      
      // Calculate distance to target
      const distance = Math.sqrt(
        Math.pow(currentPos.x - targetPos.x, 2) + 
        Math.pow(currentPos.z - targetPos.z, 2)
      );
      
      // Get buffer info
      const buffer = getBuffer(playerId);
      const bufferSize = buffer ? buffer.getBufferLength() : 0;
      
      // Update stats
      setStats({
        distance,
        bufferSize,
        position: { x: currentPos.x, z: currentPos.z }
      });
    } else if (targetMarkerRef.current) {
      targetMarkerRef.current.visible = false;
    }
  });
  
  if (!showDebug) return null;
  
  return (
    <group>
      {/* Target marker */}
      <mesh ref={targetMarkerRef} position={[0, 0.1, 0]} visible={false}>
        <ringGeometry args={[0.3, 0.4, 16]} />
        <meshBasicMaterial color="yellow" transparent opacity={0.6} />
      </mesh>
      
      {/* Debug text */}
      {targetPos && (
        <Text
          position={[0, 2, 0]}
          fontSize={0.15}
          color="white"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          {`Dist: ${stats.distance.toFixed(2)}m
Buffer: ${stats.bufferSize} entries
Pos: (${stats.position.x.toFixed(2)}, ${stats.position.z.toFixed(2)})`}
        </Text>
      )}
    </group>
  );
}
