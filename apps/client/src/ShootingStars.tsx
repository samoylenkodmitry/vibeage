import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { computeDayPhase } from './timeOfDay';

/**
 * Occasional shooting stars across the night sky. Two slots,
 * each spawning a fast streak that crosses the dome in ~1.2 s
 * and then waits a randomized cooldown before respawning. Only
 * runs when nightness is high — silent at noon.
 *
 * Implementation: a single thin elongated cylinder per slot,
 * positioned at a random world-edge angle and moved along the
 * `direction` vector each frame. fog disabled so the streak
 * stays bright through distance haze.
 */
const SLOTS = 2;
const DOME_RADIUS = 420;
const STREAK_SPEED = 220;
const STREAK_LIFETIME = 1.2;
const COOLDOWN_MIN = 8;
const COOLDOWN_MAX = 32;
const STREAK_COLOR = '#f6f0c4';

type Streak = {
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  age: number;
  cooldown: number;
  lifetime: number;
  active: boolean;
};

export function ShootingStars() {
  const slots = useMemo<Streak[]>(() => Array.from({ length: SLOTS }, () => ({
    origin: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    age: 0,
    cooldown: Math.random() * COOLDOWN_MAX,
    lifetime: STREAK_LIFETIME,
    active: false,
  })), []);
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const palette = computeDayPhase(Date.now());
    const nightness = clamp(1 - smoothstep(-0.05, 0.18, palette.sunDir.y), 0, 1);
    for (let i = 0; i < slots.length; i += 1) {
      const s = slots[i];
      const mesh = meshRefs.current[i];
      if (!mesh) continue;
      if (!s.active) {
        s.cooldown -= dt;
        if (s.cooldown <= 0 && nightness > 0.4) {
          spawnStreak(s);
          s.active = true;
          s.age = 0;
        } else {
          mesh.visible = false;
          continue;
        }
      }
      s.age += dt;
      const t = s.age / s.lifetime;
      if (t >= 1) {
        s.active = false;
        s.cooldown = COOLDOWN_MIN + Math.random() * (COOLDOWN_MAX - COOLDOWN_MIN);
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      const p = new THREE.Vector3().copy(s.origin).addScaledVector(s.direction, STREAK_SPEED * s.age);
      mesh.position.copy(p);
      // Orient streak along direction. Cylinder Y axis maps to
      // direction; THREE.Quaternion.setFromUnitVectors handles it.
      const up = new THREE.Vector3(0, 1, 0);
      mesh.quaternion.setFromUnitVectors(up, s.direction);
      // Fade in fast, fade out slowly.
      const fade = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      mesh.scale.set(fade, 1, fade);
    }
  });
  return (
    <group raycast={() => null}>
      {slots.map((_, i) => (
        <mesh
          key={`shooting-${i}`}
          ref={(m) => { meshRefs.current[i] = m; }}
          visible={false}
        >
          <cylinderGeometry args={[0.25, 0, 12, 6]} />
          <meshBasicMaterial color={STREAK_COLOR} transparent opacity={0.95} fog={false} />
        </mesh>
      ))}
    </group>
  );
}

function spawnStreak(s: Streak): void {
  // Random origin on the dome: pick an angle around Y, pick a
  // small altitude offset. Direction is mostly horizontal with a
  // downward bias.
  const startAngle = Math.random() * Math.PI * 2;
  const altitude = 60 + Math.random() * 80;
  s.origin.set(
    Math.cos(startAngle) * DOME_RADIUS,
    altitude,
    Math.sin(startAngle) * DOME_RADIUS,
  );
  // Direction tangent to the dome, mostly horizontal.
  const tangentAngle = startAngle + Math.PI / 2 + (Math.random() - 0.5) * 0.6;
  s.direction.set(
    Math.cos(tangentAngle),
    -0.1 - Math.random() * 0.1,
    Math.sin(tangentAngle),
  ).normalize();
  s.lifetime = STREAK_LIFETIME * (0.8 + Math.random() * 0.4);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
