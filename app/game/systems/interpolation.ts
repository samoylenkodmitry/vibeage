export interface Snap { pos:{x:number,z:number}; rot:number; vel:{x:number,z:number}; snapTs:number }

// Game runs at 60 fps (~16.7ms per tick)
const MAX_REWIND_MS = 200; // Prevent >200 ms rewinds that cause visible teleports

export class SnapBuffer {
  private buf: Snap[] = [];
  
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
  
  push(s:Snap){ 
    // Skip invalid entries
    if (s === null || s === undefined || isNaN(s.snapTs)) {
      console.warn("Skipping invalid snap entry:", s);
      return;
    }
    
    this.buf.push(s); 
    this.clampDepthNow();
  }
  
  /**
   * Returns interpolated {x,z,rot} or extrapolated position if we're outside range 
   */
  sample(renderTs:number, speedCap:number){
    try {
      if(this.buf.length===0) return null;
  
      // Safety check for NaN values
      if (isNaN(renderTs)) {
        console.error("Invalid renderTs:", renderTs);
        return null;
      }
  
      // Find first snap with snapTs > renderTs
      const i = this.buf.findIndex(s => s && !isNaN(s.snapTs) && s.snapTs > renderTs);
  
      /* Case A – we're *before* the first snap (shouldn't happen after lag),
          just show that first snap. */
      if(i===0){
          const s=this.buf[0];
          return {x:s.pos.x,z:s.pos.z,rot:s.rot};
      }
  
      /* Case B – we're *between* two snaps → use Hermite interpolation. */
      if(i>0){
          const s0=this.buf[i-1], s1=this.buf[i];
          const t=(renderTs-s0.snapTs)/(s1.snapTs-s0.snapTs);
          
          // Use Hermite interpolation if both snaps have velocity data
          if (s0.vel && s1.vel) {
            return {
              x: hermite(s0.pos.x, s0.vel.x, s1.pos.x, s1.vel.x, t),
              z: hermite(s0.pos.z, s0.vel.z, s1.pos.z, s1.vel.z, t),
              rot: lerpAngle(s0.rot, s1.rot, t)
            };
          } else {
            // Fall back to linear interpolation if velocity is missing
            return {
              x: s0.pos.x + (s1.pos.x-s0.pos.x)*t,
              z: s0.pos.z + (s1.pos.z-s0.pos.z)*t,
              rot: lerpAngle(s0.rot, s1.rot, t)
            };
          }
      }
  
      /* Case C – we're *after* the newest snap → **extrapolate** a bit. */
      const sLast=this.buf[this.buf.length-1];
      const dt = (renderTs - sLast.snapTs)/1000;
      const maxDist = speedCap * dt * 1.2;
      const dx = clamp(sLast.vel.x * dt, -maxDist, maxDist);
      const dz = clamp(sLast.vel.z * dt, -maxDist, maxDist);
      return { x: sLast.pos.x+dx, z: sLast.pos.z+dz, rot: sLast.rot };
    } catch (err) {
      console.error("Error in SnapBuffer.sample:", err);
      return null;
    }
  }
}

/**
 * Hermite interpolation function for smooth curves with velocity
 * p0, p1 = position values
 * v0, v1 = velocity values (tangents)
 * t = interpolation parameter [0,1]
 */
function hermite(p0: number, v0: number, p1: number, v1: number, t: number) {
  const t2 = t * t, t3 = t2 * t;
  return (2*t3 - 3*t2 + 1) * p0 +
         (t3 - 2*t2 + t)   * v0 +
         (-2*t3 + 3*t2)    * p1 +
         (t3 - t2)         * v1;
}

/**
 * Clamps a value between a minimum and maximum value
 */
function clamp(v:number, min:number, max:number){ 
  return Math.min(max, Math.max(min, v)); 
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
