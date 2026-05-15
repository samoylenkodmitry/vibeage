import { useEffect, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  applyCameraDragDelta,
  applyWheelZoom,
  CAMERA_DISTANCE,
  CAMERA_FOCUS_RESPONSE,
  CAMERA_POSITION_RESPONSE,
  getTouchCentroid,
  hasMeaningfulCameraFocusDelta,
  smoothingAlpha,
  shouldStartCameraDrag,
  writeCameraOrbitPosition,
} from './cameraRig';
import type { Vec3 } from './gameTypes';
import { getTerrainY } from './worldSceneConfig';

export type CameraControls = {
  applyDelta: (delta: { x: number; y: number }) => void;
};

export function CameraRig({
  focus,
  presentationFocusRef,
  cameraAngleRef,
  cameraControlsRef,
}: {
  focus: Vec3;
  presentationFocusRef: MutableRefObject<THREE.Vector3 | null>;
  cameraAngleRef?: MutableRefObject<number>;
  cameraControlsRef?: MutableRefObject<CameraControls | null>;
}) {
  const { camera, gl } = useThree();
  const angleRef = useRef(Math.PI * 0.82);
  const pitchRef = useRef(0.46);
  const distanceRef = useRef(CAMERA_DISTANCE);
  const initialY = getTerrainY(focus.x, focus.z) + 1.4;
  const focusRef = useRef(new THREE.Vector3(focus.x, initialY, focus.z));
  const focusTargetRef = useRef(new THREE.Vector3(focus.x, initialY, focus.z));
  const cameraTargetRef = useRef(new THREE.Vector3());
  useCameraDragControls(gl, angleRef, pitchRef);
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
    focusTargetRef.current.set(
      presentationFocus?.x ?? focus.x,
      presentationFocus?.y ?? (getTerrainY(focus.x, focus.z) + 1.4),
      presentationFocus?.z ?? focus.z,
    );
    if (hasMeaningfulCameraFocusDelta(focusRef.current, focusTargetRef.current)) {
      focusRef.current.lerp(focusTargetRef.current, smoothingAlpha(CAMERA_FOCUS_RESPONSE, delta));
    }

    writeCameraOrbitPosition(
      cameraTargetRef.current,
      focusRef.current,
      { angle: angleRef.current, pitch: pitchRef.current },
      distanceRef.current,
    );
    const alpha = smoothingAlpha(CAMERA_POSITION_RESPONSE, delta);
    camera.position.lerp(cameraTargetRef.current, alpha);
    camera.lookAt(focusRef.current);
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

function useCameraDragControls(
  gl: THREE.WebGLRenderer,
  angleRef: MutableRefObject<number>,
  pitchRef: MutableRefObject<number>,
): void {
  const draggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const activeTouchesRef = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => {
    const canvas = gl.domElement;
    const onContextMenu = (event: MouseEvent) => event.preventDefault();
    const onPointerDown = (event: PointerEvent) => {
      updateTouchPointer(event, activeTouchesRef.current);
      if (!shouldStartCameraDrag(event, activeTouchesRef.current.size)) {
        return;
      }

      draggingRef.current = true;
      lastPointerRef.current = getCurrentPointer(event, activeTouchesRef.current)
        ?? { x: event.clientX, y: event.clientY };
      event.preventDefault();
    };
    const onPointerMove = (event: PointerEvent) => {
      updateTouchPointer(event, activeTouchesRef.current);
      if (!draggingRef.current) {
        return;
      }

      const pointer = getCurrentPointer(event, activeTouchesRef.current);
      if (!pointer) {
        return;
      }

      const orbit = applyCameraDragDelta(
        { angle: angleRef.current, pitch: pitchRef.current },
        { x: pointer.x - lastPointerRef.current.x, y: pointer.y - lastPointerRef.current.y },
      );
      angleRef.current = orbit.angle;
      pitchRef.current = orbit.pitch;
      lastPointerRef.current = pointer;
      event.preventDefault();
    };
    const onPointerUp = (event: PointerEvent) => {
      releasePointer(event, activeTouchesRef.current, draggingRef);
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
  }, [angleRef, gl, pitchRef]);
}

function updateTouchPointer(
  event: PointerEvent,
  activeTouches: Map<number, { x: number; y: number }>,
): void {
  if (event.pointerType === 'touch') {
    activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }
}

function releasePointer(
  event: PointerEvent,
  activeTouches: Map<number, { x: number; y: number }>,
  draggingRef: MutableRefObject<boolean>,
): void {
  if (event.pointerType === 'touch') {
    activeTouches.delete(event.pointerId);
    if (activeTouches.size < 2) {
      draggingRef.current = false;
    }
    return;
  }

  if (event.button === 2) {
    draggingRef.current = false;
  }
}

function getCurrentPointer(
  event: PointerEvent,
  activeTouches: ReadonlyMap<number, { x: number; y: number }>,
): { x: number; y: number } | null {
  if (event.pointerType !== 'touch') {
    return { x: event.clientX, y: event.clientY };
  }

  return getTouchCentroid([...activeTouches.values()]);
}
