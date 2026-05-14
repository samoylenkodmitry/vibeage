import { useEffect, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  applyCameraDragDelta,
  CAMERA_FOCUS_RESPONSE,
  CAMERA_POSITION_RESPONSE,
  hasMeaningfulCameraFocusDelta,
  smoothingAlpha,
  writeCameraOrbitPosition,
} from './cameraRig';
import type { Vec3 } from './gameTypes';
import { GROUND_Y } from './worldSceneConfig';

export function CameraRig({
  focus,
  presentationFocusRef,
}: {
  focus: Vec3;
  presentationFocusRef: MutableRefObject<THREE.Vector3 | null>;
}) {
  const { camera, gl } = useThree();
  const angleRef = useRef(Math.PI * 0.82);
  const pitchRef = useRef(0.46);
  const draggingRef = useRef(false);
  const focusRef = useRef(new THREE.Vector3(focus.x, GROUND_Y + 1.4, focus.z));
  const focusTargetRef = useRef(new THREE.Vector3(focus.x, GROUND_Y + 1.4, focus.z));
  const cameraTargetRef = useRef(new THREE.Vector3());
  const lastPointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = gl.domElement;
    const onContextMenu = (event: MouseEvent) => event.preventDefault();
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 2) {
        return;
      }

      draggingRef.current = true;
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      event.preventDefault();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!draggingRef.current) {
        return;
      }

      const orbit = applyCameraDragDelta(
        { angle: angleRef.current, pitch: pitchRef.current },
        {
          x: event.clientX - lastPointerRef.current.x,
          y: event.clientY - lastPointerRef.current.y,
        },
      );
      angleRef.current = orbit.angle;
      pitchRef.current = orbit.pitch;
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      event.preventDefault();
    };
    const onPointerUp = () => {
      draggingRef.current = false;
    };

    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [gl]);

  useFrame((_, delta) => {
    const presentationFocus = presentationFocusRef.current;
    focusTargetRef.current.set(
      presentationFocus?.x ?? focus.x,
      GROUND_Y + 1.4,
      presentationFocus?.z ?? focus.z,
    );
    if (hasMeaningfulCameraFocusDelta(focusRef.current, focusTargetRef.current)) {
      focusRef.current.lerp(focusTargetRef.current, smoothingAlpha(CAMERA_FOCUS_RESPONSE, delta));
    }

    writeCameraOrbitPosition(cameraTargetRef.current, focusRef.current, {
      angle: angleRef.current,
      pitch: pitchRef.current,
    });
    const alpha = smoothingAlpha(CAMERA_POSITION_RESPONSE, delta);
    camera.position.lerp(cameraTargetRef.current, alpha);
    camera.lookAt(focusRef.current);
  });

  return null;
}
