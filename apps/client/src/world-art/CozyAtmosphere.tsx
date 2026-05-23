import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldArtQuality } from './quality';

/**
 * Sky color, blue atmospheric fog, warm directional sun + cool
 * hemisphere fill. Owns `scene.background` and `scene.fog` while
 * the component is mounted.
 *
 * Unmount behavior is the load-bearing detail: we hand the scene
 * back with a valid `THREE.Color` background and `THREE.Fog`
 * (not null), even if the previous values were null — because
 * `WorldEnvironment` mutates them every frame via
 * `scene.background.set(...)`, which only works if they're real
 * objects. Restoring to a previous `null` value would leave the
 * renderer with no background and Three.js's default clear
 * color (white) would show through.
 */
type Focus = { x: number; y?: number; z: number };

export function CozyAtmosphere({ focus, quality }: { focus: Focus; quality: WorldArtQuality }) {
  const { scene } = useThree();
  useEffect(() => {
    const previousBackground = scene.background;
    const previousFog = scene.fog;
    scene.background = new THREE.Color('#78ccea');
    scene.fog = new THREE.Fog('#a9deea', quality === 'low' ? 180 : 120, quality === 'low' ? 760 : 950);
    return () => {
      // Restore if the previous value was already a real Color/Fog;
      // otherwise leave a fresh handoff so the next owner (usually
      // `WorldEnvironment`'s day/night useFrame) has something to
      // mutate and the canvas doesn't fall back to white.
      scene.background = previousBackground instanceof THREE.Color
        ? previousBackground
        : new THREE.Color('#0e1d2a');
      scene.fog = previousFog instanceof THREE.Fog
        ? previousFog
        : new THREE.Fog('#0e1d2a', 600, 5_400);
    };
  }, [quality, scene]);

  return (
    <>
      <hemisphereLight color="#c7f7ff" groundColor="#31563a" intensity={1.15} />
      <directionalLight
        position={[focus.x + 120, 180, focus.z + 90]}
        color="#fff0b8"
        intensity={2.1}
        castShadow={false}
      />
      <ambientLight color="#8fcbd5" intensity={0.18} />
    </>
  );
}
