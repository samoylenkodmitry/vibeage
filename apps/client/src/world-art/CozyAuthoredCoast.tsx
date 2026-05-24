import { Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Clone, useGLTF } from '@react-three/drei';
import type { Group } from 'three';
import { AssetErrorBoundary } from './AssetErrorBoundary';
import { getAssetForPropAnchor, type WorldArtAsset } from './assetRegistry';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Hand-placed props for the cozy hero scene. Where `CozyPineForest`
 * scatters foliage procedurally, this component reads each scene's
 * `props` array and clones GLBs at the exact authored positions —
 * the dock juts straight into the water, the rowboat floats beside
 * it, the bonfire sits on dry sand. The result reads as a composed
 * tableau rather than randomly populated wilderness.
 *
 * Asset paths live in `assetRegistry.ts` keyed by anchor id, so a
 * scene's `props: [{ id: 'dock', position: ... }]` resolves to a
 * concrete GLB without leaking paths into the scene description.
 *
 * Error and loading handling mirrors `CozyPineForest`: Suspense
 * fallback to nothing (the scatter foliage already paints the
 * scene), and an `AssetErrorBoundary` swallows runtime errors so
 * the rest of the cozy layer keeps rendering.
 */
export function CozyAuthoredCoast({ scene }: { scene: WorldArtScene }) {
  if (!scene.props || scene.props.length === 0) return null;
  return (
    <AssetErrorBoundary fallback={null}>
      <Suspense fallback={null}>
        <PlacedProps scene={scene} />
      </Suspense>
    </AssetErrorBoundary>
  );
}

function PlacedProps({ scene }: { scene: WorldArtScene }) {
  const placements = useMemo(() => {
    return (scene.props ?? []).flatMap((anchor) => {
      const asset = getAssetForPropAnchor(anchor.id);
      return asset ? [{ anchor, asset }] : [];
    });
  }, [scene.props]);
  const paths = useMemo(() => placements.map((p) => p.asset.path), [placements]);
  const gltfs = useGLTF(paths);
  const arr = Array.isArray(gltfs) ? gltfs : [gltfs];
  return (
    <group position={[scene.origin.x, 0, scene.origin.z]} rotation={[0, scene.rotationY, 0]}>
      {placements.map(({ anchor, asset }, i) => (
        <PlacedProp key={anchor.id} anchor={anchor} asset={asset} gltfScene={arr[i].scene as Group} />
      ))}
    </group>
  );
}

function PlacedProp({
  anchor, asset, gltfScene,
}: {
  anchor: NonNullable<WorldArtScene['props']>[number];
  asset: WorldArtAsset;
  gltfScene: Group;
}) {
  const scale = anchor.scale * asset.baseScale;
  const groupRef = useRef<Group>(null);
  // Floats on water get a gentle bob + slight roll. Static props
  // (dock, bonfire) ignore the animation.
  const floats = anchor.id === 'rowboat';
  const baseY = anchor.position.y + asset.yOffset;
  useFrame(({ clock }) => {
    if (!floats) return;
    const g = groupRef.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.position.y = baseY + Math.sin(t * 0.9) * 0.08;
    g.rotation.z = Math.sin(t * 0.7 + 0.4) * 0.04;
    g.rotation.x = Math.sin(t * 0.5 + 1.1) * 0.03;
  });
  return (
    <group
      ref={groupRef}
      position={[anchor.position.x, baseY, anchor.position.z]}
      rotation={[0, anchor.rotationY, 0]}
      scale={scale}
    >
      <Clone object={gltfScene} />
    </group>
  );
}
