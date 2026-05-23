import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldArtQuality } from './quality';

/**
 * Sky color, blue atmospheric fog, warm directional sun + cool
 * hemisphere fill. Owns scene.background and scene.fog while the
 * component is mounted (restores the previous values on unmount so
 * other scenes can reuse their own atmosphere).
 *
 * Why fog-heavy: the cozy-coast reference reads as "cozy" because
 * distance washes out to pale blue. Keep the fog near; let only
 * the close shoreline + a few tree silhouettes carry detail.
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
      scene.background = previousBackground;
      scene.fog = previousFog;
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
