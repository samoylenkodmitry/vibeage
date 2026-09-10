import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  applyCameraDragDelta,
  applyPinchZoom,
  applyWheelZoom,
  CAMERA_DISTANCE,
  CAMERA_FOCUS_RESPONSE,
  CAMERA_POSITION_RESPONSE,
  createCameraKick,
  getTouchCentroid,
  hasMeaningfulCameraFocusDelta,
  isCameraHitStopped,
  pinchDistance,
  sampleCameraKick,
  smoothingAlpha,
  writeCameraOrbitPosition,
  type CameraKick,
} from './cameraRig';
import type { Vec3 } from './gameTypes';
import { getTerrainY } from './worldSceneConfig';
import { motionGain, subscribeCombatImpacts } from './combatFeel';

export type CameraControls = {
  applyDelta: (delta: { x: number; y: number }) => void;
};

const CAMERA_FOCUS_HEIGHT = 0.6;
// Any focus jump beyond this can't be walking — snap instead of gliding.
const CAMERA_SNAP_DISTANCE_SQ = 40 * 40;
const CAMERA_GROUND_BUFFER = 1.4;
const SKY_LOOKUP_PITCH_MIN = 0.06;
const SKY_LOOKUP_GAIN = 3.0;
const SKY_LOOKUP_MAX_RATIO = 4.5;
const lookAtTempVec = new THREE.Vector3();
const kickTempVec = new THREE.Vector3();

type TouchPoint = { x: number; y: number };

export function CameraRig({
  focus,
  presentationFocusRef,
  cameraAngleRef,
  cameraControlsRef,
  touchClaimRef,
}: {
  focus: Vec3;
  presentationFocusRef: MutableRefObject<THREE.Vector3 | null>;
  cameraAngleRef?: MutableRefObject<number>;
  cameraControlsRef?: MutableRefObject<CameraControls | null>;
  touchClaimRef?: MutableRefObject<Set<number>>;
}) {
  const { camera, gl } = useThree();
  const angleRef = useRef(Math.PI * 0.82);
  const pitchRef = useRef(0.46);
  const distanceRef = useRef(CAMERA_DISTANCE);
  const initialFocusY = getTerrainY(focus.x, focus.z) + CAMERA_FOCUS_HEIGHT;
  const focusRef = useRef(new THREE.Vector3(focus.x, initialFocusY, focus.z));
  const focusTargetRef = useRef(new THREE.Vector3(focus.x, initialFocusY, focus.z));
  const cameraTargetRef = useRef(new THREE.Vector3());
  // The smoothed follow position, kept apart from `camera.position` so an
  // impact kick can be added on top without the next frame's lerp starting
  // from the displaced eye (which would smear the jolt into a drift).
  const basePositionRef = useRef<THREE.Vector3 | null>(null);
  const kickRef = useRef<CameraKick | null>(null);
  // Any deliberate camera input cancels the kick outright. The kick only ever
  // displaces the eye, so dropping it lands exactly on the player's own orbit —
  // the shake can never fight a drag, a pinch or a zoom.
  const cancelKick = useCallback(() => { kickRef.current = null; }, []);
  const dragTargets = useMemo<DragTargets>(() => ({ angleRef, pitchRef, distanceRef }), []);
  useCameraDragControls(gl, dragTargets, touchClaimRef, cancelKick);
  useCameraWheelZoom(gl, distanceRef, cancelKick);
  useCombatCameraKick(kickRef);
  useCameraControlsHandle(cameraControlsRef, dragTargets);

  useFrame((_, delta) => {
    const now = performance.now();
    // Hit-stop: hold the whole follow rig dead still for a few frames after a
    // crit or a kill. The world keeps simulating (the server never stops) — it
    // is only the camera that pauses, which is what reads as impact.
    if (isCameraHitStopped(kickRef.current, now)) {
      applyCameraKick(camera, basePositionRef.current, kickRef, now);
      return;
    }
    writeFocusTarget(focus, presentationFocusRef.current, focusTargetRef.current);
    if (hasMeaningfulCameraFocusDelta(focusRef.current, focusTargetRef.current)) {
      // Hard-snap big jumps (login far away, respawn, teleports) — the glide
      // read as "camera stuck" for minutes. Walking deltas still smooth.
      if (focusRef.current.distanceToSquared(focusTargetRef.current) > CAMERA_SNAP_DISTANCE_SQ) focusRef.current.copy(focusTargetRef.current);
      else focusRef.current.lerp(focusTargetRef.current, smoothingAlpha(CAMERA_FOCUS_RESPONSE, delta));
    }

    const orbitPitch = Math.max(SKY_LOOKUP_PITCH_MIN, pitchRef.current);
    writeCameraOrbitPosition(
      cameraTargetRef.current,
      focusRef.current,
      { angle: angleRef.current, pitch: orbitPitch },
      distanceRef.current,
    );
    const cameraTerrainY = getTerrainY(cameraTargetRef.current.x, cameraTargetRef.current.z);
    if (cameraTargetRef.current.y < cameraTerrainY + CAMERA_GROUND_BUFFER) {
      cameraTargetRef.current.y = cameraTerrainY + CAMERA_GROUND_BUFFER;
    }
    const alpha = smoothingAlpha(CAMERA_POSITION_RESPONSE, delta);
    if (basePositionRef.current === null) basePositionRef.current = camera.position.clone();
    const basePosition = basePositionRef.current;
    if (basePosition.distanceToSquared(cameraTargetRef.current) > CAMERA_SNAP_DISTANCE_SQ) basePosition.copy(cameraTargetRef.current);
    else basePosition.lerp(cameraTargetRef.current, alpha);
    camera.position.copy(basePosition);
    applyCameraKick(camera, basePosition, kickRef, now);

    applySkyLookAt(camera, focusRef.current, pitchRef.current, distanceRef.current);
    if (cameraAngleRef) {
      cameraAngleRef.current = angleRef.current;
    }
  });

  return null;
}

/** Where the rig wants to look this frame: the renderer's presentation anchor
 *  when the local avatar has one (it lags the network position smoothly), else
 *  the raw server focus, lifted to eye height off the terrain. */
function writeFocusTarget(focus: Vec3, presentationFocus: THREE.Vector3 | null, out: THREE.Vector3): void {
  const presentationY = presentationFocus?.y;
  const focusY = typeof presentationY === 'number'
    ? presentationY - 1.0 + CAMERA_FOCUS_HEIGHT
    : getTerrainY(focus.x, focus.z) + CAMERA_FOCUS_HEIGHT;
  out.set(presentationFocus?.x ?? focus.x, focusY, presentationFocus?.z ?? focus.z);
}

/** Aim at the focus, biased upward when the player has pitched below the floor
 *  so dragging past the horizon looks at the sky instead of jamming. */
function applySkyLookAt(camera: THREE.Camera, focus: THREE.Vector3, pitch: number, distance: number): void {
  const skyDeficit = SKY_LOOKUP_PITCH_MIN - pitch;
  const skyOffset = skyDeficit > 0
    ? Math.min(skyDeficit * distance * SKY_LOOKUP_GAIN, distance * SKY_LOOKUP_MAX_RATIO)
    : 0;
  if (skyOffset <= 0) {
    camera.lookAt(focus);
    return;
  }
  lookAtTempVec.copy(focus);
  lookAtTempVec.y += skyOffset;
  camera.lookAt(lookAtTempVec);
}

/** Publish the imperative drag handle the HUD's touch pad drives. */
function useCameraControlsHandle(
  cameraControlsRef: MutableRefObject<CameraControls | null> | undefined,
  targets: DragTargets,
): void {
  useEffect(() => {
    if (!cameraControlsRef) {
      return undefined;
    }
    cameraControlsRef.current = {
      applyDelta: (delta) => {
        const orbit = applyCameraDragDelta(
          { angle: targets.angleRef.current, pitch: targets.pitchRef.current },
          delta,
        );
        targets.angleRef.current = orbit.angle;
        targets.pitchRef.current = orbit.pitch;
      },
    };
    return () => {
      cameraControlsRef.current = null;
    };
  }, [cameraControlsRef, targets]);
}

function useCameraWheelZoom(
  gl: THREE.WebGLRenderer,
  distanceRef: MutableRefObject<number>,
  onManualControl: () => void,
): void {
  useEffect(() => {
    const canvas = gl.domElement;
    const onWheel = (event: WheelEvent) => {
      onManualControl();
      distanceRef.current = applyWheelZoom(distanceRef.current, event.deltaY);
      event.preventDefault();
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [distanceRef, gl, onManualControl]);
}

/**
 * Add the live impact kick on top of the smoothed follow position, and drop the
 * kick once it has run out. Called from both the normal path and the hit-stop
 * early-out, so a held frame still carries the jolt.
 */
function applyCameraKick(
  camera: THREE.Camera,
  basePosition: THREE.Vector3 | null,
  kickRef: MutableRefObject<CameraKick | null>,
  now: number,
): void {
  if (!sampleCameraKick(kickRef.current, now, kickTempVec)) {
    kickRef.current = null;
    return;
  }
  // No smoothed base yet (a kick arriving before the first follow frame) means
  // there is nothing to offset FROM — adding blind would accumulate the jolt.
  if (!basePosition) return;
  camera.position.copy(basePosition).add(kickTempVec);
}

/**
 * Turn resolved hits into camera kicks. The newest impact always replaces the
 * one in flight rather than summing with it — stacked kicks in a fast fight
 * compound into motion sickness, and the latest hit is the one worth feeling.
 */
function useCombatCameraKick(kickRef: MutableRefObject<CameraKick | null>): void {
  useEffect(() => subscribeCombatImpacts((impact) => {
    const kick = createCameraKick(impact, motionGain(), impact.at);
    if (kick) kickRef.current = kick;
  }), [kickRef]);
}

type DragMode = 'idle' | 'mouse' | 'touchSingle' | 'touchPinch';

type DragState = {
  modeRef: MutableRefObject<DragMode>;
  lastPointerRef: MutableRefObject<TouchPoint>;
  lastPinchPxRef: MutableRefObject<number>;
  activeTouchesRef: MutableRefObject<Map<number, TouchPoint>>;
};

type DragTargets = {
  angleRef: MutableRefObject<number>;
  pitchRef: MutableRefObject<number>;
  distanceRef: MutableRefObject<number>;
};

function useCameraDragControls(
  gl: THREE.WebGLRenderer,
  targets: DragTargets,
  touchClaimRef: MutableRefObject<Set<number>> | undefined,
  onManualControl: () => void,
): void {
  const modeRef = useRef<DragMode>('idle');
  const lastPointerRef = useRef<TouchPoint>({ x: 0, y: 0 });
  const lastPinchPxRef = useRef(0);
  const activeTouchesRef = useRef(new Map<number, TouchPoint>());

  useEffect(() => {
    const canvas = gl.domElement;
    const state: DragState = { modeRef, lastPointerRef, lastPinchPxRef, activeTouchesRef };

    const onContextMenu = (event: MouseEvent) => event.preventDefault();
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        activeTouchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        startOrTransitionTouchDrag(state, touchClaimRef);
        return;
      }
      if (event.button === 2) {
        modeRef.current = 'mouse';
        lastPointerRef.current = { x: event.clientX, y: event.clientY };
        event.preventDefault();
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        activeTouchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }
      const mode = modeRef.current;
      if (mode === 'idle') {
        return;
      }
      onManualControl();
      if (mode === 'mouse') {
        applyMouseDelta(event, targets, lastPointerRef);
        return;
      }
      applyTouchDelta(state, targets, touchClaimRef);
      event.preventDefault();
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        activeTouchesRef.current.delete(event.pointerId);
        recomputeTouchMode(state, touchClaimRef);
        return;
      }
      if (event.button === 2 && modeRef.current === 'mouse') {
        modeRef.current = 'idle';
      }
    };

    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [gl, onManualControl, targets, touchClaimRef]);
}

function applyMouseDelta(
  event: PointerEvent,
  targets: DragTargets,
  lastPointerRef: MutableRefObject<TouchPoint>,
): void {
  const dx = event.clientX - lastPointerRef.current.x;
  const dy = event.clientY - lastPointerRef.current.y;
  const orbit = applyCameraDragDelta(
    { angle: targets.angleRef.current, pitch: targets.pitchRef.current },
    { x: dx, y: dy },
  );
  targets.angleRef.current = orbit.angle;
  targets.pitchRef.current = orbit.pitch;
  lastPointerRef.current = { x: event.clientX, y: event.clientY };
}

function startOrTransitionTouchDrag(
  state: DragState,
  touchClaimRef?: MutableRefObject<Set<number>>,
): void {
  const touches = [...state.activeTouchesRef.current.entries()];
  if (touches.length >= 2) {
    const points = touches.map(([, point]) => point);
    const centroid = getTouchCentroid(points);
    if (centroid) {
      state.modeRef.current = 'touchPinch';
      state.lastPointerRef.current = centroid;
      state.lastPinchPxRef.current = pinchDistance(points[0], points[1]);
    }
    return;
  }
  const [pointerId, point] = touches[0] ?? [];
  if (pointerId === undefined || !point) {
    return;
  }
  if (touchClaimRef?.current.has(pointerId)) {
    state.modeRef.current = 'idle';
    return;
  }
  state.modeRef.current = 'touchSingle';
  state.lastPointerRef.current = point;
}

function applyTouchDelta(
  state: DragState,
  targets: DragTargets,
  touchClaimRef?: MutableRefObject<Set<number>>,
): void {
  const touches = [...state.activeTouchesRef.current.entries()];
  if (state.modeRef.current === 'touchPinch' && touches.length >= 2) {
    applyPinchDelta(state, targets, touches.map(([, point]) => point));
    return;
  }
  if (state.modeRef.current === 'touchSingle' && touches.length === 1) {
    applySingleTouchDelta(state, targets, touches[0], touchClaimRef);
  }
}

function applyPinchDelta(
  state: DragState,
  targets: DragTargets,
  points: TouchPoint[],
): void {
  const centroid = getTouchCentroid(points);
  if (!centroid) {
    return;
  }
  const dx = centroid.x - state.lastPointerRef.current.x;
  const dy = centroid.y - state.lastPointerRef.current.y;
  const orbit = applyCameraDragDelta(
    { angle: targets.angleRef.current, pitch: targets.pitchRef.current },
    { x: dx, y: dy },
  );
  targets.angleRef.current = orbit.angle;
  targets.pitchRef.current = orbit.pitch;
  state.lastPointerRef.current = centroid;
  const nextPinch = pinchDistance(points[0], points[1]);
  targets.distanceRef.current = applyPinchZoom(
    targets.distanceRef.current,
    state.lastPinchPxRef.current,
    nextPinch,
  );
  state.lastPinchPxRef.current = nextPinch;
}

function applySingleTouchDelta(
  state: DragState,
  targets: DragTargets,
  entry: [number, TouchPoint],
  touchClaimRef?: MutableRefObject<Set<number>>,
): void {
  const [pointerId, point] = entry;
  if (touchClaimRef?.current.has(pointerId)) {
    state.modeRef.current = 'idle';
    return;
  }
  const dx = point.x - state.lastPointerRef.current.x;
  const dy = point.y - state.lastPointerRef.current.y;
  const orbit = applyCameraDragDelta(
    { angle: targets.angleRef.current, pitch: targets.pitchRef.current },
    { x: dx, y: dy },
  );
  targets.angleRef.current = orbit.angle;
  targets.pitchRef.current = orbit.pitch;
  state.lastPointerRef.current = point;
}

function recomputeTouchMode(
  state: DragState,
  touchClaimRef?: MutableRefObject<Set<number>>,
): void {
  if (state.activeTouchesRef.current.size === 0) {
    state.modeRef.current = 'idle';
    state.lastPinchPxRef.current = 0;
    return;
  }
  startOrTransitionTouchDrag(state, touchClaimRef);
}
