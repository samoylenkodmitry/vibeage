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
  return p.idle.pop() || p.factory();
}

export function recycle(type: string, inst: Group) {
  inst.visible = false;
  inst.position.set(0, 0, 0);
  pools[type]?.idle.push(inst);
}
