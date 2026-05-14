import { useMemo } from 'react';
import { type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { WORLD_SETTINGS } from '../../../packages/content/world';
import { type VecXZ } from '../../../packages/protocol/messages';
import { GROUND_Y } from './worldSceneConfig';

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND_Y);
const pointerWorldPoint = new THREE.Vector3();

export function WorldGround({ onMove }: { onMove: (target: VecXZ) => void }) {
  const grid = useMemo(
    () => new THREE.GridHelper(WORLD_SETTINGS.groundSize, WORLD_SETTINGS.gridDivisions, '#6ee7d8', '#253f47'),
    [],
  );

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    if (event.button !== 0) {
      return;
    }

    event.stopPropagation();
    const point = event.ray.intersectPlane(groundPlane, pointerWorldPoint);
    if (point) {
      onMove({ x: point.x, z: point.z });
    }
  }

  return (
    <group>
      <primitive object={grid} position={[0, GROUND_Y + 0.01, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} onPointerDown={handlePointerDown}>
        <planeGeometry args={[WORLD_SETTINGS.groundSize, WORLD_SETTINGS.groundSize]} />
        <meshStandardMaterial color="#10252a" roughness={0.96} metalness={0.05} />
      </mesh>
    </group>
  );
}
