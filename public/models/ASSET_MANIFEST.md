# Cozy-coast Asset Manifest

All models are CC0 / public domain. The renderer reads from
`apps/client/src/world-art/assetRegistry.ts`; this manifest is the
human-readable mirror of that registry.

Optimization pass deferred to a later PR (see roadmap §"Cozy Coast
PR 5 — visual smoke + budget hardening"). Targets: keep total
initial GLB payload under 20 MB, draw-call budget for the cozy
scene under 60 on `medium` quality.

## Trees

| File | Polys | Source | Page |
|---|---:|---|---|
| `trees/pine_a.glb` | 225 | Quaternius (CC0) | <https://poly.pizza/m/gX8WmgkeEm> |
| `trees/pine_b.glb` | ~1200 | Quaternius (CC0) | <https://poly.pizza/m/aVOxaHRPWe> |
| `trees/pine_c.glb` | ~900 | Quaternius (CC0) | <https://poly.pizza/m/Zt62gceKXZ> |

## Rocks

| File | Polys | Source | Page |
|---|---:|---|---|
| `rocks/rock_round_small.glb` | 80 | Quaternius (CC0) | <https://poly.pizza/m/GMttpOEFKT> |
| `rocks/rock_medium_a.glb` | 220 | Quaternius (CC0) | <https://poly.pizza/m/s1OJ3bBzqc> |

## Foliage

| File | Polys | Source | Page |
|---|---:|---|---|
| `foliage/grass_tuft.glb` | 60 | Quaternius (CC0) | <https://poly.pizza/m/UGTOzcO3P2> |

## Coast props (PR 4 — authored placements)

These are hand-placed at registered positions in
`worldArtScenes.ts` (`STARTER_COZY_COAST.props`) — dock juts into
the water, rowboat beside it, bonfire on the dry sand.

| File | Polys | Source | Page |
|---|---:|---|---|
| `coast/dock_long.glb` | ~600 | Quaternius (CC0) | <https://poly.pizza/m/bN9Oz3niNm> |
| `coast/rowboat.glb` | ~320 | Quaternius (CC0) | <https://poly.pizza/m/adoP7kR7S17> |
| `coast/bonfire.glb` | ~240 | Quaternius (CC0) | <https://poly.pizza/m/Azj9hJwwwG> |

## License

CC0 1.0 Universal — Public Domain Dedication.
Source: <https://creativecommons.org/publicdomain/zero/1.0/>.
No attribution required for use, but Quaternius is credited above
per project convention.

## Fallback strategy

Every asset declares a procedural fallback in the registry
(`assetRegistry.ts`). If a GLB fails to load at runtime the cozy
scene still renders intentional geometry — pine silhouettes from
PR 1, plus colored primitives for rocks and grass — so the scene
is never blank.

## Characters

| File | Source | License | Page |
|---|---|---|---|
| `characters/robot-expressive.glb` | Tomás Laulhé / Don McCurdy | CC0 | <https://github.com/mrdoob/three.js/tree/master/examples/models/gltf/RobotExpressive> |

Clips used by `AnimatedCharacter.tsx`: `Idle`, `Walking`, `Running`, `Punch` (attack), `Death`. The character system is model-agnostic — swapping a different rigged GLB only needs the `CLIP` map updated to that model's clip names.
