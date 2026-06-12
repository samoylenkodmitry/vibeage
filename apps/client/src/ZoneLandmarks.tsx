import { useMemo } from 'react';
import * as THREE from 'three';
import { WORLD_SETTINGS } from '../../../packages/content/world';
import type { Vec3D } from '../../../packages/protocol/messages';
import { getZoneLandmarks, type ZoneLandmarkVisual } from './worldVisuals';
import { GlowEmitter } from './dynamicLights';

const RING_THICKNESS = 2.8;

export function ZoneLandmarks({ focus }: { focus: Vec3D }) {
  const landmarks = useMemo(
    () => getZoneLandmarks().filter((landmark) => isLandmarkNearFocus(landmark, focus)),
    [focus.x, focus.z],
  );

  return (
    <group>
      {landmarks.map((landmark) => (
        <ZoneLandmark key={landmark.id} landmark={landmark} />
      ))}
    </group>
  );
}

function isLandmarkNearFocus(landmark: ZoneLandmarkVisual, focus: Vec3D): boolean {
  const dx = landmark.position.x - focus.x;
  const dz = landmark.position.z - focus.z;
  const visibleDistance = landmark.radius + WORLD_SETTINGS.fogFar * 1.5;
  return dx * dx + dz * dz <= visibleDistance * visibleDistance;
}

function ZoneLandmark({ landmark }: { landmark: ZoneLandmarkVisual }) {
  // Lambert (lit), not basic: the unlit rings rendered at full brightness at
  // midnight — neon arcade arcs cutting across the night meadow. Lit + lower
  // opacity keeps them as subtle painted boundary lines that follow the
  // scene's day/night brightness.
  return (
    <group position={[landmark.position.x, 0, landmark.position.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
        <ringGeometry args={[Math.max(1, landmark.radius - RING_THICKNESS), landmark.radius, 96]} />
        <meshLambertMaterial
          color={landmark.ringColor}
          side={THREE.DoubleSide}
          transparent
          opacity={0.17}
          depthWrite={false}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]}>
        <circleGeometry args={[Math.max(1, landmark.beaconRadius * 1.8), 32]} />
        <meshLambertMaterial color={landmark.accentColor} transparent opacity={0.1} depthWrite={false} />
      </mesh>
      {landmark.showBeacon && <ZoneBeacon landmark={landmark} />}
    </group>
  );
}

function ZoneBeacon({ landmark }: { landmark: ZoneLandmarkVisual }) {
  return (
    <group>
      <mesh position={[0, landmark.height / 2, 0]}>
        <coneGeometry args={[landmark.beaconRadius, landmark.height, 5]} />
        <meshStandardMaterial
          color={landmark.accentColor}
          emissive={landmark.accentColor}
          emissiveIntensity={0.08}
          roughness={0.72}
        />
      </mesh>
      <GlowEmitter color={landmark.accentColor} intensity={0.65} distance={landmark.beaconRadius * 5} priority={1} />
    </group>
  );
}
