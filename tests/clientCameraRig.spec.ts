import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import {
  applyCameraDragDelta,
  CAMERA_MAX_FRAME_DELTA,
  CAMERA_MAX_PITCH,
  CAMERA_MIN_PITCH,
  getCameraOrbitPosition,
  getTouchCentroid,
  hasMeaningfulCameraFocusDelta,
  smoothingAlpha,
  shouldStartCameraDrag,
  writeCameraOrbitPosition,
} from '../apps/client/src/cameraRig';

describe('client camera rig helpers', () => {
  test('caps smoothing after long frames so the camera does not lurch', () => {
    const expected = 1 - Math.exp(-10 * CAMERA_MAX_FRAME_DELTA);

    expect(smoothingAlpha(10, 1)).toBeCloseTo(expected);
    expect(smoothingAlpha(10, -1)).toBe(0);
  });

  test('keeps drag pitch inside the playable orbit range', () => {
    expect(applyCameraDragDelta({ angle: 1, pitch: 0.5 }, { x: 10, y: -200 }).pitch).toBe(CAMERA_MIN_PITCH);
    expect(applyCameraDragDelta({ angle: 1, pitch: 0.5 }, { x: 10, y: 200 }).pitch).toBe(CAMERA_MAX_PITCH);
  });

  test('computes deterministic orbit positions around the focus point', () => {
    const position = getCameraOrbitPosition({ x: 10, y: 2, z: -4 }, { angle: 0, pitch: Math.PI / 2 }, 12);
    const target = new THREE.Vector3();
    const returnedTarget = writeCameraOrbitPosition(target, { x: 10, y: 2, z: -4 }, { angle: 0, pitch: Math.PI / 2 }, 12);

    expect(position.x).toBeCloseTo(10);
    expect(position.y).toBeCloseTo(14);
    expect(position.z).toBeCloseTo(-4);
    expect(returnedTarget).toBe(target);
    expect(target.x).toBeCloseTo(position.x);
    expect(target.y).toBeCloseTo(position.y);
    expect(target.z).toBeCloseTo(position.z);
  });

  test('filters tiny focus drift but accepts real movement', () => {
    const current = new THREE.Vector3(1, 2, 3);

    expect(hasMeaningfulCameraFocusDelta(current, new THREE.Vector3(1.01, 2, 3))).toBe(false);
    expect(hasMeaningfulCameraFocusDelta(current, new THREE.Vector3(1.1, 2, 3))).toBe(true);
  });

  test('routes camera drag to right mouse or two-finger touch', () => {
    expect(shouldStartCameraDrag({ button: 2, pointerType: 'mouse' }, 0)).toBe(true);
    expect(shouldStartCameraDrag({ button: 0, pointerType: 'mouse' }, 0)).toBe(false);
    expect(shouldStartCameraDrag({ button: 0, pointerType: 'touch' }, 1)).toBe(false);
    expect(shouldStartCameraDrag({ button: 0, pointerType: 'touch' }, 2)).toBe(true);
  });

  test('uses a touch centroid only after two active touches', () => {
    expect(getTouchCentroid([{ x: 10, y: 20 }])).toBeNull();
    expect(getTouchCentroid([{ x: 10, y: 20 }, { x: 30, y: 60 }])).toEqual({ x: 20, y: 40 });
  });
});
