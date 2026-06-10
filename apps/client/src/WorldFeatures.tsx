import { Suspense, useEffect, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { USDZLoader } from 'three/examples/jsm/loaders/USDZLoader.js';
import { sampleTerrain } from '../../../packages/content/terrain';
import {
  getTravelLaneSegments,
  WORLD_LANDMARKS,
  type WorldLandmark,
  type WorldTravelLane,
} from '../../../packages/content/worldFeatures';
import { WORLD_SETTINGS } from '../../../packages/content/world';
import type { Vec3D } from '../../../packages/protocol/messages';
import { seededRandom } from './world-art/foliageScatter';

type TravelLaneSegment = ReturnType<typeof getTravelLaneSegments>[number];

const ALL_TRAVEL_LANE_SEGMENTS = getTravelLaneSegments();
const ROAD_VISIBLE_RADIUS = 520;
const ROAD_SLAB_STEP = 10;

export function WorldFeatures({ focus }: { focus: Vec3D }) {
  const visibleFeatures = useMemo(() => ({
    lanes: ALL_TRAVEL_LANE_SEGMENTS.filter((segment) => isSegmentNearFocus(segment, focus)),
    landmarks: WORLD_LANDMARKS.filter((landmark) => isLandmarkNearFocus(landmark, focus)),
  }), [focus.x, focus.z]);
  // One animated material shared by every river slab; ticked once here.
  const riverMaterial = useMemo(() => makeRiverMaterial(), []);
  useEffect(() => () => riverMaterial.dispose(), [riverMaterial]);
  useFrame(({ clock }) => {
    riverMaterial.uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <group>
      {visibleFeatures.lanes.map((segment) => (
        <TravelLaneMesh
          key={`${segment.lane.id}:${segment.from.x}:${segment.from.z}`}
          segment={segment}
          focus={focus}
          riverMaterial={riverMaterial}
        />
      ))}
      {visibleFeatures.landmarks.map((landmark) => (
        <LandmarkMesh key={landmark.id} landmark={landmark} />
      ))}
    </group>
  );
}

function TravelLaneMesh({ segment, focus, riverMaterial }: { segment: TravelLaneSegment; focus: Vec3D; riverMaterial: THREE.ShaderMaterial }) {
  const color = getLaneColor(segment.lane);
  const slabs = useMemo(
    () => buildVisibleLaneSlabs(segment, focus),
    [segment, focus.x, focus.z],
  );
  const river = segment.lane.kind === 'river';

  return (
    <group>
      {slabs.map((slab, index) => (
        <mesh
          key={index}
          position={[slab.x, slab.y, slab.z]}
          rotation={[-Math.PI / 2, 0, slab.rotY]}
          receiveShadow={!river}
          material={river ? riverMaterial : undefined}
        >
          <planeGeometry args={[segment.lane.width, slab.length]} />
          {!river && (
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
          )}
        </mesh>
      ))}
    </group>
  );
}

/**
 * Living river water — replaces the flat blue slab the 'river' travel lane
 * used to render. Shared by all river slabs (one uTime tick in
 * WorldFeatures): flowing ripple bands drift along the slab's length in
 * world units (vLocal.y is metres along the lane regardless of slab length),
 * with a shimmering sparkle and a brighter mid-stream. Depth-tested against
 * terrain like the lakes; polygon offset keeps it floating over the ground
 * the way the old slab did.
 */
function makeRiverMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color('#1d5b7c') },
      uShallow: { value: new THREE.Color('#4fc3e8') },
    },
    vertexShader: /* glsl */ `
      varying vec2 vLocal;   // x: metres across the lane, y: metres along it
      void main() {
        vLocal = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vLocal;
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      void main() {
        // Downstream-drifting ripple bands + a cross shimmer.
        float flow = sin(vLocal.y * 0.55 - uTime * 2.4) * 0.5
                   + sin(vLocal.y * 1.7 - uTime * 3.6 + vLocal.x * 0.8) * 0.5;
        vec3 color = mix(uDeep, uShallow, 0.45 + flow * 0.25);
        // Brighter, more opaque mid-stream; soft edges toward the banks.
        // 9.0 = half of the Silverwood River's 18 m lane width (the only
        // river lane); widen if a broader river is ever authored.
        float edge = smoothstep(1.0, 0.35, abs(vLocal.x) / 9.0);
        color += vec3(0.06) * edge;
        gl_FragColor = vec4(color, mix(0.45, 0.82, edge));
      }
    `,
  });
}

function buildVisibleLaneSlabs(
  segment: TravelLaneSegment,
  focus: Vec3D,
): Array<{ x: number; y: number; z: number; rotY: number; length: number }> {
  const dx = segment.to.x - segment.from.x;
  const dz = segment.to.z - segment.from.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.01) {
    return [];
  }
  const tFocus = ((focus.x - segment.from.x) * dx + (focus.z - segment.from.z) * dz) / (length * length);
  const tRadius = ROAD_VISIBLE_RADIUS / length;
  const tMin = Math.max(0, tFocus - tRadius);
  const tMax = Math.min(1, tFocus + tRadius);
  if (tMax <= tMin) {
    return [];
  }
  const visibleLength = (tMax - tMin) * length;
  const steps = Math.max(1, Math.ceil(visibleLength / ROAD_SLAB_STEP));
  const stepLength = visibleLength / steps;
  const rotY = Math.atan2(dx, dz);
  const slabs: Array<{ x: number; y: number; z: number; rotY: number; length: number }> = [];
  for (let i = 0; i < steps; i += 1) {
    const t = tMin + ((i + 0.5) / steps) * (tMax - tMin);
    const x = segment.from.x + dx * t;
    const z = segment.from.z + dz * t;
    const terrain = sampleTerrain(x, z);
    slabs.push({ x, y: terrain.height + 0.04, z, rotY, length: stepLength });
  }
  return slabs;
}

function LandmarkMesh({ landmark }: { landmark: WorldLandmark }) {
  const terrain = sampleTerrain(landmark.position.x, landmark.position.z);
  const color = getLandmarkColor(landmark);
  const fog = !landmark.mega;
  const baseY = landmark.mega ? terrain.height - landmark.height * 0.04 : terrain.height;

  // Settlements draw their own dirt plaza; the glowing boundary ring read as
  // a huge ugly band across the town (and grass poked through it).
  const settlement = landmark.kind === 'town' || landmark.kind === 'castle';
  return (
    <group position={[landmark.position.x, baseY, landmark.position.z]}>
      {!landmark.mega && !settlement && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
          <ringGeometry args={[landmark.radius * 0.82, landmark.radius, 48]} />
          <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.34} depthWrite={false} />
        </mesh>
      )}
      {renderLandmarkShape(landmark, color, fog)}
    </group>
  );
}

function renderLandmarkShape(landmark: WorldLandmark, color: string, fog: boolean) {
  if (landmark.kind === 'ancient_tree') {
    return (
      <Suspense fallback={renderTreeLandmark(landmark, color, fog)}>
        <AncientTreeMesh landmark={landmark} />
      </Suspense>
    );
  }
  if (landmark.kind === 'tree') {
    return renderTreeLandmark(landmark, color, fog);
  }
  if (landmark.kind === 'gate') {
    return renderGateLandmark(landmark, color, fog);
  }
  if (landmark.kind === 'keep') {
    return renderKeepLandmark(landmark, color, fog);
  }
  if (landmark.kind === 'spire') {
    return renderSpireLandmark(landmark, color, fog);
  }
  if (landmark.kind === 'crystal') {
    return renderCrystalLandmark(landmark, color, fog);
  }
  if (landmark.kind === 'town') {
    return <TownLandmark landmark={landmark} fog={fog} />;
  }
  if (landmark.kind === 'castle') {
    return <CastleLandmark landmark={landmark} color={color} fog={fog} />;
  }
  return (
    <mesh position={[0, landmark.height * 0.5, 0]} castShadow={!landmark.mega}>
      <coneGeometry args={[landmark.radius * 0.54, landmark.height, landmark.mega ? 10 : 6]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={landmark.mega ? 0.24 : 0.16} roughness={0.55} fog={fog} />
    </mesh>
  );
}

function renderTreeLandmark(landmark: WorldLandmark, color: string, fog: boolean) {
  const tiers = landmark.mega ? 4 : 2;
  return (
    <>
      <mesh position={[0, landmark.height * 0.22, 0]} castShadow={!landmark.mega}>
        <cylinderGeometry args={[landmark.radius * 0.22, landmark.radius * 0.34, landmark.height * 0.44, 10]} />
        <meshStandardMaterial color="#6b4a2f" roughness={0.9} fog={fog} />
      </mesh>
      {Array.from({ length: tiers }).map((_, index) => {
        const t = index / Math.max(1, tiers - 1);
        const y = landmark.height * (0.4 + t * 0.55);
        const r = landmark.radius * (0.95 - t * 0.55);
        const h = landmark.height * (0.34 - t * 0.06);
        return (
          <mesh key={index} position={[0, y, 0]} castShadow={!landmark.mega}>
            <coneGeometry args={[r, h, landmark.mega ? 14 : 9]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.08 + t * 0.06} roughness={0.82} fog={fog} />
          </mesh>
        );
      })}
    </>
  );
}

function renderGateLandmark(landmark: WorldLandmark, color: string, fog: boolean) {
  return (
    <>
      <mesh position={[-landmark.radius * 0.42, landmark.height * 0.32, 0]} castShadow={!landmark.mega}>
        <boxGeometry args={[landmark.radius * 0.2, landmark.height * 0.64, landmark.radius * 0.22]} />
        <meshStandardMaterial color={color} roughness={0.76} fog={fog} />
      </mesh>
      <mesh position={[landmark.radius * 0.42, landmark.height * 0.32, 0]} castShadow={!landmark.mega}>
        <boxGeometry args={[landmark.radius * 0.2, landmark.height * 0.64, landmark.radius * 0.22]} />
        <meshStandardMaterial color={color} roughness={0.76} fog={fog} />
      </mesh>
      <mesh position={[0, landmark.height * 0.66, 0]} castShadow={!landmark.mega}>
        <boxGeometry args={[landmark.radius * 1.08, landmark.height * 0.14, landmark.radius * 0.28]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.12} roughness={0.7} fog={fog} />
      </mesh>
      <mesh position={[0, landmark.height * 0.82, 0]} castShadow={!landmark.mega}>
        <coneGeometry args={[landmark.radius * 0.36, landmark.height * 0.18, 6]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.16} roughness={0.7} fog={fog} />
      </mesh>
    </>
  );
}

function renderKeepLandmark(landmark: WorldLandmark, color: string, fog: boolean) {
  const baseHeight = landmark.height * 0.42;
  const innerHeight = landmark.height * 0.32;
  const towerHeight = landmark.height * 0.46;
  const cornerOffset = landmark.radius * 0.5;
  const cornerSize = landmark.radius * 0.22;
  const cornerHeight = landmark.height * 0.62;
  const corners: [number, number][] = [
    [-cornerOffset, -cornerOffset],
    [-cornerOffset, cornerOffset],
    [cornerOffset, -cornerOffset],
    [cornerOffset, cornerOffset],
  ];
  return (
    <>
      <mesh position={[0, baseHeight * 0.5, 0]} castShadow={!landmark.mega}>
        <boxGeometry args={[landmark.radius * 1.4, baseHeight, landmark.radius * 1.4]} />
        <meshStandardMaterial color={color} roughness={0.78} fog={fog} />
      </mesh>
      <mesh position={[0, baseHeight + innerHeight * 0.5, 0]} castShadow={!landmark.mega}>
        <boxGeometry args={[landmark.radius * 0.96, innerHeight, landmark.radius * 0.96]} />
        <meshStandardMaterial color={color} roughness={0.78} fog={fog} />
      </mesh>
      <mesh position={[0, baseHeight + innerHeight + towerHeight * 0.5, 0]} castShadow={!landmark.mega}>
        <cylinderGeometry args={[landmark.radius * 0.42, landmark.radius * 0.46, towerHeight, 12]} />
        <meshStandardMaterial color={color} roughness={0.78} fog={fog} />
      </mesh>
      <mesh position={[0, baseHeight + innerHeight + towerHeight + landmark.height * 0.04, 0]} castShadow={false}>
        <coneGeometry args={[landmark.radius * 0.5, landmark.height * 0.18, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.22} roughness={0.7} fog={fog} />
      </mesh>
      {corners.map(([cx, cz]) => (
        <mesh key={`${cx}:${cz}`} position={[cx, cornerHeight * 0.5, cz]} castShadow={!landmark.mega}>
          <cylinderGeometry args={[cornerSize, cornerSize, cornerHeight, 8]} />
          <meshStandardMaterial color={color} roughness={0.74} fog={fog} />
        </mesh>
      ))}
    </>
  );
}

function renderSpireLandmark(landmark: WorldLandmark, color: string, fog: boolean) {
  const tiers = landmark.mega ? 5 : 3;
  return (
    <>
      <mesh position={[0, landmark.height * 0.05, 0]} castShadow={!landmark.mega}>
        <cylinderGeometry args={[landmark.radius * 0.7, landmark.radius * 0.85, landmark.height * 0.1, 12]} />
        <meshStandardMaterial color={color} roughness={0.7} fog={fog} />
      </mesh>
      {Array.from({ length: tiers }).map((_, index) => {
        const t = index / Math.max(1, tiers);
        const y = landmark.height * (0.1 + t * 0.78);
        const r = landmark.radius * (0.62 - t * 0.42);
        const h = landmark.height * (0.32 - t * 0.04);
        return (
          <mesh key={index} position={[0, y, 0]} castShadow={!landmark.mega}>
            <coneGeometry args={[r, h, landmark.mega ? 14 : 8]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.12 + t * 0.08} roughness={0.6} fog={fog} />
          </mesh>
        );
      })}
    </>
  );
}

const ANCIENT_TREE_URL = '/models/ancient-tree.usdz';

function AncientTreeMesh({ landmark }: { landmark: WorldLandmark }) {
  const root = useLoader(USDZLoader, ANCIENT_TREE_URL);
  const cloned = useMemo(() => root.clone(true), [root]);
  const fitted = useMemo(() => fitGroupToHeight(cloned, landmark.height), [cloned, landmark.height]);
  return <primitive object={fitted} />;
}

function fitGroupToHeight(group: THREE.Object3D, targetHeight: number): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const wrapper = new THREE.Group();
  if (size.y > 0.001) {
    const scale = targetHeight / size.y;
    group.position.set(-center.x, -box.min.y, -center.z);
    wrapper.add(group);
    wrapper.scale.setScalar(scale);
  } else {
    wrapper.add(group);
  }
  return wrapper;
}

function renderCrystalLandmark(landmark: WorldLandmark, color: string, fog: boolean) {
  const shards = landmark.mega ? 5 : 1;
  return (
    <>
      {Array.from({ length: shards }).map((_, index) => {
        const angle = (index / Math.max(1, shards)) * Math.PI * 2;
        const radius = shards === 1 ? 0 : landmark.radius * 0.42;
        const height = landmark.height * (shards === 1 ? 0.5 : 0.34 + (index % 2) * 0.18);
        const size = landmark.radius * (shards === 1 ? 0.72 : 0.36 + (index % 2) * 0.16);
        return (
          <mesh
            key={index}
            position={[Math.cos(angle) * radius, height, Math.sin(angle) * radius]}
            rotation={[0, angle, 0]}
            castShadow={!landmark.mega}
          >
            <octahedronGeometry args={[size, landmark.mega ? 2 : 1]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={landmark.mega ? 0.32 : 0.18} roughness={0.5} fog={fog} />
          </mesh>
        );
      })}
    </>
  );
}

function isSegmentNearFocus(segment: TravelLaneSegment, focus: Vec3D): boolean {
  const visibleDistance = WORLD_SETTINGS.fogFar * 1.2 + segment.lane.width;
  return distanceToSegmentSq(focus.x, focus.z, segment) <= visibleDistance * visibleDistance;
}

function isLandmarkNearFocus(landmark: WorldLandmark, focus: Vec3D): boolean {
  const dx = landmark.position.x - focus.x;
  const dz = landmark.position.z - focus.z;
  const visibleDistance = landmark.mega
    ? 40_000 + landmark.radius
    : WORLD_SETTINGS.fogFar * 1.5 + landmark.radius;
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

const HOUSE_WALL_COLORS = ['#d9c6a3', '#cdb791', '#e2d2b4', '#c4ad85'];
const HOUSE_ROOF_COLORS = ['#a0522d', '#8c4a2f', '#7d5a3c', '#9b6b43'];

/**
 * Procedural hamlet — ~16 seeded houses (box + 4-sided pyramid roof) ringing
 * a central well, leaving an open square. Deterministic from the landmark's
 * position, so the town never reshuffles. The ground beneath is a
 * TOWN_PLATEAUS flat disc (terrain.ts) and the grass density bake clears the
 * plaza, so houses stand level on trodden ground.
 */
type TownHouseSpec = {
  x: number; z: number; w: number; d: number; h: number;
  yaw: number; twoStory: boolean; chimneySide: number; wall: string; roof: string;
};

function TownHouse({ house, fog }: { house: TownHouseSpec; fog: boolean }) {
  const bodyH = house.twoStory ? house.h * 1.7 : house.h;
  return (
    <group position={[house.x, 0, house.z]} rotation={[0, house.yaw, 0]}>
      {/* walls */}
      <mesh position={[0, bodyH / 2, 0]} castShadow>
        <boxGeometry args={[house.w, bodyH, house.d]} />
        <meshStandardMaterial color={house.wall} roughness={0.85} fog={fog} />
      </mesh>
      {/* roof: 4-sided cone rotated 45° = pyramid with a visible overhang */}
      <mesh position={[0, bodyH + house.h * 0.4, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[Math.hypot(house.w, house.d) * 0.62, house.h * 0.85, 4]} />
        <meshStandardMaterial color={house.roof} roughness={0.8} fog={fog} />
      </mesh>
      {/* door on the square-facing side */}
      <mesh position={[0, 1.1, house.d / 2 + 0.04]}>
        <boxGeometry args={[1.3, 2.2, 0.12]} />
        <meshStandardMaterial color="#4a3622" roughness={0.9} fog={fog} />
      </mesh>
      {/* warm windows (emissive, so the town glows at night) */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * house.w * 0.28, bodyH * 0.55, house.d / 2 + 0.04]}>
          <boxGeometry args={[0.9, 0.9, 0.1]} />
          <meshStandardMaterial color="#ffd98c" emissive="#ffb84d" emissiveIntensity={0.85} roughness={0.4} fog={fog} />
        </mesh>
      ))}
      {/* chimney */}
      <mesh position={[house.chimneySide * house.w * 0.3, bodyH + house.h * 0.55, -house.d * 0.2]} castShadow>
        <boxGeometry args={[0.8, house.h * 0.7, 0.8]} />
        <meshStandardMaterial color="#6f6258" roughness={0.92} fog={fog} />
      </mesh>
    </group>
  );
}

function TownLandmark({ landmark, fog }: { landmark: WorldLandmark; fog: boolean }) {
  const town = useMemo(() => {
    const random = seededRandom(Math.round(landmark.position.x), Math.round(landmark.position.z));
    const count = 18;
    const houses = Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + (random() - 0.5) * 0.45;
      const ring = landmark.radius * (0.34 + random() * 0.48);
      const w = 5.5 + random() * 4;
      const d = 5.5 + random() * 4;
      const h = 3.4 + random() * 2.4;
      const angleToCentre = Math.atan2(-Math.sin(angle), -Math.cos(angle));
      return {
        x: Math.cos(angle) * ring,
        z: Math.sin(angle) * ring,
        w, d, h,
        // Face the square (door side toward the centre), slight jitter.
        yaw: angleToCentre + Math.PI / 2 + (random() - 0.5) * 0.4,
        twoStory: random() < 0.25,
        chimneySide: random() < 0.5 ? 1 : -1,
        wall: HOUSE_WALL_COLORS[Math.floor(random() * HOUSE_WALL_COLORS.length)],
        roof: HOUSE_ROOF_COLORS[Math.floor(random() * HOUSE_ROOF_COLORS.length)],
      };
    });
    const lamps = Array.from({ length: 5 }, (_, i) => {
      const a = (i / 5) * Math.PI * 2 + 0.5;
      const r = landmark.radius * 0.2;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r };
    });
    const stalls = Array.from({ length: 2 }, (_, i) => {
      const a = (i / 2) * Math.PI * 2 + 1.2 + random() * 0.4;
      const r = landmark.radius * 0.13;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: random() * Math.PI * 2 };
    });
    return { houses, lamps, stalls };
  }, [landmark]);

  return (
    <>
      {/* Trodden dirt plaza under the whole settlement (grass density also
          clears here) — replaces the old glowing boundary ring. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} raycast={() => null}>
        <circleGeometry args={[landmark.radius * 1.02, 40]} />
        <meshStandardMaterial color="#7c6a50" roughness={0.98} transparent opacity={0.62} depthWrite={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} fog={fog} />
      </mesh>
      {town.houses.map((house, i) => (
        <TownHouse key={i} house={house} fog={fog} />
      ))}
      {/* central well */}
      <mesh position={[0, 0.7, 0]} castShadow>
        <cylinderGeometry args={[1.6, 1.8, 1.4, 10]} />
        <meshStandardMaterial color="#8d8478" roughness={0.9} fog={fog} />
      </mesh>
      <mesh position={[0, 2.3, 0]} castShadow>
        <coneGeometry args={[2.1, 1.4, 6]} />
        <meshStandardMaterial color="#7a5b3a" roughness={0.85} fog={fog} />
      </mesh>
      {/* market stalls by the square */}
      {town.stalls.map((stall, i) => (
        <group key={`stall-${i}`} position={[stall.x, 0, stall.z]} rotation={[0, stall.yaw, 0]}>
          <mesh position={[0, 0.55, 0]} castShadow>
            <boxGeometry args={[2.6, 1.1, 1.4]} />
            <meshStandardMaterial color="#9b7a4e" roughness={0.88} fog={fog} />
          </mesh>
          <mesh position={[0, 2.2, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[2.2, 1.0, 4]} />
            <meshStandardMaterial color="#b5484d" roughness={0.8} fog={fog} />
          </mesh>
        </group>
      ))}
      {/* lamp posts around the square — warm emissive heads */}
      {town.lamps.map((lamp, i) => (
        <group key={`lamp-${i}`} position={[lamp.x, 0, lamp.z]}>
          <mesh position={[0, 1.6, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.12, 3.2, 6]} />
            <meshStandardMaterial color="#3e3a34" roughness={0.85} fog={fog} />
          </mesh>
          <mesh position={[0, 3.3, 0]}>
            <sphereGeometry args={[0.32, 10, 8]} />
            <meshStandardMaterial color="#ffe2a0" emissive="#ffc25e" emissiveIntensity={1.2} roughness={0.3} fog={fog} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/**
 * Procedural castle — square curtain wall with crenellated corner towers, a
 * gatehouse, and a two-tier central keep flying a banner cone. Sits on its
 * TOWN_PLATEAUS crest so the silhouette reads against the sky from far off.
 */
function CastleLandmark({ landmark, color, fog }: { landmark: WorldLandmark; color: string; fog: boolean }) {
  const r = landmark.radius;
  const h = landmark.height;
  const half = r * 0.66;
  const wallH = h * 0.2;
  const towerH = h * 0.34;
  const towerR = r * 0.13;
  const stone = color;
  const roof = '#3f4c63';
  const corners: [number, number][] = [[-half, -half], [-half, half], [half, -half], [half, half]];
  return (
    <>
      {/* curtain walls */}
      {[
        { x: 0, z: -half, yaw: 0 },
        { x: 0, z: half, yaw: 0 },
        { x: -half, z: 0, yaw: Math.PI / 2 },
        { x: half, z: 0, yaw: Math.PI / 2 },
      ].map((wall, i) => (
        <mesh key={i} position={[wall.x, wallH / 2, wall.z]} rotation={[0, wall.yaw, 0]} castShadow>
          <boxGeometry args={[half * 2, wallH, 3.5]} />
          <meshStandardMaterial color={stone} roughness={0.82} fog={fog} />
        </mesh>
      ))}
      {/* corner towers with conical roofs */}
      {corners.map(([cx, cz]) => (
        <group key={`${cx}:${cz}`} position={[cx, 0, cz]}>
          <mesh position={[0, towerH / 2, 0]} castShadow>
            <cylinderGeometry args={[towerR, towerR * 1.12, towerH, 10]} />
            <meshStandardMaterial color={stone} roughness={0.8} fog={fog} />
          </mesh>
          <mesh position={[0, towerH + towerR * 0.9, 0]} castShadow>
            <coneGeometry args={[towerR * 1.3, towerR * 1.8, 10]} />
            <meshStandardMaterial color={roof} roughness={0.7} fog={fog} />
          </mesh>
        </group>
      ))}
      {/* gatehouse on the south wall */}
      <mesh position={[0, wallH * 0.75, -half]} castShadow>
        <boxGeometry args={[r * 0.3, wallH * 1.5, 6]} />
        <meshStandardMaterial color={stone} roughness={0.8} fog={fog} />
      </mesh>
      {/* two-tier central keep */}
      <mesh position={[0, h * 0.27, 0]} castShadow>
        <boxGeometry args={[r * 0.62, h * 0.54, r * 0.62]} />
        <meshStandardMaterial color={stone} roughness={0.78} fog={fog} />
      </mesh>
      <mesh position={[0, h * 0.54 + h * 0.14, 0]} castShadow>
        <boxGeometry args={[r * 0.4, h * 0.28, r * 0.4]} />
        <meshStandardMaterial color={stone} roughness={0.78} fog={fog} />
      </mesh>
      <mesh position={[0, h * 0.82 + h * 0.07, 0]} castShadow>
        <coneGeometry args={[r * 0.26, h * 0.14, 8]} />
        <meshStandardMaterial color={roof} emissive={roof} emissiveIntensity={0.1} roughness={0.7} fog={fog} />
      </mesh>
      {/* banner */}
      <mesh position={[0, h * 0.97, 0]}>
        <coneGeometry args={[r * 0.05, h * 0.1, 4]} />
        <meshStandardMaterial color="#c1442e" emissive="#c1442e" emissiveIntensity={0.25} roughness={0.6} fog={fog} />
      </mesh>
    </>
  );
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
    case 'ancient_tree':
      return '#67d982';
    case 'gate':
      return '#facc15';
    case 'keep':
      return '#a7b0c0';
    case 'ruin':
      return '#b8a38a';
    case 'town':
      return '#e0b67a';
    case 'castle':
      return '#9aa3b2';
    default:
      return '#f59e0b';
  }
}
