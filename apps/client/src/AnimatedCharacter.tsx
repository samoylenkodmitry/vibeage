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
 * Each instance gets its own skeleton (SkeletonUtils.clone) so two
 * characters animate independently off the one cached download.
 *
 * Scale: the model already renders ~human-sized at scale 1 (its root
 * node bakes a unit conversion), so we scale by `targetHeight / NATIVE`.
 * NOTE: Box3 auto-fit does NOT work here — a skinned mesh reports its
 * tiny bind-pose bounds, not the rendered size, which blows the scale up.
 */
const MODEL = '/models/characters/soldier.glb';
/** soldier.glb renders ~1.8 world units tall at scale 1. */
const NATIVE_HEIGHT = 1.8;
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
  tint,
}: {
  state: CharacterAnim;
  /** Desired rendered height in world units; the model auto-scales to it. */
  targetHeight?: number;
  /** Optional per-instance colour multiply (e.g. green goblin, olive orc). */
  tint?: string;
}) {
  const { scene, animations } = useGLTF(MODEL);
  // Per-instance skeleton clone so each character plays its own clip.
  // When a tint is set, clone the materials too (SkeletonUtils shares
  // them by default) and multiply the base colour so instances differ.
  const model = useMemo(() => {
    const c = cloneSkeleton(scene);
    if (tint) {
      const col = new THREE.Color(tint);
      c.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const cloned = mat.clone();
        cloned.color = col;
        mesh.material = cloned;
      });
    }
    return c;
  }, [scene, tint]);
  const { actions } = useAnimations(animations, model);
  const currentClip = useRef<string | null>(null);

  const fitScale = targetHeight / NATIVE_HEIGHT;

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

  // Yaw +180°: the model's authored forward is -Z, but the entity group
  // faces +Z (atan2(vx,vz)), so without this the character walks backward.
  // Death has no clip — synthesize it: tip forward onto the ground (X).
  const dead = state === 'death';
  return (
    <group rotation={[dead ? -Math.PI / 2 : 0, Math.PI, 0]} position={[0, dead ? 0.1 : 0, 0]}>
      <primitive object={model} scale={fitScale} />
    </group>
  );
}
