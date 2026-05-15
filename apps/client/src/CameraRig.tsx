import { useEffect, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  applyCameraDragDelta,
  applyPinchZoom,
  applyWheelZoom,
  CAMERA_DISTANCE,
  CAMERA_FOCUS_RESPONSE,
  CAMERA_POSITION_RESPONSE,
  getTouchCentroid,
  hasMeaningfulCameraFocusDelta,
  pinchDistance,
  smoothingAlpha,
  writeCameraOrbitPosition,
} from './cameraRig';
import type { Vec3 } from './gameTypes';
import { getTerrainY } from './worldSceneConfig';

export type CameraControls = {
  applyDelta: (delta: { x: number; y: number }) => void;
};

const CAMERA_FOCUS_HEIGHT = 0.6;
const CAMERA_GROUND_BUFFER = 1.4;
const SKY_LOOKUP_PITCH_MIN = 0.06;
const SKY_LOOKUP_GAIN = 3.0;
const SKY_LOOKUP_MAX_RATIO = 4.5;
const lookAtTempVec = new THREE.Vector3();

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
  useCameraDragControls(gl, angleRef, pitchRef, distanceRef, touchClaimRef);
  useCameraWheelZoom(gl, distanceRef);

  useEffect(() => {
    if (!cameraControlsRef) {
      return undefined;
    }
    cameraControlsRef.current = {
      applyDelta: (delta) => {
        const orbit = applyCameraDragDelta(
          { angle: angleRef.current, pitch: pitchRef.current },
          delta,
        );
        angleRef.current = orbit.angle;
        pitchRef.current = orbit.pitch;
      },
    };
    return () => {
      cameraControlsRef.current = null;
    };
  }, [cameraControlsRef]);

  useFrame((_, delta) => {
    const presentationFocus = presentationFocusRef.current;
    const groundY = getTerrainY(focus.x, focus.z);
    const baselineFocusY = groundY + CAMERA_FOCUS_HEIGHT;
    const presentationY = presentationFocus?.y;
    const focusY = typeof presentationY === 'number'
      ? presentationY - 1.0 + CAMERA_FOCUS_HEIGHT
      : baselineFocusY;
    focusTargetRef.current.set(
      presentationFocus?.x ?? focus.x,
      focusY,
      presentationFocus?.z ?? focus.z,
    );
    if (hasMeaningfulCameraFocusDelta(focusRef.current, focusTargetRef.current)) {
      focusRef.current.lerp(focusTargetRef.current, smoothingAlpha(CAMERA_FOCUS_RESPONSE, delta));
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
    camera.position.lerp(cameraTargetRef.current, alpha);

    const skyDeficit = SKY_LOOKUP_PITCH_MIN - pitchRef.current;
    const skyOffset = skyDeficit > 0
      ? Math.min(
          skyDeficit * distanceRef.current * SKY_LOOKUP_GAIN,
          distanceRef.current * SKY_LOOKUP_MAX_RATIO,
        )
      : 0;
    if (skyOffset > 0) {
      lookAtTempVec.copy(focusRef.current);
      lookAtTempVec.y += skyOffset;
      camera.lookAt(lookAtTempVec);
    } else {
      camera.lookAt(focusRef.current);
    }
    if (cameraAngleRef) {
      cameraAngleRef.current = angleRef.current;
    }
  });

  return null;
}

function useCameraWheelZoom(
  gl: THREE.WebGLRenderer,
  distanceRef: MutableRefObject<number>,
): void {
  useEffect(() => {
    const canvas = gl.domElement;
    const onWheel = (event: WheelEvent) => {
      distanceRef.current = applyWheelZoom(distanceRef.current, event.deltaY);
      event.preventDefault();
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [distanceRef, gl]);
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
  angleRef: MutableRefObject<number>,
  pitchRef: MutableRefObject<number>,
  distanceRef: MutableRefObject<number>,
  touchClaimRef?: MutableRefObject<Set<number>>,
): void {
  const modeRef = useRef<DragMode>('idle');
  const lastPointerRef = useRef<TouchPoint>({ x: 0, y: 0 });
  const lastPinchPxRef = useRef(0);
  const activeTouchesRef = useRef(new Map<number, TouchPoint>());

  useEffect(() => {
    const canvas = gl.domElement;
    const state: DragState = { modeRef, lastPointerRef, lastPinchPxRef, activeTouchesRef };
    const targets: DragTargets = { angleRef, pitchRef, distanceRef };

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
  }, [angleRef, distanceRef, gl, pitchRef, touchClaimRef]);
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
