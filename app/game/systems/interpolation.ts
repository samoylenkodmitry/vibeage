export interface Snap { pos:{x:number,z:number}; rot:number; vel:{x:number,z:number}; snapTs:number }

export class SnapBuffer {
  private buf: Snap[] = [];
  
  push(s:Snap){ 
    // Skip invalid entries
    if (s === null || s === undefined || isNaN(s.snapTs)) {
      console.warn("Skipping invalid snap entry:", s);
      return;
    }
    
    this.buf.push(s); 
    while(this.buf.length > 20) this.buf.shift(); 
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
      let i = this.buf.findIndex(s => s && !isNaN(s.snapTs) && s.snapTs > renderTs);
  
      /* Case A – we're *before* the first snap (shouldn't happen after lag),
          just show that first snap. */
      if(i===0){
          const s=this.buf[0];
          return {x:s.pos.x,z:s.pos.z,rot:s.rot};
      }
  
      /* Case B – we're *between* two snaps → normal lerp. */
      if(i>0){
          const s0=this.buf[i-1], s1=this.buf[i];
          const t=(renderTs-s0.snapTs)/(s1.snapTs-s0.snapTs);
          return {
              x: s0.pos.x + (s1.pos.x-s0.pos.x)*t,
              z: s0.pos.z + (s1.pos.z-s0.pos.z)*t,
              rot: lerpAngle(s0.rot,s1.rot,t)
          };
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
