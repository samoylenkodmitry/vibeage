import { useMemo } from 'react';
import * as THREE from 'three';
import type { WorldLandmark } from '../../../../packages/content/worldFeatures';
import { seededRandom } from './foliageScatter';
import { useSettlementTextures } from './SettlementLandmarks';
import { GlowEmitter } from '../dynamicLights';

/**
 * Wilderness POIs — the small named places (ruins, shrines, standing stones,
 * waycamps, obelisks) that dot the explorable band between spawn and the
 * settlements. Rendered by WorldFeatures for the matching landmark kinds.
 * Every layout is deterministic from the landmark position (seededRandom), so
 * a place always looks the same on every visit and for every player.
 */
const MOSSY_STONE = '#959c87';
const PALE_STONE = '#a8a294';

function landmarkSeed(landmark: WorldLandmark, salt: number) {
  return seededRandom(Math.round(landmark.position.x) ^ salt, Math.round(landmark.position.z));
}

/** Broken colonnade — a ring of columns, some standing, some toppled. */
export function RuinLandmark({ landmark, fog }: { landmark: WorldLandmark; fog: boolean }) {
  const tex = useSettlementTextures();
  const layout = useMemo(() => {
    const random = landmarkSeed(landmark, 0x2bad5eed);
    const count = Math.min(12, Math.max(6, Math.round(landmark.radius * 0.7)));
    const columns = Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + (random() - 0.5) * 0.3;
      const ring = landmark.radius * (0.72 + random() * 0.16);
      const standing = random() > 0.38;
      return {
        x: Math.cos(angle) * ring,
        z: Math.sin(angle) * ring,
        // standing columns are broken at varied heights; fallen ones lie flat
        h: landmark.height * (standing ? 0.35 + random() * 0.65 : 0.5 + random() * 0.4),
        standing,
        yaw: random() * Math.PI * 2,
        tint: random() < 0.4 ? MOSSY_STONE : PALE_STONE,
      };
    });
    const walls = Array.from({ length: 2 }, () => {
      const angle = random() * Math.PI * 2;
      return {
        x: Math.cos(angle) * landmark.radius * 0.5,
        z: Math.sin(angle) * landmark.radius * 0.5,
        w: landmark.radius * (0.4 + random() * 0.3),
        h: landmark.height * (0.25 + random() * 0.2),
        yaw: random() * Math.PI,
      };
    });
    return { columns, walls };
  }, [landmark]);
  return (
    <>
      {/* cracked dais the colonnade once enclosed */}
      <mesh position={[0, 0.25, 0]} receiveShadow>
        <cylinderGeometry args={[landmark.radius * 0.55, landmark.radius * 0.6, 0.5, 18]} />
        <meshStandardMaterial map={tex.stone} color={PALE_STONE} roughness={0.9} fog={fog} />
      </mesh>
      {layout.columns.map((col, i) => col.standing ? (
        <group key={i} position={[col.x, 0, col.z]}>
          <mesh position={[0, col.h / 2, 0]} castShadow>
            <cylinderGeometry args={[0.52, 0.62, col.h, 9]} />
            <meshStandardMaterial map={tex.stone} color={col.tint} roughness={0.85} fog={fog} />
          </mesh>
          <mesh position={[0, 0.25, 0]} castShadow>
            <boxGeometry args={[1.5, 0.5, 1.5]} />
            <meshStandardMaterial map={tex.stone} color={col.tint} roughness={0.9} fog={fog} />
          </mesh>
        </group>
      ) : (
        // toppled column half-sunk into the grass
        <mesh key={i} position={[col.x, 0.35, col.z]} rotation={[Math.PI / 2, 0, col.yaw]} castShadow>
          <cylinderGeometry args={[0.5, 0.58, col.h, 9]} />
          <meshStandardMaterial map={tex.stone} color={col.tint} roughness={0.9} fog={fog} />
        </mesh>
      ))}
      {layout.walls.map((wall, i) => (
        <mesh key={`w${i}`} position={[wall.x, wall.h / 2, wall.z]} rotation={[0, wall.yaw, 0]} castShadow>
          <boxGeometry args={[wall.w, wall.h, 1.1]} />
          <meshStandardMaterial map={tex.stone} color={MOSSY_STONE} roughness={0.9} fog={fog} />
        </mesh>
      ))}
    </>
  );
}

/** Small roofed wayshrine with a softly glowing star inside. */
export function ShrineLandmark({ landmark, fog }: { landmark: WorldLandmark; fog: boolean }) {
  const tex = useSettlementTextures();
  const h = landmark.height;
  return (
    <>
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[2.4, 0.6, 2.4]} />
        <meshStandardMaterial map={tex.stone} color={PALE_STONE} roughness={0.88} fog={fog} />
      </mesh>
      {[[-0.9, -0.9], [-0.9, 0.9], [0.9, -0.9], [0.9, 0.9]].map(([px, pz]) => (
        <mesh key={`${px}:${pz}`} position={[px, 0.6 + h * 0.32, pz]} castShadow>
          <cylinderGeometry args={[0.14, 0.17, h * 0.64, 7]} />
          <meshStandardMaterial map={tex.stone} color={PALE_STONE} roughness={0.85} fog={fog} />
        </mesh>
      ))}
      <mesh position={[0, 0.6 + h * 0.64 + h * 0.14, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[2.1, h * 0.32, 4]} />
        <meshStandardMaterial map={tex.stone} color={MOSSY_STONE} roughness={0.8} fog={fog} />
      </mesh>
      {/* the quiet star — gentle cool glow, alive at night via the light pool */}
      <mesh position={[0, 0.6 + h * 0.3, 0]}>
        <octahedronGeometry args={[0.34, 0]} />
        <meshStandardMaterial color="#cfe9ff" emissive="#8fc8ff" emissiveIntensity={1.6} roughness={0.3} fog={fog} />
      </mesh>
      <group position={[0, 0.6 + h * 0.3, 0]}>
        <GlowEmitter color="#8fc8ff" intensity={1.8} distance={16} />
      </group>
    </>
  );
}

/** Standing-stone circle around a low altar slab. */
export function StonesLandmark({ landmark, fog }: { landmark: WorldLandmark; fog: boolean }) {
  const tex = useSettlementTextures();
  const stones = useMemo(() => {
    const random = landmarkSeed(landmark, 0x57a9d057);
    const count = Math.min(9, Math.max(6, Math.round(landmark.radius * 0.65)));
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + (random() - 0.5) * 0.25;
      const ring = landmark.radius * (0.78 + random() * 0.14);
      return {
        x: Math.cos(angle) * ring,
        z: Math.sin(angle) * ring,
        w: 0.9 + random() * 0.6,
        h: landmark.height * (0.55 + random() * 0.45),
        d: 0.6 + random() * 0.3,
        yaw: angle + (random() - 0.5) * 0.5,
        tiltX: (random() - 0.5) * 0.16,
        tiltZ: (random() - 0.5) * 0.16,
        fallen: random() < 0.14,
        tint: random() < 0.35 ? MOSSY_STONE : PALE_STONE,
      };
    });
  }, [landmark]);
  return (
    <>
      {stones.map((stone, i) => (
        <mesh
          key={i}
          position={[stone.x, stone.fallen ? stone.w * 0.4 : stone.h * 0.46, stone.z]}
          rotation={stone.fallen ? [Math.PI / 2 - 0.08, stone.yaw, 0] : [stone.tiltX, stone.yaw, stone.tiltZ]}
          castShadow
        >
          <boxGeometry args={[stone.w, stone.h, stone.d]} />
          <meshStandardMaterial map={tex.stone} color={stone.tint} roughness={0.92} fog={fog} />
        </mesh>
      ))}
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[2.6, 0.7, 1.7]} />
        <meshStandardMaterial map={tex.stone} color={MOSSY_STONE} roughness={0.9} fog={fog} />
      </mesh>
    </>
  );
}

/** Wayside camp — tents around a fire ring that glows warm after dark. */
export function CampLandmark({ landmark, fog }: { landmark: WorldLandmark; fog: boolean }) {
  const layout = useMemo(() => {
    const random = landmarkSeed(landmark, 0x0ca3f1e5);
    const tents = Array.from({ length: 2 + (random() < 0.5 ? 1 : 0) }, (_, i) => {
      const angle = (i / 3) * Math.PI * 2 + random() * 0.7;
      const ring = landmark.radius * (0.45 + random() * 0.25);
      return {
        x: Math.cos(angle) * ring,
        z: Math.sin(angle) * ring,
        yaw: Math.atan2(-Math.sin(angle), -Math.cos(angle)) + (random() - 0.5) * 0.4,
        h: landmark.height * (0.75 + random() * 0.25),
      };
    });
    const fireStones = Array.from({ length: 6 }, (_, i) => ({
      x: Math.cos((i / 6) * Math.PI * 2) * 0.85,
      z: Math.sin((i / 6) * Math.PI * 2) * 0.85,
      s: 0.2 + random() * 0.12,
    }));
    return { tents, fireStones, logYaw: random() * Math.PI };
  }, [landmark]);
  return (
    <>
      {layout.tents.map((tent, i) => (
        <group key={i} position={[tent.x, 0, tent.z]} rotation={[0, tent.yaw, 0]}>
          <mesh position={[0, tent.h / 2, 0]} castShadow>
            <coneGeometry args={[tent.h * 0.78, tent.h, 6]} />
            <meshStandardMaterial color="#b3a081" roughness={0.92} fog={fog} />
          </mesh>
          <mesh position={[0, tent.h * 0.28, tent.h * 0.62]}>
            <boxGeometry args={[0.7, tent.h * 0.56, 0.1]} />
            <meshStandardMaterial color="#3b3226" roughness={0.95} fog={fog} />
          </mesh>
        </group>
      ))}
      {layout.fireStones.map((stone, i) => (
        <mesh key={`s${i}`} position={[stone.x, stone.s * 0.5, stone.z]} castShadow>
          <dodecahedronGeometry args={[stone.s, 0]} />
          <meshStandardMaterial color="#7d776c" roughness={0.95} fog={fog} />
        </mesh>
      ))}
      {/* embers — warm pool of light at night via the shared pool */}
      <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.55, 12]} />
        <meshStandardMaterial color="#3a2417" emissive="#ff7a33" emissiveIntensity={1.1} roughness={0.8} fog={fog} />
      </mesh>
      <group position={[0, 0.8, 0]}>
        <GlowEmitter color="#ff9a4d" intensity={2.0} distance={15} />
      </group>
      <mesh position={[landmark.radius * 0.3, 0.32, landmark.radius * 0.18]} rotation={[Math.PI / 2, 0, layout.logYaw]} castShadow>
        <cylinderGeometry args={[0.3, 0.34, 2.6, 8]} />
        <meshStandardMaterial color="#6b4a2f" roughness={0.95} fog={fog} />
      </mesh>
    </>
  );
}

/** Lone rune-marked obelisk — a waymark that hums with a faint inner light. */
export function ObeliskLandmark({ landmark, fog }: { landmark: WorldLandmark; fog: boolean }) {
  const tex = useSettlementTextures();
  const tilt = useMemo(() => {
    const random = landmarkSeed(landmark, 0x0be115c0);
    return { x: (random() - 0.5) * 0.07, z: (random() - 0.5) * 0.07 };
  }, [landmark]);
  const h = landmark.height;
  return (
    <>
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[2.2, 0.7, 2.2]} />
        <meshStandardMaterial map={tex.stone} color={PALE_STONE} roughness={0.88} fog={fog} />
      </mesh>
      <group rotation={[tilt.x, 0, tilt.z]}>
        <mesh position={[0, 0.7 + h * 0.42, 0]} castShadow>
          <cylinderGeometry args={[h * 0.045, h * 0.085, h * 0.84, 4]} />
          <meshStandardMaterial map={tex.stone} color={PALE_STONE} roughness={0.8} fog={fog} />
        </mesh>
        <mesh position={[0, 0.7 + h * 0.84 + h * 0.05, 0]} castShadow>
          <coneGeometry args={[h * 0.05, h * 0.1, 4]} />
          <meshStandardMaterial color="#d8e7f2" emissive="#9fd4ff" emissiveIntensity={0.5} roughness={0.5} fog={fog} />
        </mesh>
        {/* rune band */}
        <mesh position={[0, 0.7 + h * 0.4, 0]}>
          <cylinderGeometry args={[h * 0.068, h * 0.07, h * 0.08, 4]} />
          <meshStandardMaterial color="#bfe2ff" emissive="#7fc4ff" emissiveIntensity={0.9} roughness={0.4} fog={fog} />
        </mesh>
      </group>
    </>
  );
}
