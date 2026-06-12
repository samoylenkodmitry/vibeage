import { useMemo } from 'react';
import * as THREE from 'three';
import { makeCozyTreeScatter, type PineTransform } from './cozyScatter';
import { InstancedModel } from './InstancedGltf';
import { CONIFER_TREE_A } from './proceduralTrees';
import { TREE_WIND } from './foliageScatter';
import type { WorldArtQuality } from './quality';
import type { WorldArtScene } from './worldArtScenes';

/**
 * The spawn-coast pine band, on the same painterly procedural conifers as the
 * global forest (proceduralTrees.ts). The original single hard cones were the
 * darkest, most toy-like silhouettes in every spawn screenshot. Reads the
 * same scatter table (cozyScatter.ts), so placement is unchanged.
 */
const PINE_TINTS = ['#5d7a52', '#54734e', '#688258'].map((hex) => new THREE.Color(hex));

export function CozyStarterPines({ scene, quality }: { scene: WorldArtScene; quality: WorldArtQuality }) {
  const trees = useMemo(() => makeCozyTreeScatter(scene, quality), [scene, quality]);
  const matrices = useMemo(() => trees.map((tree) => treeMatrix(tree)), [trees]);
  const colors = useMemo(() => trees.map((tree) => PINE_TINTS[tree.variant]), [trees]);
  return (
    <InstancedModel
      object={CONIFER_TREE_A}
      matrices={matrices}
      colors={colors}
      baseScale={1.6}
      wind={TREE_WIND}
      castShadow
    />
  );
}

function treeMatrix(t: PineTransform): THREE.Matrix4 {
  const scale = 1.1 + t.scaleVariance * 1.0;
  const m = new THREE.Matrix4();
  m.compose(
    new THREE.Vector3(t.x, t.y, t.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, t.rotationY, 0)),
    new THREE.Vector3(scale, scale, scale),
  );
  return m;
}
