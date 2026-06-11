import { useEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldLandmark } from '../../../../packages/content/worldFeatures';
import { seededRandom } from './foliageScatter';
import { GlowEmitter } from '../dynamicLights';

/**
 * Procedural settlements — towns (seeded hamlets around a well) and castles
 * (curtain walls + keep), rendered by WorldFeatures for landmark kinds
 * 'town' / 'castle'. Textured with the painterly procedural set from
 * scripts/generate-world-textures.mjs (timber framing, terracotta shingles,
 * castle granite, plaza dirt). Each settlement sits on a TOWN_PLATEAUS flat
 * disc (terrain.ts) and is deterministic from its landmark position.
 */
const HOUSE_WALL_COLORS = ['#d9c6a3', '#cdb791', '#e2d2b4', '#c4ad85'];
const HOUSE_ROOF_COLORS = ['#a0522d', '#8c4a2f', '#7d5a3c', '#9b6b43'];

/**
 * Painterly settlement textures (procedural set from
 * scripts/generate-world-textures.mjs): timber-framed walls, terracotta
 * shingle roofs, castle granite, trodden plaza dirt. Tinted per-house by the
 * existing palettes (map × color), so variety survives the texturing.
 */
export function useSettlementTextures() {
  const [timber, shingles, stone, dirt] = useLoader(THREE.TextureLoader, [
    '/textures/timber_wall_color.jpg',
    '/textures/roof_shingles_color.jpg',
    '/textures/castle_stone_color.jpg',
    '/textures/dirt_ground_color.jpg',
  ]);
  const textures = useMemo(() => {
    for (const t of [timber, shingles, stone, dirt]) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
    }
    // Big surfaces repeat their pattern; the originals stay 1:1 per face.
    const castleWall = stone.clone();
    castleWall.repeat.set(8, 2);
    const plazaDirt = dirt.clone();
    plazaDirt.repeat.set(12, 12);
    return { timber, shingles, stone, castleWall, plazaDirt };
  }, [timber, shingles, stone, dirt]);
  // The clones are OURS to free (useLoader caches and owns the originals);
  // settlements mount/unmount as the player walks in and out of landmark
  // range, so an undisposed clone leaks GPU memory on every visit.
  useEffect(() => () => {
    textures.castleWall.dispose();
    textures.plazaDirt.dispose();
  }, [textures]);
  return textures;
}

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

type SettlementTextures = ReturnType<typeof useSettlementTextures>;

function TownHouse({ house, fog, tex }: { house: TownHouseSpec; fog: boolean; tex: SettlementTextures }) {
  const bodyH = house.twoStory ? house.h * 1.7 : house.h;
  return (
    <group position={[house.x, 0, house.z]} rotation={[0, house.yaw, 0]}>
      {/* walls: timber-frame texture × per-house tint keeps the variety */}
      <mesh position={[0, bodyH / 2, 0]} castShadow>
        <boxGeometry args={[house.w, bodyH, house.d]} />
        <meshStandardMaterial map={tex.timber} color={house.wall} roughness={0.85} fog={fog} />
      </mesh>
      {/* roof: 4-sided cone rotated 45° = pyramid with a visible overhang */}
      <mesh position={[0, bodyH + house.h * 0.4, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[Math.hypot(house.w, house.d) * 0.62, house.h * 0.85, 4]} />
        <meshStandardMaterial map={tex.shingles} color={house.roof} roughness={0.8} fog={fog} />
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

export function TownLandmark({ landmark, fog }: { landmark: WorldLandmark; fog: boolean }) {
  const tex = useSettlementTextures();
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
        <meshStandardMaterial map={tex.plazaDirt} color="#bfb09a" roughness={0.98} transparent opacity={0.85} depthWrite={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} fog={fog} />
      </mesh>
      {town.houses.map((house, i) => (
        <TownHouse key={i} house={house} fog={fog} tex={tex} />
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
          {/* Real warm light pool on the plaza at night, via the shared
              dynamic-light pool (never a raw <pointLight/> — that recompiles
              every shader). Invisible against daylight, alive after dark. */}
          <group position={[0, 3.3, 0]}>
            <GlowEmitter color="#ffc25e" intensity={2.4} distance={22} />
          </group>
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
export function CastleLandmark({ landmark, color, fog }: { landmark: WorldLandmark; color: string; fog: boolean }) {
  const r = landmark.radius;
  const h = landmark.height;
  const half = r * 0.66;
  const wallH = h * 0.2;
  const towerH = h * 0.34;
  const towerR = r * 0.13;
  const stone = color;
  const tex = useSettlementTextures();
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
          <meshStandardMaterial map={tex.castleWall} color={stone} roughness={0.82} fog={fog} />
        </mesh>
      ))}
      {/* corner towers with conical roofs */}
      {corners.map(([cx, cz]) => (
        <group key={`${cx}:${cz}`} position={[cx, 0, cz]}>
          <mesh position={[0, towerH / 2, 0]} castShadow>
            <cylinderGeometry args={[towerR, towerR * 1.12, towerH, 10]} />
            <meshStandardMaterial map={tex.stone} color={stone} roughness={0.8} fog={fog} />
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
        <meshStandardMaterial map={tex.stone} color={stone} roughness={0.8} fog={fog} />
      </mesh>
      {/* two-tier central keep */}
      <mesh position={[0, h * 0.27, 0]} castShadow>
        <boxGeometry args={[r * 0.62, h * 0.54, r * 0.62]} />
        <meshStandardMaterial map={tex.stone} color={stone} roughness={0.78} fog={fog} />
      </mesh>
      <mesh position={[0, h * 0.54 + h * 0.14, 0]} castShadow>
        <boxGeometry args={[r * 0.4, h * 0.28, r * 0.4]} />
        <meshStandardMaterial map={tex.stone} color={stone} roughness={0.78} fog={fog} />
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
