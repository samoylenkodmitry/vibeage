import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';
import {
  CHARACTER_MODELS, DEFAULT_CHARACTER_MODEL,
  type CharacterAnim, type CharacterModelId,
} from './characterModels';
import { WEAPON_SOCKET, weaponModelPath } from './weaponModels';
import { AssetErrorBoundary } from './world-art/AssetErrorBoundary';

/**
 * A real rigged, skinned, animated character. Model-agnostic: all model
 * specifics (GLB path, height, forward axis, clip names) come from the
 * characterModels registry keyed by `modelId`, so swapping in a paid/custom
 * model later is a registry edit, not a change here.
 *
 * Each instance gets its own skeleton (SkeletonUtils.clone) so characters
 * animate independently off the one cached download. Looping states (idle/walk/
 * run/attack) crossfade; clamp-once states (death) play through and hold the
 * final pose.
 */
export type { CharacterAnim };

// Preload the common models so they don't pop in on first sighting.
useGLTF.preload(CHARACTER_MODELS['kaykit-knight'].path);
useGLTF.preload(CHARACTER_MODELS['kaykit-barbarian'].path);
useGLTF.preload(CHARACTER_MODELS['kaykit-rogue-hooded'].path);

export function AnimatedCharacter({
  state,
  modelId = DEFAULT_CHARACTER_MODEL,
  targetHeight = 1.8,
  tint,
  weaponType,
}: {
  state: CharacterAnim;
  /** Which registry model to render. */
  modelId?: CharacterModelId;
  /** Desired rendered height in world units; the model auto-scales to it. */
  targetHeight?: number;
  /** Optional per-instance colour multiply (e.g. green goblin, olive orc). */
  tint?: string;
  /** Content weaponType (sword/staff/…); mounts the matching GLB in the hand. */
  weaponType?: string;
}) {
  const def = CHARACTER_MODELS[modelId];
  const { scene, animations } = useGLTF(def.path);
  // Per-instance skeleton clone so each character plays its own clip.
  // When a tint is set, clone the materials too (SkeletonUtils shares them by
  // default) and multiply the base colour so instances differ.
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
  // The hand socket KayKit authored for held weapons (part of the clone, so
  // per-instance). A weapon parented here follows the hand through every clip.
  const socket = useMemo(() => model.getObjectByName(WEAPON_SOCKET) ?? null, [model]);
  const weaponPath = weaponModelPath(weaponType);
  const { actions } = useAnimations(animations, model);
  const currentClip = useRef<string | null>(null);
  // When the model/tint changes, useAnimations returns a NEW actions object
  // (a fresh mixer on the new clone). currentClip still names the old clip, so
  // the early-return guard would skip playback and freeze the new model in its
  // bind pose. Track the actions identity and bypass the guard when it changes.
  const lastActions = useRef<typeof actions | null>(null);

  const fitScale = targetHeight / def.nativeHeight;

  useEffect(() => {
    const clipName = def.clips[state];
    const next = actions[clipName];
    if (!next) return;
    const actionsChanged = lastActions.current !== actions;
    lastActions.current = actions;
    if (currentClip.current === clipName && !actionsChanged) return;
    // Only crossfade from the previous clip on the SAME mixer.
    const prev = (!actionsChanged && currentClip.current) ? actions[currentClip.current] : null;
    next.reset();
    if (def.clampOnce.has(state)) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
    }
    if (actionsChanged) {
      next.play();
    } else {
      next.fadeIn(0.18).play();
      prev?.fadeOut(0.18);
    }
    currentClip.current = clipName;
  }, [state, actions, def]);

  return (
    <group rotation={[0, def.forwardYaw, 0]} position={[0, -def.groundOffset * fitScale, 0]}>
      <primitive object={model} scale={fitScale} />
      {weaponPath && socket && (
        // Own Suspense + error boundary so streaming OR a load failure of a
        // weapon only omits the weapon, never blanks/breaks the whole character.
        <AssetErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <WeaponOnBone path={weaponPath} bone={socket} />
          </Suspense>
        </AssetErrorBoundary>
      )}
    </group>
  );
}

/** Parents a (non-skinned) weapon GLB onto a skeleton bone imperatively — R3F
 *  can't target an arbitrary bone declaratively. Identity transform: KayKit's
 *  handslot is authored so the grip lands correctly. */
function WeaponOnBone({ path, bone }: { path: string; bone: THREE.Object3D }) {
  const { scene } = useGLTF(path);
  const weapon = useMemo(() => scene.clone(true), [scene]);
  useLayoutEffect(() => {
    bone.add(weapon);
    return () => { bone.remove(weapon); };
  }, [bone, weapon]);
  return null;
}
