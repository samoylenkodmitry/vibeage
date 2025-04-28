import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Mesh, Material } from 'three';

interface SplashVfxProps {
  position: {x: number; y: number; z: number};
  radius: number;
}

export default function SplashVfx({ position, radius }: SplashVfxProps) {
  const ringRef = useRef<Mesh>(null);
  const [lifetime, setLifetime] = useState(1.0); // 1 second lifetime
  
  useFrame((_, delta) => {
    if (ringRef.current) {
      // Shrink lifetime
      setLifetime(prev => Math.max(0, prev - delta));
      
      // Scale up the ring
      const progress = 1 - lifetime;
      ringRef.current.scale.x = radius * progress;
      ringRef.current.scale.z = radius * progress;
      
      // Fade out
      if (ringRef.current.material instanceof Material) {
        ringRef.current.material.opacity = lifetime;
      }
    }
  });
  
  // Remove when lifetime is over
  if (lifetime <= 0) return null;
  
  return (
    <mesh 
      ref={ringRef} 
      position={[position.x, position.y + 0.05, position.z]} // Slightly above ground
      rotation={[Math.PI / 2, 0, 0]} // Flat on ground
    >
      <ringGeometry args={[radius * 0.8, radius, 32]} />
      <meshBasicMaterial color={new Color(0x00a0ff)} transparent={true} opacity={1} />
    </mesh>
  );
}

export function spawnSplashVfx(position: {x: number; y: number; z: number}, radius: number) {
  window.dispatchEvent(
    new CustomEvent('spawnSplash', { detail: { position, radius } })
  );
}

export function spawnStunFlash(position: {x: number; y: number; z: number}) {
  window.dispatchEvent(
    new CustomEvent('spawnStunFlash', { detail: { position } })
  );
}
