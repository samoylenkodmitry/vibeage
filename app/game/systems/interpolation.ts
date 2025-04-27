export interface Snap { pos:{x:number,z:number}; rot:number; vel:{x:number,z:number}; snapTs:number }

export class SnapBuffer {
  private buf: Snap[] = [];
  
  push(s:Snap){ 
    this.buf.push(s); 
    while(this.buf.length > 20) this.buf.shift(); 
  }
  
  /**
   * Returns interpolated {x,z,rot} for given renderTs; may extrapolate 
   */
  sample(renderTs:number, speedCap:number){
    // If buffer is empty, return null
    if(this.buf.length === 0) return null;
    
    // Find two snaps surrounding renderTs
    let i = this.buf.findIndex(s => s.snapTs > renderTs);
    if(i <= 0){ 
      i = 0; // too new -> extrapolate
    }
    
    const s0 = this.buf[Math.max(0, i-1)], s1 = this.buf[i] || s0;
    const dt = s1.snapTs - s0.snapTs || 1;
    const t = Math.min(1, Math.max(0, (renderTs - s0.snapTs) / dt));
    
    // lerp pos
    const x = s0.pos.x + (s1.pos.x - s0.pos.x) * t;
    const z = s0.pos.z + (s1.pos.z - s0.pos.z) * t;
    const rot = lerpAngle(s0.rot, s1.rot, t);
    
    return {x, z, rot};
  }
}

/**
 * Lerps between two angles with wrapping around 2PI
 */
function lerpAngle(a0: number, a1: number, t: number): number {
  // Normalize angles to [0, 2PI)
  a0 = a0 % (2 * Math.PI);
  if (a0 < 0) a0 += 2 * Math.PI;
  
  a1 = a1 % (2 * Math.PI);
  if (a1 < 0) a1 += 2 * Math.PI;
  
  // Find the shortest arc between the angles
  let delta = a1 - a0;
  
  // Handle wrapping
  if (delta > Math.PI) {
    delta -= 2 * Math.PI;
  } else if (delta < -Math.PI) {
    delta += 2 * Math.PI;
  }
  
  // Interpolate
  return (a0 + delta * t) % (2 * Math.PI);
}
