import { CastState, type CastSnapshot, type TimeStopFieldSnapshot, type VecXZ } from '../../../packages/protocol/messages';

type PointXZ = VecXZ | { x: number; z: number };

export function isPointInActiveTimeField(
  fields: Record<string, TimeStopFieldSnapshot>,
  point: PointXZ | undefined,
  now: number = Date.now(),
): boolean {
  if (!point) return false;
  for (const field of Object.values(fields)) {
    if (!isFieldActive(field, now)) continue;
    if (isPointInsideField(field, point)) {
      return true;
    }
  }
  return false;
}

export function isCastInActiveTimeField(
  fields: Record<string, TimeStopFieldSnapshot>,
  cast: CastSnapshot,
  point: PointXZ | undefined,
  now: number = Date.now(),
): boolean {
  if (!point) return false;
  for (const field of Object.values(fields)) {
    if (!isFieldActive(field, now)) continue;
    if (cast.state !== CastState.Traveling && field.casterId === cast.casterId) continue;
    if (isPointInsideField(field, point)) {
      return true;
    }
  }
  return false;
}

export function pruneExpiredTimeFields(
  fields: Record<string, TimeStopFieldSnapshot>,
  now: number,
): Record<string, TimeStopFieldSnapshot> {
  let next: Record<string, TimeStopFieldSnapshot> | null = null;
  for (const [id, field] of Object.entries(fields)) {
    if (isFieldActive(field, now)) continue;
    next = next ?? { ...fields };
    delete next[id];
  }
  return next ?? fields;
}

function isFieldActive(field: TimeStopFieldSnapshot, now: number): boolean {
  return field.startTimeTs + field.durationMs > now;
}

function isPointInsideField(field: TimeStopFieldSnapshot, point: PointXZ): boolean {
  const dx = point.x - field.origin.x;
  const dz = point.z - field.origin.z;
  return dx * dx + dz * dz <= field.radius * field.radius;
}
