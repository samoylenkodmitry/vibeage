'use client';

import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Mesh } from 'three';

interface IceBoltVfxProps {
  id?: string;
  origin: {x: number; y: number; z: number};
  dir: {x: number; y: number; z: number};
  speed: number;
}

// Define as a named function first
export function IceBoltVfx({ id = `icebolt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, origin, dir, speed }: IceBoltVfxProps) {
  const ref = useRef<Mesh>(null);
  const pos = useRef(new Vector3(origin.x, origin.y, origin.z));
  
  useFrame((_, d) => { 
    if (ref.current) { 
      pos.current.addScaledVector(new Vector3(dir.x, dir.y, dir.z), speed * d);
      ref.current.position.copy(pos.current);
    } 
  });
  
  return (
    <mesh ref={ref}>
      <coneGeometry key={`icebolt-geo-${id}`} args={[0.25, 1]} />
      <meshBasicMaterial key={`icebolt-mat-${id}`} color="skyblue" />
    </mesh>
  );
}

// Also export as default
export default IceBoltVfx;
