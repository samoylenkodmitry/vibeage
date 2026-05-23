import { describe, expect, it } from 'vitest';
import { WORLD_SETTINGS } from '../packages/content/world';
import { createTerrainGeometry } from '../apps/client/src/WorldGround';

/**
 * Pins the contract `TexturedTerrainMaterial` depends on: every
 * generated terrain chunk has positions, vertex colors, indices,
 * AND uvs. Before PR 3 the geometry only carried positions +
 * colors, so adding `map` / `normalMap` to the material would
 * silently fall back to (0,0) on every vertex and the textures
 * would project as a single stretched pixel.
 */
describe('createTerrainGeometry', () => {
  const geometry = createTerrainGeometry(0, 0);
  const segments = WORLD_SETTINGS.terrainChunkSegments;
  const verticesPerSide = segments + 1;
  const expectedVertices = verticesPerSide * verticesPerSide;

  it('has position, color, and uv attributes', () => {
    expect(geometry.attributes.position).toBeDefined();
    expect(geometry.attributes.color).toBeDefined();
    expect(geometry.attributes.uv).toBeDefined();
  });

  it('uv attribute has 2 components per vertex', () => {
    const uv = geometry.attributes.uv;
    expect(uv.itemSize).toBe(2);
    expect(uv.count).toBe(expectedVertices);
  });

  it('uvs span 0..1 across the chunk', () => {
    const uv = geometry.attributes.uv;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (let i = 0; i < uv.count; i += 1) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      if (u < minU) minU = u; if (u > maxU) maxU = u;
      if (v < minV) minV = v; if (v > maxV) maxV = v;
    }
    expect(minU).toBe(0);
    expect(maxU).toBeCloseTo(1, 5);
    expect(minV).toBe(0);
    expect(maxV).toBeCloseTo(1, 5);
  });

  it('still emits indices for two triangles per quad', () => {
    expect(geometry.index?.count).toBe(segments * segments * 6);
  });
});
