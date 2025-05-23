import { useGameStore } from '../systems/gameStore';
import { RigidBody } from '@react-three/rapier';
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface LootProps {
  lootId: string;
  position: { x: number; y: number; z: number };
  items: { itemId: string; quantity: number }[];
}

export default function Loot({ lootId, position, items }: LootProps) {
  const socket = useGameStore(s => s.socket);
  const meshRef = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);
  const [isPickingUp, setIsPickingUp] = useState(false);
  
  // Add a floating animation to make the loot more visible
  useFrame(({ clock }) => {
    if (meshRef.current && !isPickingUp) {
      meshRef.current.position.y = position.y + Math.sin(clock.getElapsedTime() * 2) * 0.05;
      meshRef.current.rotation.y += 0.01;
    } else if (meshRef.current && isPickingUp) {
      // Animate pick up effect - float upward and shrink
      meshRef.current.position.y += 0.05;
      meshRef.current.scale.multiplyScalar(0.95);
      
      // Remove when it's small enough
      if (meshRef.current.scale.x < 0.1) {
        setIsPickingUp(false);
      }
    }
  });
  
  const handlePickup = () => {
    if (isPickingUp) return; // Prevent multiple clicks
    
    console.log(`[Client] Picking up loot: ${lootId}`);
    if (socket) {
      // Get playerId from store to add to pickup message
      const myPlayerId = useGameStore.getState().myPlayerId;
      if (!myPlayerId) {
        console.error('[Client] Cannot pick up loot: No player ID found');
        return;
      }
      
      console.log(`[Client] Sending LootPickup message: lootId=${lootId}, playerId=${myPlayerId}`);
      socket.emit('msg', { 
        type: 'LootPickup', 
        lootId,
        playerId: myPlayerId
      });
    }
  };
  
  // Log when loot is mounted/unmounted for debugging
  useEffect(() => {
    console.log(`[Client] Loot rendered: ${lootId} at position:`, position);
    return () => {
      console.log(`[Client] Loot removed: ${lootId}`);
    };
  }, [lootId, position]);
  
  return (
    <RigidBody type="fixed" position={[position.x, position.y, position.z]}>
      <mesh
        ref={meshRef}
        onClick={handlePickup}
        onPointerOver={() => setHover(true)}
        onPointerOut={() => setHover(false)}
      >
        <boxGeometry args={[0.6, 0.6, 0.6]} />
        <meshStandardMaterial 
          color={hover ? "#ffff00" : "#ffdd44"} 
          emissive={hover ? "#ffdd00" : "#ffaa00"}
          emissiveIntensity={hover ? 2 : 1}
        />
      </mesh>
      {/* Display a count of items above the loot box */}
      {items.length > 0 && (
        <mesh position={[0, 1, 0]}>
          <sphereGeometry args={[0.2, 8, 8]} />
          <meshStandardMaterial color="#ffffff" />
          {/* In a real game, you might use a Text component here to display the count */}
        </mesh>
      )}
    </RigidBody>
  );
}
