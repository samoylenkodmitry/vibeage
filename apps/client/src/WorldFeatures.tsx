import { Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
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
import { computeDayPhase } from './timeOfDay';
import type { Vec3D } from '../../../packages/protocol/messages';
import { CastleLandmark, TownLandmark, useSettlementTextures } from './world-art/SettlementLandmarks';
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
  const lastPhaseRef = useRef(0);
  useFrame(({ clock }) => {
    riverMaterial.uniforms.uTime.value = clock.elapsedTime;
    // The river mirrors the day-phase atmosphere like the lakes/coast.
    if (clock.elapsedTime - lastPhaseRef.current > 0.25) {
      lastPhaseRef.current = clock.elapsedTime;
      riverMaterial.uniforms.uPhaseTint.value.set(computeDayPhase(Date.now()).fogColor);
    }
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
        <Suspense key={landmark.id} fallback={null}>
          <LandmarkMesh landmark={landmark} focus={focus} />
        </Suspense>
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
      uPhaseTint: { value: new THREE.Color('#a4d2e3') },
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
      uniform vec3 uPhaseTint;
      void main() {
        // Downstream-drifting ripple bands + a cross shimmer.
        float flow = sin(vLocal.y * 0.55 - uTime * 2.4) * 0.5
                   + sin(vLocal.y * 1.7 - uTime * 3.6 + vLocal.x * 0.8) * 0.5;
        vec3 color = mix(uDeep, uShallow, 0.45 + flow * 0.25);
        color = mix(color, uPhaseTint, 0.2); // day-phase sky reflection
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

function LandmarkMesh({ landmark, focus }: { landmark: WorldLandmark; focus: Vec3D }) {
  const terrain = sampleTerrain(landmark.position.x, landmark.position.z);
  // Stone for the built landmarks (keep/gate/spire) — the flat-colour
  // primitives read as plastic toys (user feedback).
  const stone = useSettlementTextures().stone;
  const color = getLandmarkColor(landmark);
  // Fog applies to EVERY landmark now — the unfogged mega "beacons" read as
  // glowing toy cones floating over the horizon (user feedback). They still
  // loom inside the vista haze; they just obey the same air as the world.
  const fog = true;
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
      <GhostGroup opacity={landmarkGhostOpacity(landmark, focus)}>
        {renderLandmarkShape(landmark, color, fog, stone)}
      </GhostGroup>
    </group>
  );
}

// Past the vista fog every landmark is 100% fog-saturated — a SOLID slab of
// fog colour against a brighter sky gradient. The mega spires read as flat
// purple skyscrapers at dawn/dusk (user screenshots). Atmospheric perspective
// needs them to thin out, not just tint: fade opacity from solid inside the
// vista (≤2.6 km) down to a ghostly floor by 6 km, so distant silhouettes let
// the sky through like real far-off objects in haze.
const GHOST_NEAR = 2_600;
const GHOST_FAR = 6_000;
const GHOST_FLOOR = 0.3;

function landmarkGhostOpacity(landmark: WorldLandmark, focus: Vec3D): number {
  const dist = Math.hypot(landmark.position.x - focus.x, landmark.position.z - focus.z);
  const t = THREE.MathUtils.clamp((dist - GHOST_NEAR) / (GHOST_FAR - GHOST_NEAR), 0, 1);
  // Quantized so walking doesn't churn material writes every frame.
  return Math.round((1 - t * (1 - GHOST_FLOOR)) * 50) / 50;
}

/**
 * Applies a uniform opacity to every material under it (multiplied into each
 * material's own base opacity). The effect runs after every render — children
 * can mount late through Suspense — but writes only when a material's applied
 * value actually changes. Restores base opacity/transparency at opacity 1.
 */
function GhostGroup({ opacity, children }: { opacity: number; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    ref.current?.traverse((object) => {
      const material = (object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!material) return;
      for (const mat of Array.isArray(material) ? material : [material]) {
        if (mat.userData.ghostBaseOpacity === undefined) {
          mat.userData.ghostBaseOpacity = mat.opacity;
          mat.userData.ghostBaseTransparent = mat.transparent;
        }
        if (mat.userData.ghostApplied === opacity) continue;
        mat.userData.ghostApplied = opacity;
        const solid = opacity >= 0.999;
        mat.transparent = solid ? mat.userData.ghostBaseTransparent === true : true;
        mat.opacity = mat.userData.ghostBaseOpacity * (solid ? 1 : opacity);
      }
    });
  });
  return <group ref={ref}>{children}</group>;
}

function renderLandmarkShape(landmark: WorldLandmark, color: string, fog: boolean, stone?: THREE.Texture) {
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
    return renderGateLandmark(landmark, color, fog, stone);
  }
  if (landmark.kind === 'keep') {
    return renderKeepLandmark(landmark, color, fog, stone);
  }
  if (landmark.kind === 'spire') {
    return renderSpireLandmark(landmark, color, fog, stone);
  }
  if (landmark.kind === 'crystal') {
    return renderCrystalLandmark(landmark, color, fog);
  }
  if (landmark.kind === 'town') {
    return (
      <Suspense fallback={null}>
        <TownLandmark landmark={landmark} fog={fog} />
      </Suspense>
    );
  }
  if (landmark.kind === 'castle') {
    return (
      <Suspense fallback={null}>
        <CastleLandmark landmark={landmark} color={color} fog={fog} />
      </Suspense>
    );
  }
  return (
    <mesh position={[0, landmark.height * 0.5, 0]} castShadow={!landmark.mega}>
      <coneGeometry args={[landmark.radius * 0.54, landmark.height, landmark.mega ? 10 : 6]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.04} roughness={0.55} fog={fog} />
    </mesh>
  );
}

function renderTreeLandmark(landmark: WorldLandmark, color: string, fog: boolean) {
  // Organic low-poly canopy instead of the old stacked cones (which read as
  // green toy triangles — user feedback): a seeded cluster of squashed
  // icosahedron blobs with tint variation around the crown, flat-shaded for
  // the stylized look. Deterministic from the landmark position.
  const random = seededRandom(Math.round(landmark.position.x) ^ 0x5f3759df, Math.round(landmark.position.z));
  const blobCount = landmark.mega ? 7 : 5;
  const crownY = landmark.height * 0.62;
  const crownR = landmark.radius * 0.85;
  const blobs = Array.from({ length: blobCount }, (_, index) => {
    const angle = (index / blobCount) * Math.PI * 2 + random() * 0.8;
    const ring = index === 0 ? 0 : crownR * (0.35 + random() * 0.4);
    return {
      x: Math.cos(angle) * ring,
      y: crownY + (index === 0 ? landmark.height * 0.12 : (random() - 0.3) * landmark.height * 0.18),
      z: Math.sin(angle) * ring,
      r: crownR * (index === 0 ? 0.85 : 0.45 + random() * 0.3),
      squash: 0.62 + random() * 0.22,
      shade: 0.82 + random() * 0.35,
    };
  });
  return (
    <>
      <mesh position={[0, landmark.height * 0.3, 0]} castShadow={!landmark.mega}>
        <cylinderGeometry args={[landmark.radius * 0.16, landmark.radius * 0.3, landmark.height * 0.6, 8]} />
        <meshStandardMaterial color="#6b4a2f" roughness={0.9} fog={fog} flatShading />
      </mesh>
      {blobs.map((blob, index) => (
        <mesh key={index} position={[blob.x, blob.y, blob.z]} scale={[1, blob.squash, 1]} castShadow={!landmark.mega}>
          <icosahedronGeometry args={[blob.r, 1]} />
          <meshStandardMaterial
            color={new THREE.Color(color).multiplyScalar(blob.shade)}
            roughness={0.85}
            fog={fog}
            flatShading
          />
        </mesh>
      ))}
    </>
  );
}

function renderGateLandmark(landmark: WorldLandmark, color: string, fog: boolean, stone?: THREE.Texture) {
  return (
    <>
      <mesh position={[-landmark.radius * 0.42, landmark.height * 0.32, 0]} castShadow={!landmark.mega}>
        <boxGeometry args={[landmark.radius * 0.2, landmark.height * 0.64, landmark.radius * 0.22]} />
        <meshStandardMaterial map={stone} color={color} roughness={0.76} fog={fog} />
      </mesh>
      <mesh position={[landmark.radius * 0.42, landmark.height * 0.32, 0]} castShadow={!landmark.mega}>
        <boxGeometry args={[landmark.radius * 0.2, landmark.height * 0.64, landmark.radius * 0.22]} />
        <meshStandardMaterial map={stone} color={color} roughness={0.76} fog={fog} />
      </mesh>
      <mesh position={[0, landmark.height * 0.66, 0]} castShadow={!landmark.mega}>
        <boxGeometry args={[landmark.radius * 1.08, landmark.height * 0.14, landmark.radius * 0.28]} />
        <meshStandardMaterial map={stone} color={color} emissive={color} emissiveIntensity={0.04} roughness={0.7} fog={fog} />
      </mesh>
      <mesh position={[0, landmark.height * 0.82, 0]} castShadow={!landmark.mega}>
        <coneGeometry args={[landmark.radius * 0.36, landmark.height * 0.18, 6]} />
        <meshStandardMaterial map={stone} color={color} emissive={color} emissiveIntensity={0.04} roughness={0.7} fog={fog} />
      </mesh>
    </>
  );
}

function renderKeepLandmark(landmark: WorldLandmark, color: string, fog: boolean, stone?: THREE.Texture) {
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
        <meshStandardMaterial map={stone} color={color} roughness={0.78} fog={fog} />
      </mesh>
      <mesh position={[0, baseHeight + innerHeight * 0.5, 0]} castShadow={!landmark.mega}>
        <boxGeometry args={[landmark.radius * 0.96, innerHeight, landmark.radius * 0.96]} />
        <meshStandardMaterial map={stone} color={color} roughness={0.78} fog={fog} />
      </mesh>
      <mesh position={[0, baseHeight + innerHeight + towerHeight * 0.5, 0]} castShadow={!landmark.mega}>
        <cylinderGeometry args={[landmark.radius * 0.42, landmark.radius * 0.46, towerHeight, 12]} />
        <meshStandardMaterial map={stone} color={color} roughness={0.78} fog={fog} />
      </mesh>
      <mesh position={[0, baseHeight + innerHeight + towerHeight + landmark.height * 0.04, 0]} castShadow={false}>
        <coneGeometry args={[landmark.radius * 0.5, landmark.height * 0.18, 8]} />
        <meshStandardMaterial map={stone} color={color} emissive={color} emissiveIntensity={0.05} roughness={0.7} fog={fog} />
      </mesh>
      {corners.map(([cx, cz]) => (
        <mesh key={`${cx}:${cz}`} position={[cx, cornerHeight * 0.5, cz]} castShadow={!landmark.mega}>
          <cylinderGeometry args={[cornerSize, cornerSize, cornerHeight, 8]} />
          <meshStandardMaterial map={stone} color={color} roughness={0.74} fog={fog} />
        </mesh>
      ))}
    </>
  );
}

function renderSpireLandmark(landmark: WorldLandmark, color: string, fog: boolean, stone?: THREE.Texture) {
  const tiers = landmark.mega ? 5 : 3;
  return (
    <>
      <mesh position={[0, landmark.height * 0.05, 0]} castShadow={!landmark.mega}>
        <cylinderGeometry args={[landmark.radius * 0.7, landmark.radius * 0.85, landmark.height * 0.1, 12]} />
        <meshStandardMaterial map={stone} color={color} roughness={0.7} fog={fog} />
      </mesh>
      {Array.from({ length: tiers }).map((_, index) => {
        const t = index / Math.max(1, tiers);
        const y = landmark.height * (0.1 + t * 0.78);
        const r = landmark.radius * (0.62 - t * 0.42);
        const h = landmark.height * (0.32 - t * 0.04);
        return (
          <mesh key={index} position={[0, y, 0]} castShadow={!landmark.mega}>
            <coneGeometry args={[r, h, landmark.mega ? 14 : 8]} />
            <meshStandardMaterial map={stone} color={color} emissive={color} emissiveIntensity={0.05} roughness={0.6} fog={fog} />
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
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={landmark.mega ? 0.26 : 0.16} roughness={0.5} fog={fog} />
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
