import { useEffect, useMemo, useRef } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';

/**
 * A real rigged, skinned, animated character — replaces the old
 * box/cone primitives with an articulated body that idles, walks,
 * runs, attacks, and dies. The mesh is a CC0 model (see
 * public/models/ASSET_MANIFEST.md); the system is model-agnostic —
 * swapping in a different rigged GLB only needs the CLIP map below to
 * point at that model's clip names.
 *
 * Each instance gets its own skeleton (SkeletonUtils.clone) so two
 * characters animate independently off the one cached download.
 */
const MODEL = '/models/characters/robot-expressive.glb';
useGLTF.preload(MODEL);

export type CharacterAnim = 'idle' | 'walk' | 'run' | 'attack' | 'death';

/** Our abstract states → the model's actual clip names. */
const CLIP: Record<CharacterAnim, string> = {
  idle: 'Idle',
  walk: 'Walking',
  run: 'Running',
  attack: 'Punch',
  death: 'Death',
};

const ONCE: ReadonlySet<CharacterAnim> = new Set(['attack', 'death']);

export function AnimatedCharacter({
  state,
  scale = 0.5,
  yOffset = 0,
}: {
  state: CharacterAnim;
  scale?: number;
  yOffset?: number;
}) {
  const { scene, animations } = useGLTF(MODEL);
  // Per-instance skeleton clone so each character plays its own clip.
  const model = useMemo(() => cloneSkeleton(scene), [scene]);
  const { actions } = useAnimations(animations, model);
  const currentClip = useRef<string | null>(null);

  useEffect(() => {
    const clipName = CLIP[state];
    const next = actions[clipName];
    if (!next || currentClip.current === clipName) return;
    const prev = currentClip.current ? actions[currentClip.current] : null;
    const playOnce = ONCE.has(state);
    next.reset();
    next.setLoop(playOnce ? THREE.LoopOnce : THREE.LoopRepeat, playOnce ? 1 : Infinity);
    next.clampWhenFinished = state === 'death';
    next.fadeIn(0.2).play();
    prev?.fadeOut(0.2);
    currentClip.current = clipName;
  }, [state, actions]);

  return <primitive object={model} scale={scale} position={[0, yOffset, 0]} />;
}
