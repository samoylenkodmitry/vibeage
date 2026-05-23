# Cozy Coast — Mobile & Low-end Fallback

Mobile and bandwidth-constrained devices land on a lighter
preset automatically. The picker lives in
`apps/client/src/world-art/quality.ts` (`chooseWorldArtQuality`)
and is exercised by `tests/worldArtQuality.spec.ts`.

## Auto-detection rules

| Signal | Action |
|---|---|
| `navigator.connection.saveData === true` | clamp to `low` |
| `navigator.connection.effectiveType` ∈ {`2g`, `3g`} | clamp to `low` |
| `navigator.deviceMemory ≤ 4` GB | clamp to `medium` |
| `window.devicePixelRatio > 1.5` (high DPI) | clamp to `medium` |
| Otherwise | `high` |

The picker is SSR-safe — it returns `medium` if `window` is
undefined.

## What each preset turns down

The presets are read by every cozy-coast component
(`CozyAtmosphere`, `CozyPineForest`, `CozyProceduralFallback`,
`CozyStarterPines`) and modulate counts/quality there. Specific
behavior today:

- **Tree scatter count** — 36 (low) / 72 (medium) / 120 (high)
- **Rock scatter count** — 8 / 18 / 30
- **Grass scatter count** — 40 / 110 / 220
- **Renderer pixel ratio** — capped at `min(devicePixelRatio,
  high ? 2 : 1.5)`
- **Fog far plane** — pulled in on `low` so the bandlimited
  forest reads as intentional silhouettes, not as gaps

Postprocessing and shadows are intentionally **off** for every
preset in PR 1–4. PR 6 (post-launch) may enable them under
`high` once draw-call budgets are measured.

## Asset payload (cozy-coast slice)

Budgets are pinned in `quality/performance-budgets.json` and
enforced by `tests/worldArtBudget.spec.ts`:

- All GLBs combined ≤ **8.5 MB**
- All terrain textures combined ≤ **9.0 MB**
- Any single file ≤ **3.0 MB**
- Total cozy payload ≤ **20 MB** (plan target)

If a future PR breaks one of these, the test fails with a hint
in the message — either compress the asset (gltf-transform draco
for GLBs, mozjpeg for JPGs) or bump the budget intentionally
with a comment in the JSON.
