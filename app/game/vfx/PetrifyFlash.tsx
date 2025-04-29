'use client';

import { useState } from 'react';
import { useFrame } from '@react-three/fiber';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// Export as named export
export function PetrifyFlash({ pos }: { pos: Vec3 }) {
  const [scale, setScale] = useState(0);
  
  useFrame((_, d) => {
    setScale(s => s < 2 ? s + 5 * d : 0);
  });
  
  if (scale === 0) return null;
  
  return (
    <mesh position={[pos.x, pos.y + 1, pos.z]} scale={scale}>
      <icosahedronGeometry args={[0.5, 1]} />
      <meshBasicMaterial color="yellow" transparent opacity={1 - scale / 2} />
    </mesh>
  );
}

// Also export as default for consistency
export default PetrifyFlash;
