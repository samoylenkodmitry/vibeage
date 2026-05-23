import type { WorldArtScene } from './worldArtScenes';

/**
 * Pale-sand band along the cozy-coast waterline. Sits just above
 * the existing terrain so the player sees a clear sand-to-water
 * transition without having to retexture the procedural ground.
 *
 * raycast disabled — same reason as the water: clicks fall through
 * to the gameplay collider underneath. Once `WorldGround` gets a
 * proper textured mode (PR 3 in the plan), this strip is what we
 * blend the texture's beach band against.
 */
export function CozyShoreBand({ scene }: { scene: WorldArtScene }) {
  const { waterline } = scene;
  const bandX = waterline.x + waterline.width / 2 + 18;
  return (
    <mesh
      position={[bandX, 0.02, waterline.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      raycast={() => null}
      receiveShadow={false}
    >
      <planeGeometry args={[44, waterline.length * 0.95]} />
      <meshStandardMaterial color="#efe0b6" roughness={1} metalness={0} transparent depthWrite={false} opacity={0.85} />
    </mesh>
  );
}
