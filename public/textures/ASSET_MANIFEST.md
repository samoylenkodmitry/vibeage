# Terrain Texture Manifest

All textures are CC0 / public domain. The renderer reads paths
from `apps/client/src/world-art/useTerrainTextures.ts`; this
manifest is the human-readable mirror.

| File | Source | Page |
|---|---|---|
| `sand_color.jpg` | ambientCG (CC0) — Ground037 | <https://ambientcg.com/view?id=Ground037> |
| `sand_normal.jpg` | ambientCG (CC0) — Ground037 | <https://ambientcg.com/view?id=Ground037> |
| `grass_color.jpg` | ambientCG (CC0) — Grass001 | <https://ambientcg.com/view?id=Grass001> |
| `grass_normal.jpg` | ambientCG (CC0) — Grass001 | <https://ambientcg.com/view?id=Grass001> |

## License

CC0 1.0 Universal — Public Domain Dedication.
Source: <https://creativecommons.org/publicdomain/zero/1.0/>.
No attribution required for use, but ambientCG is credited above
per project convention.

## Tiling

`useTerrainTextures` sets `repeat.set(80, 80)` against a 256 m
chunk (≈ 3 m per texture tile). Adjust there if a future scene
needs coarser or finer tiling.
