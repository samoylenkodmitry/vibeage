import * as THREE from 'three';

/**
 * Grass-density map. The grass shader can't run the JS biome lookup per blade,
 * so we bake `densityFn(x,z)` (biome grass density × coast mask) onto a small
 * R8 texture covering a region around the player and sample it in the vertex
 * shader. Blades thin out / clear where density is low (sand, dirt, scorched),
 * giving a soft meadow→bare transition that matches the world's authored biomes.
 *
 * Position-stable: density is a pure function of world position, so a given spot
 * has the same value regardless of where the map is centred. The first build is
 * synchronous (so grass is biome-aware from the first frame); later rebuilds —
 * triggered when the player drifts past `REBUILD_DIST` from the map centre — fill
 * a few rows per frame to avoid a hitch, and only swap the centre when complete.
 */
const RES = 96;
const HALF = 620;          // map covers ±620 m around its centre
const REBUILD_DIST = 220;  // recentre once the player drifts this far
const ROWS_PER_FRAME = 10;

export class GrassDensityField {
  readonly texture: THREE.DataTexture;
  readonly half = HALF;
  centerX = NaN;
  centerZ = NaN;
  private readonly data: Uint8Array;
  private building = false;
  private buildRow = 0;
  private pendingX = 0;
  private pendingZ = 0;

  constructor() {
    this.data = new Uint8Array(RES * RES).fill(255); // full grass until the first bake
    this.texture = new THREE.DataTexture(this.data, RES, RES, THREE.RedFormat, THREE.UnsignedByteType);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.needsUpdate = true;
  }

  /** Call once per frame with the player position + the density function. */
  update(focusX: number, focusZ: number, densityFn: (x: number, z: number) => number): void {
    if (Number.isNaN(this.centerX)) {
      this.bakeRows(focusX, focusZ, densityFn, 0, RES); // first map: synchronous
      this.centerX = focusX; this.centerZ = focusZ;
      this.texture.needsUpdate = true;
      return;
    }
    if (!this.building && Math.hypot(focusX - this.centerX, focusZ - this.centerZ) > REBUILD_DIST) {
      this.building = true; this.buildRow = 0; this.pendingX = focusX; this.pendingZ = focusZ;
    }
    if (this.building) {
      const end = Math.min(RES, this.buildRow + ROWS_PER_FRAME);
      this.bakeRows(this.pendingX, this.pendingZ, densityFn, this.buildRow, end);
      this.buildRow = end;
      if (this.buildRow >= RES) {
        this.building = false;
        this.centerX = this.pendingX; this.centerZ = this.pendingZ;
        this.texture.needsUpdate = true;
      }
    }
  }

  private bakeRows(cx: number, cz: number, densityFn: (x: number, z: number) => number, z0: number, z1: number): void {
    for (let z = z0; z < z1; z += 1) {
      const wz = cz + (((z + 0.5) / RES) - 0.5) * 2 * HALF;
      for (let x = 0; x < RES; x += 1) {
        const wx = cx + (((x + 0.5) / RES) - 0.5) * 2 * HALF;
        const d = densityFn(wx, wz);
        this.data[z * RES + x] = Math.max(0, Math.min(255, Math.round(d * 255)));
      }
    }
  }

  dispose(): void {
    this.texture.dispose();
  }
}
