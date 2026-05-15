import { useMemo } from 'react';
import * as THREE from 'three';
import { sampleTerrain } from '../../../packages/content/terrain';
import {
  getTravelLaneSegments,
  WORLD_LANDMARKS,
  type WorldLandmark,
  type WorldTravelLane,
} from '../../../packages/content/worldFeatures';
import { WORLD_SETTINGS } from '../../../packages/content/world';
import type { Vec3D } from '../../../packages/protocol/messages';

type TravelLaneSegment = ReturnType<typeof getTravelLaneSegments>[number];

export function WorldFeatures({ focus }: { focus: Vec3D }) {
  const visibleFeatures = useMemo(() => ({
    lanes: getTravelLaneSegments().filter((segment) => isSegmentNearFocus(segment, focus)),
    landmarks: WORLD_LANDMARKS.filter((landmark) => isLandmarkNearFocus(landmark, focus)),
  }), [focus.x, focus.z]);

  return (
    <group>
      {visibleFeatures.lanes.map((segment) => (
        <TravelLaneMesh
          key={`${segment.lane.id}:${segment.from.x}:${segment.from.z}`}
          segment={segment}
        />
      ))}
      {visibleFeatures.landmarks.map((landmark) => (
        <LandmarkMesh key={landmark.id} landmark={landmark} />
      ))}
    </group>
  );
}

function TravelLaneMesh({ segment }: { segment: TravelLaneSegment }) {
  const dx = segment.to.x - segment.from.x;
  const dz = segment.to.z - segment.from.z;
  const length = Math.hypot(dx, dz);
  const midX = (segment.from.x + segment.to.x) / 2;
  const midZ = (segment.from.z + segment.to.z) / 2;
  const terrain = sampleTerrain(midX, midZ);
  const color = getLaneColor(segment.lane);

  return (
    <mesh
      position={[midX, terrain.height + 0.04, midZ]}
      rotation={[-Math.PI / 2, 0, Math.atan2(dx, dz)]}
      receiveShadow
    >
      <planeGeometry args={[segment.lane.width, length]} />
      <meshStandardMaterial
        color={color}
        roughness={0.96}
        metalness={0.01}
        transparent
        opacity={0.78}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function LandmarkMesh({ landmark }: { landmark: WorldLandmark }) {
  const terrain = sampleTerrain(landmark.position.x, landmark.position.z);
  const color = getLandmarkColor(landmark);

  return (
    <group position={[landmark.position.x, terrain.height, landmark.position.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
        <ringGeometry args={[landmark.radius * 0.82, landmark.radius, 48]} />
        <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.34} depthWrite={false} />
      </mesh>
      {renderLandmarkShape(landmark, color)}
    </group>
  );
}

function renderLandmarkShape(landmark: WorldLandmark, color: string) {
  if (landmark.kind === 'tree') {
    return (
      <>
        <mesh position={[0, landmark.height * 0.28, 0]} castShadow>
          <cylinderGeometry args={[landmark.radius * 0.18, landmark.radius * 0.28, landmark.height * 0.56, 8]} />
          <meshStandardMaterial color="#6b4a2f" roughness={0.9} />
        </mesh>
        <mesh position={[0, landmark.height * 0.72, 0]} castShadow>
          <coneGeometry args={[landmark.radius * 0.9, landmark.height * 0.72, 9]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.08} roughness={0.82} />
        </mesh>
      </>
    );
  }

  if (landmark.kind === 'gate') {
    return (
      <>
        <mesh position={[-landmark.radius * 0.42, landmark.height * 0.32, 0]} castShadow>
          <boxGeometry args={[landmark.radius * 0.2, landmark.height * 0.64, landmark.radius * 0.22]} />
          <meshStandardMaterial color={color} roughness={0.76} />
        </mesh>
        <mesh position={[landmark.radius * 0.42, landmark.height * 0.32, 0]} castShadow>
          <boxGeometry args={[landmark.radius * 0.2, landmark.height * 0.64, landmark.radius * 0.22]} />
          <meshStandardMaterial color={color} roughness={0.76} />
        </mesh>
        <mesh position={[0, landmark.height * 0.66, 0]} castShadow>
          <boxGeometry args={[landmark.radius * 1.08, landmark.height * 0.14, landmark.radius * 0.28]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.12} roughness={0.7} />
        </mesh>
      </>
    );
  }

  if (landmark.kind === 'keep') {
    return (
      <mesh position={[0, landmark.height * 0.38, 0]} castShadow>
        <boxGeometry args={[landmark.radius * 0.9, landmark.height * 0.76, landmark.radius * 0.9]} />
        <meshStandardMaterial color={color} roughness={0.78} />
      </mesh>
    );
  }

  return (
    <mesh position={[0, landmark.height * 0.5, 0]} castShadow>
      {landmark.kind === 'crystal'
        ? <octahedronGeometry args={[landmark.radius * 0.72, 1]} />
        : <coneGeometry args={[landmark.radius * 0.54, landmark.height, 6]} />}
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.16} roughness={0.55} />
    </mesh>
  );
}

function isSegmentNearFocus(segment: TravelLaneSegment, focus: Vec3D): boolean {
  const visibleDistance = WORLD_SETTINGS.fogFar * 1.2 + segment.lane.width;
  return distanceToSegmentSq(focus.x, focus.z, segment) <= visibleDistance * visibleDistance;
}

function isLandmarkNearFocus(landmark: WorldLandmark, focus: Vec3D): boolean {
  const dx = landmark.position.x - focus.x;
  const dz = landmark.position.z - focus.z;
  const visibleDistance = WORLD_SETTINGS.fogFar * 1.5 + landmark.radius;
  return dx * dx + dz * dz <= visibleDistance * visibleDistance;
}

function distanceToSegmentSq(x: number, z: number, segment: TravelLaneSegment): number {
  const dx = segment.to.x - segment.from.x;
  const dz = segment.to.z - segment.from.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq === 0) {
    return distanceToPointSq(x, z, segment.from.x, segment.from.z);
  }

  const t = Math.max(0, Math.min(1, ((x - segment.from.x) * dx + (z - segment.from.z) * dz) / lengthSq));
  return distanceToPointSq(x, z, segment.from.x + dx * t, segment.from.z + dz * t);
}

function distanceToPointSq(x: number, z: number, pointX: number, pointZ: number): number {
  const dx = x - pointX;
  const dz = z - pointZ;
  return dx * dx + dz * dz;
}

function getLaneColor(lane: WorldTravelLane): string {
  if (lane.kind === 'river') {
    return '#4fc3e8';
  }
  if (lane.kind === 'pass') {
    return '#c8b58a';
  }
  return lane.safe ? '#d6c28a' : '#a98f62';
}

function getLandmarkColor(landmark: WorldLandmark): string {
  switch (landmark.kind) {
    case 'crystal':
      return '#8de9d7';
    case 'tree':
      return '#67d982';
    case 'gate':
      return '#facc15';
    case 'keep':
      return '#a7b0c0';
    case 'ruin':
      return '#b8a38a';
    default:
      return '#f59e0b';
  }
}
