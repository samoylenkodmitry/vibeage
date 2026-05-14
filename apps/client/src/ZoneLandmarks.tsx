import { useMemo } from 'react';
import * as THREE from 'three';
import { getZoneLandmarks, type ZoneLandmarkVisual } from './worldVisuals';

const RING_THICKNESS = 2.8;

export function ZoneLandmarks() {
  const landmarks = useMemo(() => getZoneLandmarks(), []);

  return (
    <group>
      {landmarks.map((landmark) => (
        <ZoneLandmark key={landmark.id} landmark={landmark} />
      ))}
    </group>
  );
}

function ZoneLandmark({ landmark }: { landmark: ZoneLandmarkVisual }) {
  return (
    <group position={[landmark.position.x, 0, landmark.position.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
        <ringGeometry args={[Math.max(1, landmark.radius - RING_THICKNESS), landmark.radius, 96]} />
        <meshBasicMaterial
          color={landmark.ringColor}
          side={THREE.DoubleSide}
          transparent
          opacity={0.28}
          depthWrite={false}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]}>
        <circleGeometry args={[Math.max(1, landmark.beaconRadius * 1.8), 32]} />
        <meshBasicMaterial color={landmark.accentColor} transparent opacity={0.16} depthWrite={false} />
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
          emissiveIntensity={0.22}
          roughness={0.72}
        />
      </mesh>
      <pointLight color={landmark.accentColor} intensity={0.65} distance={landmark.beaconRadius * 5} />
    </group>
  );
}
