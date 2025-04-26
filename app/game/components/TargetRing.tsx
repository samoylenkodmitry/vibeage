import { useGameStore } from '../systems/gameStore';
import { memo } from 'react';
import { Vector3 } from 'three';

export default memo(function TargetRing() {
  const pos = useGameStore(s => s.targetWorldPos);
  
  if (!pos) return null;
  
  return (
    <mesh position={[pos.x, pos.y, pos.z]} rotation={[-Math.PI/2, 0, 0]}>
      <ringGeometry args={[0.3, 0.5, 16]} />
      <meshBasicMaterial color="#ffff00" transparent opacity={0.6} />
    </mesh>
  );
});
