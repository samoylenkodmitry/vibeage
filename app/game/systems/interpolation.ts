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
  
  /**
   * Limit how far we rewind; call on every push()
   */
  private clampDepthNow() {
    const now = performance.now();
    while (this.buf.length >= 2 &&
           (now - this.buf[1].snapTs) > MAX_REWIND_MS) {
      this.buf.shift(); // Remove oldest
    }
  }
  
  /**
   * Returns the current buffer length for debugging
   */
  getBufferLength() {
    return this.buf.length;
  }
  
  // Debug helper function - expose to window for console debugging
  debugDump() {
    return [...this.buf];
  }
  
  // Clear buffer for troubleshooting
  clearBuffer() {
    this.buf = [];
    this.lastSample = null;
    console.log("Buffer cleared");
  }
  
  push(s:Snap){ 
    try {
      // Skip invalid entries
      if (s === null || s === undefined || isNaN(s.snapTs)) {
        console.warn("Skipping invalid snap entry:", s);
        return;
      }
      
      // Validate position values
      if (isNaN(s.pos.x) || isNaN(s.pos.z) || !isFinite(s.pos.x) || !isFinite(s.pos.z)) {
        console.warn("Invalid position values in snap, skipping:", s);
        return;
      }
      
      // Check if the position is (0,0) which might indicate an issue
      if (s.pos.x === 0 && s.pos.z === 0 && Math.random() < 0.1) {
        console.warn("Received (0,0) position in snap - this may cause movement issues", s);
      }
      
      // Prevent duplicates based on timestamp
      if (this.buf.some(existing => 
        existing.snapTs === s.snapTs && 
        existing.pos.x === s.pos.x && 
        existing.pos.z === s.pos.z)) {
        return; // Skip this duplicate
      }
      
      // Maintain correct chronological order
      let insertIndex = this.buf.length;
      for (let i = 0; i < this.buf.length; i++) {
        if (s.snapTs < this.buf[i].snapTs) {
          insertIndex = i;
          break;
        }
      }
      
      // Insert at the correct position to maintain time ordering
      this.buf.splice(insertIndex, 0, s);
      
      // Debug large position jumps in buffer
      if (this.buf.length >= 2) {
        const first = this.buf[0].pos;
        const last = this.buf[this.buf.length - 1].pos;
        const totalDistance = Math.sqrt(
          Math.pow(last.x - first.x, 2) + 
          Math.pow(last.z - first.z, 2)
        );
        
        // If the total travel distance in the buffer is unexpectedly large
        if (totalDistance > 20) {
          console.debug("Large movement distance detected in buffer", {
            totalDistance,
            firstPos: first,
            lastPos: last,
            bufferEntries: this.buf.length,
            timeSpan: this.buf[this.buf.length - 1].snapTs - this.buf[0].snapTs
          });
        }
      }
      
      // Trim buffer to reasonable size
      while (this.buf.length > 60) this.buf.shift();   // keep ~6 s of data
      
      // Update lastSample for new entries that are very recent
      if (insertIndex === this.buf.length - 1) { // If this is the newest entry
        const now = performance.now();
        if (now - s.snapTs < 100) { // If it's a very recent update
          this.lastSample = { x: s.pos.x, z: s.pos.z, rot: s.rot };
        }
      }
      
      // Random debug logging (only 1% of pushes to avoid spam)
      if (Math.random() < 0.01 && this.buf.length > 1) {
        console.debug("Buffer info after push:", {
          bufferLength: this.buf.length,
          newest: this.buf[this.buf.length - 1],
          oldest: this.buf[0],
          timeSpan: this.buf[this.buf.length - 1].snapTs - this.buf[0].snapTs
        });
      }
    } catch (err) {
      console.error("Error in buffer push:", err);
    }

    // Trim buffer to reasonable size
    while (this.buf.length > 60) this.buf.shift();   // keep ~6 s of data
    
    // Also apply timestamp-based cleanup
    this.clampDepthNow();
  }
  
  /**
   * Returns interpolated {x,z,rot} or extrapolated position if we're outside range 
   */
  sample(renderTs: number) {
    try {
      if (this.buf.length === 0) {
        // No data in buffer - use lastSample if available
        if (this.lastSample) {
          console.warn("Using last valid sample due to empty buffer");
          return this.lastSample;
        }
        
        // If no lastSample either, return default
        console.warn("Buffer is empty when sampling, returning default position");
        return { x: 0, z: 0, rot: 0 };
      }

      // Add safety check for very old timestamps
      if (renderTs < this.buf[0].snapTs - 5000) {
        // Instead of just warning, we'll adjust the timestamp and provide more context
        console.debug("Adjusting render timestamp to match buffer - possible clock sync issue", {
          renderTs,
          oldestBufferTs: this.buf[0].snapTs,
          diff: renderTs - this.buf[0].snapTs,
          bufferLength: this.buf.length
        });
        renderTs = this.buf[0].snapTs;
      }
    
      // Add debugging for timestamp gaps that might be causing issues
      if (Math.random() < 0.01) { // Only log occasionally
        console.debug("Buffer sample info:", {
          renderTs,
          bufferLength: this.buf.length,
          oldestTs: this.buf.length > 0 ? this.buf[0].snapTs : 'none',
          newestTs: this.buf.length > 0 ? this.buf[this.buf.length - 1].snapTs : 'none',
          timeRange: this.buf.length > 1 ? this.buf[this.buf.length - 1].snapTs - this.buf[0].snapTs : 0
        });
      }
      
      // Debug large position jumps in buffer
      if (this.buf.length >= 2) {
        const first = this.buf[0].pos;
        const last = this.buf[this.buf.length - 1].pos;
        const totalDistance = Math.sqrt(
          Math.pow(last.x - first.x, 2) + 
          Math.pow(last.z - first.z, 2)
        );
        
        // If the total travel distance in the buffer is unexpectedly large
        if (totalDistance > 20) {
          console.debug("Large movement distance detected in buffer", {
            totalDistance,
            firstPos: first,
            lastPos: last,
            bufferEntries: this.buf.length,
            timeSpan: this.buf[this.buf.length - 1].snapTs - this.buf[0].snapTs
          });
        }
      }

      // early / before first - use oldest entry in buffer
      if (renderTs <= this.buf[0].snapTs) {
        const s = this.buf[0];
        this.lastSample = { x: s.pos.x, z: s.pos.z, rot: s.rot };
        return this.lastSample;
      }

      // find the first snap AFTER renderTs
      const idx = this.buf.findIndex(s => s.snapTs > renderTs);

      // between two snaps → linear interpolate
      if (idx !== -1 && idx > 0) {
        const a = this.buf[idx - 1];
        const b = this.buf[idx];
        const t = (renderTs - a.snapTs) / (b.snapTs - a.snapTs);
        
        // Clamp t to prevent NaN from division by zero
        const clampedT = isNaN(t) ? 0 : Math.max(0, Math.min(1, t));
        
        // Check for potential teleportation between snapshots
        const distance = Math.sqrt(
          Math.pow(b.pos.x - a.pos.x, 2) + 
          Math.pow(b.pos.z - a.pos.z, 2)
        );
        
        // If there's a sudden large jump in position (likely teleport)
        // and the time difference is small, we should not interpolate
        if (distance > 15 && (b.snapTs - a.snapTs) < 500) {
          // If we're closer to the end position, just return that
          if (clampedT > 0.5) {
            this.lastSample = { x: b.pos.x, z: b.pos.z, rot: b.rot };
          } else {
            this.lastSample = { x: a.pos.x, z: a.pos.z, rot: a.rot };
          }
          return this.lastSample;
        }
        
        // Normal interpolation
        this.lastSample = {
          x: a.pos.x + (b.pos.x - a.pos.x) * clampedT,
          z: a.pos.z + (b.pos.z - a.pos.z) * clampedT,
          rot: lerpAngle(a.rot, b.rot, clampedT)
        };
        return this.lastSample;
      }

      // after newest snap → extrapolate MAX 120 ms
      const last = this.buf[this.buf.length - 1];
      const dt = Math.min((renderTs - last.snapTs) / 1000, 0.12);   // 0–0.12 s
      
      // Safety check for NaN or non-finite values
      if (isNaN(dt) || !isFinite(dt)) {
        this.lastSample = { x: last.pos.x, z: last.pos.z, rot: last.rot };
        return this.lastSample;
      }
      
      const dx = last.vel.x * dt;
      const dz = last.vel.z * dt;
      
      this.lastSample = { 
        x: last.pos.x + dx, 
        z: last.pos.z + dz, 
        rot: last.rot 
      };
      return this.lastSample;
    } catch (err) {
      console.error("Error in buffer sample:", err);
      
      // Return the last valid sample if we have one, or default values
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
