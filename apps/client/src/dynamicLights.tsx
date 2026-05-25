import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Fixed-size dynamic point-light pool.
 *
 * three.js bakes the live light count (NUM_POINT_LIGHTS) into every
 * material's shader, so adding/removing a point light recompiles every
 * program in the scene. With per-enemy / per-VFX / per-loot lights that
 * count churned constantly and, on slow GPUs, the synchronous shader
 * relink froze the frame for seconds (getProgramInfoLog).
 *
 * Fix: never mount/unmount point lights during play. A constant pool of
 * `MAX_DYNAMIC_LIGHTS` is rendered once; glow sources register a marker
 * object (via <GlowEmitter/>) instead of their own light, and each frame
 * the pool assigns its lights to the nearest registered glows (highest
 * priority first), parking the rest at intensity 0. Light count is fixed,
 * so the scene never recompiles.
 */

const MAX_DYNAMIC_LIGHTS = 6;
const CULL_DISTANCE = 120;

type GlowMeta = { color: string; intensity: number; distance: number; priority: number };

// Keyed by the marker Object3D so position auto-tracks the parent group
// (enemies move, the marker moves, the light follows — no per-source loop).
const glowRegistry = new Map<THREE.Object3D, GlowMeta>();

/**
 * Registers a glow at this point in the scene graph WITHOUT rendering a
 * real light. Drop-in replacement for a `<pointLight>` child: position
 * comes from the parent group, the pool supplies the actual light.
 */
export function GlowEmitter({
  color, intensity, distance, priority = 0,
}: {
  color: string;
  intensity: number;
  distance: number;
  priority?: number;
}) {
  const ref = useRef<THREE.Object3D>(null);
  useEffect(() => {
    const marker = ref.current;
    if (!marker) return undefined;
    glowRegistry.set(marker, { color, intensity, distance, priority });
    return () => {
      glowRegistry.delete(marker);
    };
  }, [color, intensity, distance, priority]);
  return <object3D ref={ref} />;
}

type Scored = { x: number; y: number; z: number; meta: GlowMeta; d: number };

export function DynamicLightPool({ focus }: { focus: { x: number; y: number; z: number } }) {
  const lightsRef = useRef<(THREE.PointLight | null)[]>([]);
  const worldPos = useMemo(() => new THREE.Vector3(), []);
  const focusVec = useMemo(() => new THREE.Vector3(), []);
  const scored = useMemo<Scored[]>(() => [], []);

  useFrame(() => {
    focusVec.set(focus.x, focus.y, focus.z);
    scored.length = 0;
    for (const [marker, meta] of glowRegistry) {
      marker.getWorldPosition(worldPos);
      const d = worldPos.distanceTo(focusVec);
      if (d > CULL_DISTANCE) continue;
      scored.push({ x: worldPos.x, y: worldPos.y, z: worldPos.z, meta, d });
    }
    // Highest priority first (bosses beat ambient), then nearest.
    scored.sort((a, b) => (b.meta.priority - a.meta.priority) || (a.d - b.d));
    for (let i = 0; i < MAX_DYNAMIC_LIGHTS; i += 1) {
      const light = lightsRef.current[i];
      if (!light) continue;
      const pick = scored[i];
      if (pick) {
        light.position.set(pick.x, pick.y, pick.z);
        light.color.set(pick.meta.color);
        light.intensity = pick.meta.intensity;
        light.distance = pick.meta.distance;
      } else {
        light.intensity = 0;
      }
    }
  });

  return (
    <>
      {Array.from({ length: MAX_DYNAMIC_LIGHTS }).map((_, i) => (
        <pointLight
          key={i}
          ref={(el) => {
            lightsRef.current[i] = el;
          }}
          intensity={0}
          distance={1}
        />
      ))}
    </>
  );
}
