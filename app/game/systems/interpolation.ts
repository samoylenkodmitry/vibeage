export interface Snap { pos:{x:number,z:number}; rot:number; vel:{x:number,z:number}; snapTs:number }

// Game runs at 60 fps (~16.7ms per tick)
const MAX_REWIND_MS = 200; // Prevent >200 ms rewinds that cause visible teleports

// Export the ground level for consistent positioning
export const GROUND_Y = 0.5;

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

// Module-global SnapBuffer map - one buffer per entity, lives for app lifetime
const bufMap: Record<string, SnapBuffer> = {};
export const getBuffer = (id: string) => bufMap[id] || (bufMap[id] = new SnapBuffer());

/**
 * Hook to continuously sample a player's SnapBuffer in the game loop
 * Returns the latest interpolated position/rotation
 */
export const useInterpolatedPosition = (id: string, interpolationLag = 120) => {
  const bufferRef = useRef<SnapBuffer | null>(null);
  const sampleRef = useRef<{x: number, z: number, rot: number} | null>(null);
  
  // Keep local reference to the buffer from the module-global map
  const buffer = getBuffer(id);
  if (buffer !== bufferRef.current) {
    bufferRef.current = buffer;
  }
  
  // Sample the buffer on every frame
  useFrame(() => {
    if (!bufferRef.current) return;
    
    const renderTs = performance.now() - interpolationLag;
    
    const sample = bufferRef.current.sample(renderTs);
    if (sample) {
      sampleRef.current = sample;
    }
  });
  
  return sampleRef.current;
};

export class SnapBuffer {
  private buf: Snap[] = [];
  private lastSample: {x: number, z: number, rot: number} | null = null;
  
  private clampDepthNow() {
    const now = performance.now();
    while (this.buf.length >= 2 &&
           (now - this.buf[1].snapTs) > MAX_REWIND_MS) {
      this.buf.shift();
    }
  }

  getBufferLength() {
    return this.buf.length;
  }

  debugDump() {
    return [...this.buf];
  }

  clearBuffer() {
    this.buf = [];
    this.lastSample = null;
    console.log("Buffer cleared");
  }

  push(s:Snap){
console.log(`Pushing snap: id=${(s as any).id}, snapTs(clientReceive)=${s.snapTs.toFixed(0)}, serverOriginTs=${(s as any).serverSnapTs || 'N/A'}, pos=...`);
      if (this.buf.length > 0) {
          console.log(`  Current buffer oldestTs=${this.buf[0].snapTs.toFixed(0)}, newestTs=${this.buf[this.buf.length-1].snapTs.toFixed(0)}`);
      }
    try {
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
      if (this.buf.some(existing =>
        existing.snapTs === s.snapTs &&
        existing.pos.x === s.pos.x &&
        existing.pos.z === s.pos.z)) {
        return;
      }

      let insertIndex = this.buf.length;
      for (let i = 0; i < this.buf.length; i++) {
        if (s.snapTs < this.buf[i].snapTs) {
          insertIndex = i;
          break;
        }
      }
      this.buf.splice(insertIndex, 0, s);

      // ... (existing debug logging for large jumps and buffer info can remain)

    } catch (err) {
      console.error("Error in buffer push:", err);
    }

    while (this.buf.length > 60) this.buf.shift();
    this.clampDepthNow();
  }

      sample(renderTs: number) {
        try {
          const bufferLength = this.buf.length;

          if (bufferLength === 0) {
            return this.lastSample || { x: 0, z: 0, rot: 0 };
          }

          const firstSnap = this.buf[0];
          const lastSnap = this.buf[bufferLength - 1];

          // Case 1: renderTs is before or at the oldest snapshot in the buffer
          if (renderTs <= firstSnap.snapTs) {
            this.lastSample = { x: firstSnap.pos.x, z: firstSnap.pos.z, rot: firstSnap.rot };
            return this.lastSample;
          }

          // Case 2: renderTs is after or at the newest snapshot in the buffer (extrapolation)
          if (renderTs >= lastSnap.snapTs) {
            const dt = (renderTs - lastSnap.snapTs) / 1000; // Time delta for extrapolation
            const safeDt = Math.min(Math.max(0, dt), 0.12); // Clamp extrapolation time, ensure non-negative

            const dx = lastSnap.vel.x * safeDt;
            const dz = lastSnap.vel.z * safeDt;
            this.lastSample = {
              x: lastSnap.pos.x + dx,
              z: lastSnap.pos.z + dz,
              rot: lastSnap.rot
            };
            return this.lastSample;
          }

          // Case 3: renderTs is between two snapshots (interpolation)
          let a: Snap = firstSnap;
          let b: Snap = lastSnap;

          // Find a and b: a.snapTs <= renderTs < b.snapTs
          for (let i = 0; i < bufferLength - 1; i++) {
            if (this.buf[i].snapTs <= renderTs && renderTs < this.buf[i + 1].snapTs) {
              a = this.buf[i];
              b = this.buf[i + 1];
              break;
            }
          }
          // If the loop completes and a,b are still first/last, it means renderTs didn't fall
          // strictly between two points but was covered by Case 1 or 2.
          // This explicit search is for clarity. If a == b after this, it implies renderTs matches a snap time.
          // Given Case 1 and 2, this loop should always find a valid a and b if bufferLength > 1.

          const duration = b.snapTs - a.snapTs;
          if (duration <= 0) {
            // This should ideally not happen if snaps are distinct and sorted.
            // If it does, snap to 'a' (the earlier or equal one).
            this.lastSample = { x: a.pos.x, z: a.pos.z, rot: a.rot };
            return this.lastSample;
          }

          const t = (renderTs - a.snapTs) / duration;
          const clampedT = Math.max(0, Math.min(1, t));

          // Optional: Teleport detection logic (currently commented out)
          // const distanceBetweenSnaps = Math.sqrt(Math.pow(b.pos.x - a.pos.x, 2) + Math.pow(b.pos.z - a.pos.z, 2));
          // if (distanceBetweenSnaps > 15 && duration < 500) {
          //   this.lastSample = (clampedT > 0.5) ? { x: b.pos.x, z: b.pos.z, rot: b.rot } : { x: a.pos.x, z: a.pos.z, rot: a.rot };
          //   return this.lastSample;
          // }

          this.lastSample = {
            x: a.pos.x + (b.pos.x - a.pos.x) * clampedT,
            z: a.pos.z + (b.pos.z - a.pos.z) * clampedT,
            rot: lerpAngle(a.rot, b.rot, clampedT)
          };
          return this.lastSample;

        } catch (err) {
          console.error("Error in buffer sample:", err);
          return this.lastSample || { x: 0, z: 0, rot: 0 };
        }
      }
}

/**
 * Lerps between two angles with wrapping around 2PI
 */
function lerpAngle(a:number, b:number, t:number){
  let d = b-a;
  if(d > Math.PI) d -= 2*Math.PI;
  if(d < -Math.PI) d += 2*Math.PI;
  return a + d*t;
}
