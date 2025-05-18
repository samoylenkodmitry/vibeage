import type { PredictionKeyframe } from '../../../shared/messages';
import * as THREE from 'three';

export function damp(current:number, target:number, lambda:number, dt:number){
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

export const TELEPORT_THRESHOLD = 5;

export interface Snap { 
  pos: {x:number, z:number}; 
  rot?: number; 
  vel: {x:number, z:number}; 
  snapTs: number;           // client-local receipt time of the PosSnap message
  serverSnapTs: number;     // server time of the base pos/vel in the PosSnap message
  predictions?: PredictionKeyframe[];  // Array of server predictions
  seq?: number;             // Optional sequence number for reconciliation
}

export const GROUND_Y = 0.5;

// Module-global SnapBuffer map - one buffer per entity, lives for app lifetime
const bufMap: Record<string, SnapBuffer> = {};
export const getBuffer = (id: string) => bufMap[id] || (bufMap[id] = new SnapBuffer());

// Expose buffers globally for debugging
if (typeof window !== 'undefined') {
  (window as any).__DEBUG_SNAP_BUFFERS = bufMap;
}

export class SnapBuffer {
  private lastSnap: Snap | null = null;

  clearBuffer() {
    this.lastSnap = null;
    console.log("Buffer cleared");
  }

  push(s:Snap){
      if (s === null || s === undefined || isNaN(s.snapTs)) {
        console.warn("Skipping invalid snap entry:", s);
        return;
      }
      if (isNaN(s.pos.x) || isNaN(s.pos.z) || !isFinite(s.pos.x) || !isFinite(s.pos.z)) {
        console.warn("Invalid position values in snap, skipping:", s);
        return;
      }
      if (s.pos.x === 0 && s.pos.z === 0 && Math.random() < 0.1) {
        console.warn("Received (0,0) position in snap - this may cause movement issues", s);
      }
      this.lastSnap = s;
  }

  sample(renderTsClientCorrected: number): Snap | null {
    if (!this.lastSnap) return null;

    // 1. Start with the base snapshot
    const base_snap = this.lastSnap;

    // 2. Build a timeline array: [base_snap_as_keyframe, ...base_snap.predictions]
    const timeline: { pos: {x:number, z:number}; rot?: number; ts: number }[] = [];
    timeline.push({
        pos: base_snap.pos,
        rot: base_snap.rot,
        ts: base_snap.serverSnapTs
    });

    if (base_snap.predictions) {
        base_snap.predictions.forEach(p => timeline.push({ 
            pos: p.pos, 
            rot: p.rotY, 
            ts: p.ts 
        }));
    }

    // 3. Find the segment [k, k+1] in the timeline that brackets renderTsClientCorrected
    let k_frame: { pos: {x:number, z:number}; rot?: number; ts: number } | null = null;
    let k_plus_1_frame: { pos: {x:number, z:number}; rot?: number; ts: number } | null = null;

    for (let i = 0; i < timeline.length; i++) {
        if (timeline[i].ts <= renderTsClientCorrected) {
            k_frame = timeline[i];
            if (i + 1 < timeline.length) {
                k_plus_1_frame = timeline[i + 1];
            }
        } else {
            if (!k_frame) k_frame = timeline[i]; // Fallback: renderTs is before first item
            break;
        }
    }

    // 4. If we have a bracket, lerp between the two keyframes
    if (k_frame && k_plus_1_frame && renderTsClientCorrected < k_plus_1_frame.ts) {
        const t_denominator = k_plus_1_frame.ts - k_frame.ts;
        if (t_denominator <= 0) {
            return {
                pos: k_frame.pos,
                rot: k_frame.rot,
                vel: base_snap.vel,
                snapTs: renderTsClientCorrected,
                serverSnapTs: k_frame.ts
            };
        }
        const t = (renderTsClientCorrected - k_frame.ts) / t_denominator;
        const clampedT = Math.max(0, Math.min(1, t));

        const interpolatedPos = {
            x: k_frame.pos.x + (k_plus_1_frame.pos.x - k_frame.pos.x) * clampedT,
            z: k_frame.pos.z + (k_plus_1_frame.pos.z - k_frame.pos.z) * clampedT,
        };
        
        // Interpolate rotation if both frames have it
        let interpolatedRot = k_frame.rot;
        if (k_frame.rot !== undefined && k_plus_1_frame.rot !== undefined) {
            interpolatedRot = lerpAngle(k_frame.rot, k_plus_1_frame.rot, clampedT);
        }

        return {
            pos: interpolatedPos,
            rot: interpolatedRot,
            vel: base_snap.vel,
            snapTs: renderTsClientCorrected,
            serverSnapTs: renderTsClientCorrected,
            predictions: base_snap.predictions
        };
    } 
    // 5. If we're past the last keyframe, extrapolate
    else if (k_frame) {
        const lastKeyframeInTimeline = timeline[timeline.length - 1];
        const extrapolationTime = (renderTsClientCorrected - lastKeyframeInTimeline.ts) / 1000.0; // in seconds

        const MAX_EXTRAPOLATION_TIME_S = 0.1; // 100ms max extrapolation
        const clampedExtrapolationTime = Math.min(Math.max(0, extrapolationTime), MAX_EXTRAPOLATION_TIME_S);

        const velForExtrapolation = base_snap.vel;

        const extrapolatedPos = {
            x: lastKeyframeInTimeline.pos.x + velForExtrapolation.x * clampedExtrapolationTime,
            z: lastKeyframeInTimeline.pos.z + velForExtrapolation.z * clampedExtrapolationTime,
        };
        
        return {
            pos: extrapolatedPos,
            rot: lastKeyframeInTimeline.rot,
            vel: velForExtrapolation,
            snapTs: renderTsClientCorrected,
            serverSnapTs: renderTsClientCorrected,
            predictions: base_snap.predictions
        };
    }

    // Fallback case
    return this.lastSnap;
  }
}

/**
 * Lerps between two angles with wrapping around 2PI
 */
export function lerpAngle(a:number, b:number, t:number){
  let d = b-a;
  if(d > Math.PI) d -= 2*Math.PI;
  if(d < -Math.PI) d += 2*Math.PI;
  return a + d*t;
}
