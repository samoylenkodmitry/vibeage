import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ASSET_REGISTRY } from '../apps/client/src/world-art/assetRegistry';
import { TERRAIN_TEXTURE_PATHS } from '../apps/client/src/world-art/useTerrainTextures';

/**
 * Hard gate on the cozy-coast asset payload. Reads the budget
 * from `quality/performance-budgets.json` so a designer can
 * adjust without editing tests — the gate stays in sync.
 *
 * If this test starts failing, the answer is usually one of:
 *   - a new GLB is too heavy → run gltf-transform or downsample
 *     before merging
 *   - the cumulative payload crept up → review the manifest and
 *     bump the budget intentionally with a comment in the JSON
 */
const REPO_ROOT = process.cwd();
const PUBLIC_DIR = join(REPO_ROOT, 'public');

async function loadBudget() {
  const raw = await readFile(join(REPO_ROOT, 'quality/performance-budgets.json'), 'utf-8');
  return JSON.parse(raw) as {
    worldArt: {
      assetPayloadMb: { modelsTotal: number; texturesTotal: number };
      singleAssetMbMax: number;
    };
  };
}

function sumSizes(paths: readonly string[]): number {
  let bytes = 0;
  for (const p of paths) {
    const fsPath = join(PUBLIC_DIR, p);
    bytes += statSync(fsPath).size;
  }
  return bytes;
}

describe('cozy-coast performance budgets', () => {
  it('all model GLBs together stay under the configured budget', async () => {
    const budget = await loadBudget();
    const totalBytes = sumSizes(ASSET_REGISTRY.map((a) => a.path));
    const totalMb = totalBytes / (1024 * 1024);
    expect(totalMb).toBeLessThanOrEqual(budget.worldArt.assetPayloadMb.modelsTotal);
  });

  it('all terrain textures together stay under the configured budget', async () => {
    const budget = await loadBudget();
    const totalBytes = sumSizes(TERRAIN_TEXTURE_PATHS);
    const totalMb = totalBytes / (1024 * 1024);
    expect(totalMb).toBeLessThanOrEqual(budget.worldArt.assetPayloadMb.texturesTotal);
  });

  it('no single asset exceeds the per-file size limit', async () => {
    const budget = await loadBudget();
    const limit = budget.worldArt.singleAssetMbMax * 1024 * 1024;
    const allPaths = [...ASSET_REGISTRY.map((a) => a.path), ...TERRAIN_TEXTURE_PATHS];
    for (const p of allPaths) {
      const size = statSync(join(PUBLIC_DIR, p)).size;
      expect(size, `${p} exceeds ${budget.worldArt.singleAssetMbMax} MB`).toBeLessThanOrEqual(limit);
    }
  });

  it('total cozy-coast payload stays under the plan target (20 MB)', () => {
    const totalBytes = sumSizes([
      ...ASSET_REGISTRY.map((a) => a.path),
      ...TERRAIN_TEXTURE_PATHS,
    ]);
    const totalMb = totalBytes / (1024 * 1024);
    expect(totalMb).toBeLessThan(20);
  });
});
