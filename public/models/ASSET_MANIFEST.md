# Cozy-coast Asset Manifest

All models are CC0 / public domain **except** `monsters/StoneGolem.glb`
(joney_lol, CC-BY 3.0 — attribution required, credited below). The renderer
reads from `apps/client/src/world-art/assetRegistry.ts`; this manifest is the
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
| `characters/kaykit/Knight.glb` | KayKit Adventurers (Kay Lousberg) | CC0 | <https://kaylousberg.itch.io/kaykit-adventurers> |
| `characters/kaykit/Mage.glb` | KayKit Adventurers (Kay Lousberg) | CC0 | <https://kaylousberg.itch.io/kaykit-adventurers> |
| `characters/kaykit/Rogue.glb` | KayKit Adventurers (Kay Lousberg) | CC0 | <https://kaylousberg.itch.io/kaykit-adventurers> |
| `characters/kaykit/Rogue_Hooded.glb` | KayKit Adventurers (Kay Lousberg) | CC0 | <https://kaylousberg.itch.io/kaykit-adventurers> |
| `characters/kaykit/Barbarian.glb` | KayKit Adventurers (Kay Lousberg) | CC0 | <https://kaylousberg.itch.io/kaykit-adventurers> |
| `characters/soldier.glb` | three.js examples | CC0 | <https://github.com/mrdoob/three.js/tree/master/examples/models/gltf> |
| `characters/robot-expressive.glb` | Tomás Laulhé / Don McCurdy | CC0 | <https://github.com/mrdoob/three.js/tree/master/examples/models/gltf/RobotExpressive> |

`AnimatedCharacter.tsx` renders the **KayKit Adventurers** (CC0) — five fantasy
classes sharing one 76-clip rig (`Idle` / `Walking_A` / `Running_A` /
`1H_Melee_Attack_Slice_Horizontal` / `Death_A`, real death + attack). Players get
a per-id class look; humanoid/undead mobs reuse the rig tinted. `soldier.glb` and
`robot-expressive.glb` are kept as alternates.

### Monsters (non-humanoid enemy families)

Quaternius "Ultimate Monsters" (CC0) — each non-humanoid enemy family renders one
of these instead of a primitive box. Two rig variants share one clip convention
(`CharacterArmature|…`): ground walkers (`Idle`/`Walk`/`Run`/`Punch`/`Death`) and
hovering flyers (`Flying_Idle`/`Fast_Flying`/`Punch`/`Death`).

| File | Family | Source | Page |
|---|---|---|---|
| `monsters/Dino.glb` | beast | Quaternius (CC0) | <https://poly.pizza/m/1c1ae302> |
| `monsters/GreenBlob.glb` | elemental | Quaternius (CC0) | <https://poly.pizza/m/64ab590e> |
| `monsters/Dragon.glb` | dragon | Quaternius (CC0) | <https://poly.pizza/m/ae5b8510> |
| `monsters/Squidle.glb` | aberration | Quaternius (CC0) | <https://poly.pizza/m/cbe8419d> |
| `monsters/Armabee.glb` | fey | Quaternius (CC0) | <https://poly.pizza/m/de63aaf6> |
| `monsters/Ghost.glb` | spirit | Quaternius (CC0) | <https://poly.pizza/m/810f60a2> |
| `monsters/MushroomKing.glb` | plant | Quaternius (CC0) | <https://poly.pizza/m/798301fb> |
| `monsters/StoneGolem.glb` | construct | joney_lol (**CC-BY 3.0**, attribution required) — static mesh | <https://poly.pizza/m/aqrX9Hly1W> |

`characterModels.ts` maps `family → model`; `ANIMATED_ENEMY_FAMILIES` (in
`WorldEntities.tsx`) now covers every family, so only the low-quality tier still
falls back to primitives.

### Weapons (held in `handslot.r`)

| File | Source | License |
|---|---|---|
| `weapons/kaykit/sword_1handed.glb` | KayKit Adventurers (Kay Lousberg) | CC0 |
| `weapons/kaykit/dagger.glb` | KayKit Adventurers (Kay Lousberg) | CC0 |
| `weapons/kaykit/staff.glb` | KayKit Adventurers (Kay Lousberg) | CC0 |
| `weapons/kaykit/axe_1handed.glb` | KayKit Adventurers (Kay Lousberg) | CC0 |
| `weapons/kaykit/wand.glb` | KayKit Adventurers (Kay Lousberg) | CC0 |
| `weapons/kaykit/crossbow_1handed.glb` | KayKit Adventurers (Kay Lousberg) | CC0 |

Converted from the pack's `.gltf` to self-contained `.glb` (gltf-transform).
`weaponModels.ts` maps content `weaponType` → GLB; `AnimatedCharacter` parents it
to the `handslot.r` bone so it tracks the hand through every animation.

The character system is **model-agnostic** via `characterModels.ts`: each model's
GLB path, native height, forward axis, and abstract-state→clip-name map live in
the registry. Swapping in a paid/custom (L2-style) model is a registry edit —
add an entry + point the picker at it; nothing in the renderer changes.
