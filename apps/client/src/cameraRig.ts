import * as THREE from 'three';
import type { Vec3 } from './gameTypes';

export const CAMERA_DISTANCE = 24;
export const CAMERA_FOCUS_RESPONSE = 8;
export const CAMERA_POSITION_RESPONSE = 10;
export const CAMERA_MAX_FRAME_DELTA = 1 / 30;
export const CAMERA_FOCUS_JITTER_EPSILON_SQ = 0.0004;
export const CAMERA_DRAG_YAW_SPEED = 0.012;
export const CAMERA_DRAG_PITCH_SPEED = 0.01;
export const CAMERA_MIN_PITCH = 0.14;
export const CAMERA_MAX_PITCH = 0.95;

export type CameraOrbit = {
  angle: number;
  pitch: number;
};

export function smoothingAlpha(response: number, deltaSeconds: number): number {
  const boundedDelta = Math.min(Math.max(deltaSeconds, 0), CAMERA_MAX_FRAME_DELTA);
  return 1 - Math.exp(-response * boundedDelta);
}

export function applyCameraDragDelta(
  orbit: CameraOrbit,
  pointerDelta: { x: number; y: number },
): CameraOrbit {
  return {
    angle: orbit.angle - pointerDelta.x * CAMERA_DRAG_YAW_SPEED,
    pitch: THREE.MathUtils.clamp(
      orbit.pitch + pointerDelta.y * CAMERA_DRAG_PITCH_SPEED,
      CAMERA_MIN_PITCH,
      CAMERA_MAX_PITCH,
    ),
  };
}

export function getCameraOrbitPosition(
  focus: Vec3,
  orbit: CameraOrbit,
  distance = CAMERA_DISTANCE,
): Vec3 {
  const horizontalDistance = Math.cos(orbit.pitch) * distance;

  return {
    x: focus.x - Math.sin(orbit.angle) * horizontalDistance,
    y: focus.y + Math.sin(orbit.pitch) * distance,
    z: focus.z - Math.cos(orbit.angle) * horizontalDistance,
  };
}

export function writeCameraOrbitPosition(
  target: THREE.Vector3,
  focus: Vec3,
  orbit: CameraOrbit,
  distance = CAMERA_DISTANCE,
): THREE.Vector3 {
  const horizontalDistance = Math.cos(orbit.pitch) * distance;

  return target.set(
    focus.x - Math.sin(orbit.angle) * horizontalDistance,
    focus.y + Math.sin(orbit.pitch) * distance,
    focus.z - Math.cos(orbit.angle) * horizontalDistance,
  );
}

export function hasMeaningfulCameraFocusDelta(
  current: THREE.Vector3,
  next: THREE.Vector3,
): boolean {
  return current.distanceToSquared(next) > CAMERA_FOCUS_JITTER_EPSILON_SQ;
}
