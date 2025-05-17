import { useGameStore } from '../systems/gameStore';
import { RigidBody } from '@react-three/rapier';

interface LootProps {
  lootId: string;
  position: { x: number; y: number; z: number };
  items: { itemId: string; quantity: number }[];
}

export default function Loot({ lootId, position, items }: LootProps) {
  const socket = useGameStore(s => s.socket);
  
  return (
    <RigidBody type="fixed" position={[position.x, position.y, position.z]}>
      <mesh
        onClick={() => socket?.emit('msg', { type: 'LootPickup', lootId })}
      >
        <boxGeometry args={[0.4, 0.4, 0.4]} />
        <meshStandardMaterial color="#ffdd44" emissive="#ffaa00" />
      </mesh>
      {/* optional floating item icons */}
    </RigidBody>
  );
}
