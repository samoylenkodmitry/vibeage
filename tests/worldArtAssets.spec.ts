import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ASSET_REGISTRY,
  getAssetById,
  getAssetsByKind,
  getTreeAssetPaths,
} from '../apps/client/src/world-art/assetRegistry';

/**
 * Pins the asset-registry contract that the GLB foliage layers and the
 * `ASSET_MANIFEST.md` both rely on. The registry is the single
 * source of truth: if these tests pass, a GLB that ships in
 * `public/` will actually load at runtime with the right path,
 * scale, and license metadata. If they fail, the scene will lose
 * a layer (or worse, ship dead URLs) and the manifest will drift.
 */
const PUBLIC_DIR = join(process.cwd(), 'public');

describe('asset registry', () => {
  it('has unique ids', () => {
    const ids = ASSET_REGISTRY.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every registered file actually exists in public/', () => {
    for (const asset of ASSET_REGISTRY) {
      expect(asset.path.startsWith('/')).toBe(true);
      const fsPath = join(PUBLIC_DIR, asset.path);
      expect(existsSync(fsPath), `missing ${asset.path}`).toBe(true);
      const size = statSync(fsPath).size;
      expect(size).toBeGreaterThan(0);
      // Per the plan, a single GLB shouldn't exceed ~3 MB without
      // an optimization follow-up. Pine_b/c sit just under that.
      expect(size).toBeLessThan(3 * 1024 * 1024);
    }
  });

  it('every asset is CC0 with an attribution source', () => {
    for (const asset of ASSET_REGISTRY) {
      expect(asset.license).toBe('CC0');
      expect(asset.source.attribution.length).toBeGreaterThan(0);
      expect(asset.source.url.startsWith('https://')).toBe(true);
    }
  });

  it('every asset declares a fallback recipe', () => {
    for (const asset of ASSET_REGISTRY) {
      expect(asset.fallback).toBeDefined();
      if (asset.kind === 'tree') expect(asset.fallback.kind).toBe('pine');
      else if (asset.kind === 'rock') expect(asset.fallback.kind).toBe('rock');
      else if (asset.kind === 'grass') expect(asset.fallback.kind).toBe('grass');
      else if (asset.kind === 'prop') expect(asset.fallback.kind).toBe('prop');
    }
  });

  it('has at least one tree, rock, grass, and prop asset', () => {
    expect(getAssetsByKind('tree').length).toBeGreaterThan(0);
    expect(getAssetsByKind('rock').length).toBeGreaterThan(0);
    expect(getAssetsByKind('grass').length).toBeGreaterThan(0);
    expect(getAssetsByKind('prop').length).toBeGreaterThan(0);
  });

  it('getAssetById returns null for unknown ids', () => {
    expect(getAssetById('nonexistent.id')).toBeNull();
    expect(getAssetById('tree.pine.a')?.kind).toBe('tree');
  });

  it('getTreeAssetPaths returns the tree subset only', () => {
    const treePaths = getTreeAssetPaths();
    expect(treePaths.length).toBe(getAssetsByKind('tree').length);
    for (const p of treePaths) expect(p.includes('/trees/')).toBe(true);
  });

  it('ASSET_MANIFEST.md references every registered file', async () => {
    const fs = await import('node:fs/promises');
    const manifest = await fs.readFile(join(PUBLIC_DIR, 'models/ASSET_MANIFEST.md'), 'utf-8');
    for (const asset of ASSET_REGISTRY) {
      // path is /models/foo/bar.glb; manifest lists it as foo/bar.glb
      const rel = asset.path.replace(/^\/models\//, '');
      expect(manifest, `manifest missing ${rel}`).toContain(rel);
    }
  });
});
