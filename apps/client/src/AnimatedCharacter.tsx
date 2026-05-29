import { useEffect, useMemo, useRef } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';

/**
 * A real rigged, skinned, animated character — replaces the old
 * box/cone primitives with an articulated humanoid that idles, walks,
 * runs, and dies. The mesh is a CC0 model (see ASSET_MANIFEST.md); the
 * system is model-agnostic — swapping a different rigged GLB only needs
 * the CLIP map updated to that model's clip names (and any missing
 * states fall back gracefully).
 *
 * Scale is AUTO-FIT: we measure the model's real bounding box at load
 * and scale it to `targetHeight`, so any model (whatever its native
 * units) renders at the right size with its feet on the ground — no
 * per-model magic-number guessing.
 *
 * Each instance gets its own skeleton (SkeletonUtils.clone) so two
 * characters animate independently off the one cached download.
 */
const MODEL = '/models/characters/soldier.glb';
useGLTF.preload(MODEL);

export type CharacterAnim = 'idle' | 'walk' | 'run' | 'attack' | 'death';

/** Abstract states → this model's actual clip names. Soldier ships
 *  Idle / Walk / Run; attack reuses idle (no punch clip — better than a
 *  bad one) and death is synthesized procedurally below. */
const CLIP: Record<CharacterAnim, string> = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Run',
  attack: 'Idle',
  death: 'Idle',
};

export function AnimatedCharacter({
  state,
  targetHeight = 1.8,
}: {
  state: CharacterAnim;
  /** Desired rendered height in world units; the model auto-scales to it. */
  targetHeight?: number;
}) {
  const { scene, animations } = useGLTF(MODEL);
  // Per-instance skeleton clone so each character plays its own clip.
  const model = useMemo(() => cloneSkeleton(scene), [scene]);
  const { actions } = useAnimations(animations, model);
  const currentClip = useRef<string | null>(null);

  // Auto-fit: measure the rendered bounding box (rest pose) and derive
  // the scale + a feet-on-ground offset. Removes all per-model scale
  // guessing — any rigged GLB lands at targetHeight.
  const { fitScale, yOffset } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y;
    const s = h > 0.001 ? targetHeight / h : 1;
    return { fitScale: s, yOffset: -box.min.y * s };
  }, [model, targetHeight]);

  useEffect(() => {
    const clipName = CLIP[state];
    const next = actions[clipName];
    if (!next || currentClip.current === clipName) return;
    const prev = currentClip.current ? actions[currentClip.current] : null;
    next.reset();
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.fadeIn(0.2).play();
    prev?.fadeOut(0.2);
    currentClip.current = clipName;
  }, [state, actions]);

  // Death has no clip — synthesize it: the body tips forward onto the
  // ground (rotateX) and sinks slightly, reading as "fallen".
  const dead = state === 'death';
  return (
    <group rotation={dead ? [-Math.PI / 2, 0, 0] : [0, 0, 0]} position={[0, dead ? 0.1 : yOffset, 0]}>
      <primitive object={model} scale={fitScale} position={dead ? [0, yOffset, 0] : [0, 0, 0]} />
    </group>
  );
}
