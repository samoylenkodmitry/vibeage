import { useMemo } from 'react';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Procedural fishing rod stuck in the sand next to the rowboat —
 * tells a small story: "someone's living here". One thin tapered
 * cylinder for the rod plus a string segment + a tiny float ball
 * resting on the water.
 *
 * Anchored to each rowboat prop with a small offset.
 */
const ROD_COLOR = '#8a6334';
const STRING_COLOR = '#dddddd';
const FLOAT_COLOR = '#d24a3b';

export function CozyFishingRods({ scene }: { scene: WorldArtScene }) {
  const rods = useMemo(() => {
    return (scene.props ?? [])
      .filter((p) => p.id === 'rowboat')
      .map((p, i) => ({
        baseX: scene.origin.x + p.position.x + 6,
        baseZ: scene.origin.z + p.position.z + 2 + i * 0.6,
      }));
  }, [scene]);
  if (rods.length === 0) return null;
  return (
    <group raycast={() => null}>
      {rods.map((r, i) => (
        <Rod key={`${scene.id}-rod-${i}`} baseX={r.baseX} baseZ={r.baseZ} />
      ))}
    </group>
  );
}

function Rod({ baseX, baseZ }: { baseX: number; baseZ: number }) {
  const rodHeight = 2.4;
  const tipX = baseX - 2.2;
  const tipY = 0.6 + rodHeight * 0.85;
  return (
    <group position={[baseX, 0, baseZ]}>
      {/* Rod — tapered cylinder leaning toward the water */}
      <mesh position={[-1.1, rodHeight / 2 - 0.2, 0]} rotation={[0, 0, Math.PI / 3]} castShadow={false}>
        <cylinderGeometry args={[0.018, 0.06, rodHeight, 6]} />
        <meshStandardMaterial color={ROD_COLOR} roughness={0.85} metalness={0.05} />
      </mesh>
      {/* String — thin cylinder from rod tip toward the float */}
      <mesh
        position={[(-(baseX - tipX) - 1.1) / 2 - 0.55, (tipY + 0.05) / 2, 0]}
        rotation={[0, 0, Math.atan2(0.05 - tipY, baseX - tipX) + Math.PI / 2]}
        castShadow={false}
      >
        <cylinderGeometry args={[0.006, 0.006, Math.hypot(baseX - tipX, tipY - 0.05), 4]} />
        <meshBasicMaterial color={STRING_COLOR} transparent opacity={0.7} />
      </mesh>
      {/* Float — tiny sphere bobbing on the water (no animation;
         the water plane is at y ≈ -0.18, float sits a hair above) */}
      <mesh position={[-(baseX - tipX) - 0.7, 0.05, 0]}>
        <sphereGeometry args={[0.09, 8, 6]} />
        <meshBasicMaterial color={FLOAT_COLOR} />
      </mesh>
    </group>
  );
}
