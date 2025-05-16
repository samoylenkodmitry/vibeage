export interface Snap { pos:{x:number,z:number}; rot:number; vel:{x:number,z:number}; snapTs:number }

export const GROUND_Y = 0.5;

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

// Module-global SnapBuffer map - one buffer per entity, lives for app lifetime
const bufMap: Record<string, SnapBuffer> = {};
export const getBuffer = (id: string) => bufMap[id] || (bufMap[id] = new SnapBuffer());

export class SnapBuffer {
  private lastSnap: Snap | null = null;

  clearBuffer() {
    this.lastSnap = null;
    console.log("Buffer cleared");
  }

  push(s:Snap){
    console.log(`Pushing snap: id=${(s as any).id}, snapTs(clientReceive)=${s.snapTs.toFixed(0)}, serverOriginTs=${(s as any).serverSnapTs || 'N/A'}, pos=...`);
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

  sample(renderTs: number) {
      if (this.lastSnap === undefined || this.lastSnap === null) { return null }
      return this.lastSnap;
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
