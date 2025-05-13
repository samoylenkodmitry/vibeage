import { Group } from 'three';
type Pool = { idle: Group[]; factory: () => Group };

const pools: Record<string, Pool> = {};

export function registerPool(
  type: string,
  factory: () => Group,
  warm = 20
) {
  const idle = Array.from({ length: warm }, factory);
  pools[type] = { idle, factory };
}

export function get(type: string): Group {
  const p = pools[type] || (() => { throw new Error(`Pool type '${type}' is not registered`); })();
  
  // Try to find a pooled group that's explicitly marked as invisible
  let pooledGroup: Group | undefined;
  for (let i = 0; i < p.idle.length; i++) {
    if (!p.idle[i].visible) {
      pooledGroup = p.idle.splice(i, 1)[0];
      break;
    }
  }
  
  // If no invisible groups found, create a new one
  const group = pooledGroup || p.idle.pop() || p.factory();
  
  // Ensure the group is visible and properly initialized
  group.visible = true;
  group.position.set(0, 0, 0);
  group.rotation.set(0, 0, 0);
  group.scale.set(1, 1, 1);
  
  console.log(`[vfxPool] Getting ${type} from pool`);
  return group;
}

export function recycle(type: string, inst: Group) {
  console.log(`[vfxPool] Recycling ${type} into pool`);
  
  // Make the group invisible
  inst.visible = false;
  
  // Reset all transformations
  inst.position.set(0, 0, 0);
  inst.rotation.set(0, 0, 0);
  inst.scale.set(1, 1, 1);
  
  // Clear any animations or states
  inst.userData = {};
  
  // Return to pool
  pools[type]?.idle.push(inst);
}
