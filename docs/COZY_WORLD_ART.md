# Cozy World Art

The visual layer that turns the procedural prototype world into an
authored, cozy-aesthetic MMO scene. Layered on top of the existing
`WorldEnvironment` day/night cycle — does not replace it.

> Important: the user explicitly preferred WorldEnvironment's sky
> (sun, moon, clouds, day/night palette) over any flat cozy sky
> variant. Do not write `scene.background` or `scene.fog` from the
> cozy art layer. See `feedback_keep_world_environment` in memory.

## Two tiers

### 1. Global (everywhere in the world)

Renders independent of zone:

| File | What it adds |
|---|---|
| `apps/client/src/world-art/InstancedGltf.tsx` | Helper that loads a GLB once and renders InstancedMesh per sub-mesh. Supports per-instance tint (`colors`) and shader-injected wind sway (`wind`). |
| `apps/client/src/WorldEnvironment.tsx` (`FoliageField`) | Scatters Quaternius CC0 pines + rocks via InstancedGltf using the existing biome-aware density. Splits by index parity for variant mix. Grass stays procedural. |
| `apps/client/src/WorldGround.tsx` | Default `visualMode='textured'` with grass texture; cozy scene flips palette to sand. |
| `apps/client/src/NightStars.tsx` | Drei `<Stars>` faded by sun direction (fragment shader patched with `dayFade` uniform). |
| `apps/client/src/BirdFlock.tsx` | 7-bird V formation orbiting the player, visible at dawn/dusk only. |
| `apps/client/src/SceneVfx.tsx` (`LootMarker`) | Warm pointLight on every loot pile so drops read across the field. |

### 2. Cozy hero scene (anchored to a registered scene)

Only mounts when `pickActiveScene(player.x, player.z)` returns a
scene. Today there's one scene — `STARTER_COZY_COAST` — at the
spawn point with water on negative X.

| File | What it adds |
|---|---|
| `world-art/worldArtScenes.ts` | Registry of anchored scenes (origin, radius, waterline, authored props). |
| `world-art/CozyWorldArt.tsx` | Top-level mount. Composes the rest in z-order. |
| `world-art/CozyDistantMountains.tsx` | Ring of 11 cone-mountain silhouettes on the water-side horizon. |
| `world-art/SimpleStylizedWater.tsx` | Shader water plane (vertex wave, depth gradient, foam line). `raycast={() => null}` so click-to-move falls through. |
| `world-art/CozyShoreBand.tsx` | Pale sand strip along the waterline. |
| `world-art/CozyShoreFoam.tsx` | Animated foam crests at the water edge. |
| `world-art/CozyWaterLilies.tsx` | 9 bobbing lily pads (some with lotus centers). |
| `world-art/CozyWaterSparkles.tsx` | Drei `<Sparkles>` over the water at night (moonlit shimmer). |
| `world-art/CozyAuthoredCoast.tsx` | Hand-placed Quaternius props (dock, rowboat, bonfire) from scene.props. |
| `world-art/CozyBonfireGlow.tsx` | Warm flickering pointLight at every bonfire anchor. |
| `world-art/CozyBonfireSmoke.tsx` | Drifting smoke column above every bonfire. |
| `world-art/CozyLanterns.tsx` | Small flickering pointLight + emissive sphere at every lantern anchor. |
| `world-art/CozyFireflies.tsx` | 38 wandering Points, visible at night. |
| `world-art/CozyPetals.tsx` | 80 falling cherry-blossom petals (perpetual). |
| `world-art/CozyPineForest.tsx` | Dedicated GLB pine scatter for the cozy band (overlaps with global; pre-dates the global one). |

## Performance notes

Asset payload (`quality/performance-budgets.json`):

- All GLBs combined ≤ 8.5 MB (Quaternius CC0 + 6 cozy props).
- All terrain textures combined ≤ 9.0 MB (ambientCG CC0).
- No single file > 3.0 MB.

Draw-call budget for the cozy hero scene (rough):

- Global foliage: ~12 (6 InstancedMesh layers × 2 sub-meshes per pine GLB).
- Cozy decoration: ~15 (mountains group, water + foam + sparkles + lilies, props, lights, fireflies, smoke, petals).

Enforced by `tests/worldArtBudget.spec.ts`.

## Architecture invariants

1. **`scene.background` and `scene.fog` are owned by `WorldEnvironment`.**
   Don't touch them from the cozy layer.
2. **`raycast={() => null}` on every cozy mesh that sits above ground.**
   Click-to-move must always fall through to `WorldGround`.
3. **Anchored scenes only.** Water + props + cozy foliage don't
   follow the player; they're pinned to a registered scene origin.
4. **GLB loading via `useGLTF.preload` at module init** so the
   first frame already has assets streaming.
5. **InstancedMesh, not Clone, for any layer above ~50 instances.**
   `InstancedGltf` handles the GLB → InstancedMesh translation.
