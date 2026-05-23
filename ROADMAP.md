# VibeAge Roadmap

Last rewritten: 2026-05-23

This is the **active roadmap** — current focus and quality gate. For:

- Shipped work and the original long-form rewrite plan → [docs/ROADMAP_HISTORY.md](docs/ROADMAP_HISTORY.md)
- Outstanding architecture debt + external audits → [docs/ARCHITECTURE_DEBT.md](docs/ARCHITECTURE_DEBT.md)
- Auto-generated unlinked-content snapshot → [docs/UNLINKED.md](docs/UNLINKED.md) (regenerate via `pnpm run content:audit`)

## Direction

VibeAge should become a browser-first multiplayer RPG with a very large fantasy world, server-owned simulation, mobile-friendly controls, and a world view that feels alive instead of a flat prototype grid.

Production target remains the VPS. `main` is production-affecting and deployment pulls from `origin/main` through local scripts.

## Non-Negotiables

- The server owns movement validation, region activation, enemy spawning, combat, loot, inventory, and persistence.
- The client renders presentation, local smoothing, input, HUD, and visual atmosphere only.
- Huge world content must not imply huge per-tick server work. Runtime activation, spawning, visibility, and broadcasts stay budgeted.
- Mobile must be playable in-browser without app install, keyboard, or desktop-only panels.
- Before merge, prefer `pnpm run check`.
- Before production deploy, use the local deploy script and `pnpm run health:production`.

## Active Focus — Content Validation Pass

Surfaced by playtesting on account `a/a`. Each item is a fix the player can feel.

### 1. Hanging items: wire every entry in `ITEMS` to a source

✅ **Shipped 2026-05-23.** All 7 legacy `OBTAINABILITY_WHITELIST` orphans (`ancient_tome`, `dungeon_key`, `experience_orb`, `mysterious_artifact`, `sealed_letter`, `shadow_crown`, `teleport_scroll`) were declared in `ITEMS` and rendered in the wiki without any source in the world. They've been **removed from `ITEMS` entirely** rather than left as placeholders — `docs/UNLINKED.md` now reports zero hanging items and the whitelist is currency-only. Items can be re-added when a real source + use ships.

A bidirectional integrity test (`tests/itemSetBackref.spec.ts`) plus `tests/equipmentSetSlotValidity.spec.ts` keep future additions consistent.

### 2. Equip feedback — clear "why not" line

✅ **Shipped 2026-05-23.** Locked items now ALWAYS dispatch `EquipItem` so the server's typed `CommandRejected` reaches the combat log: "Couldn't equip: you need a higher level for this item" / "your class can't use this item" / "your bag needs a free slot to hold the unequipped piece" / etc. The tooltip also shows a `Requires: Lv N · Class` line on every equippable item regardless of whether the player can equip now.

### 3. Wiki: hanging-item warning + source visibility

✅ **Shipped 2026-05-23.** Wiki Items tab renders all known sources (drop / vendor / quest-reward / recipe) per row. When an item has no source, a yellow `⚠ No source yet — placeholder item, not obtainable in-world` banner appears with a pointer to `docs/UNLINKED.md`.

### 4. Full-body armor equip clarity

✅ **Shipped 2026-05-23.** The two relevant rejections (`inventoryFullForUnequippedItems`, `twoHandBlocksOffhand`) now have user-readable copy in the combat log. Mechanic itself is correct — equipping a full-body when chest + legs are already worn needs at least one free bag slot (the unequipped piece has to land somewhere).

### 5. Equipment sets — one grade per set + full coverage

Surfaced from playtesting (Wildlands Hunter / Elementborn) — the wiki now exposes each set's tier via `GRADE_SPECS`, and players noticed that today's sets mix grades inside a single set (e.g. C-grade chest + D-grade weapon). The design target is:

- [ ] **Every set is single-grade.** Each `EQUIPMENT_SETS` entry should declare items all sharing the same `item.grade`. Add a `tests/equipmentSetSameGrade.spec.ts` gate so this is CI-enforced. The wiki Sets tab's "mixed tiers" warning becomes unreachable.
- [ ] **Sets per specialization × grade.** Goal: every player specialization has one set at each grade (D / C / B / A / S). That's roughly `(#specs) × 5` sets total. Each set ships with:
  - 3–4 pieces (whatever the spec's primary slots can wear simultaneously — validated by `equipmentSetSlotValidity.spec.ts`)
  - Two bonus tiers tuned to the spec's stat priorities (e.g. crit-focused for Treasure Hunter, mDef-focused for Templar)
  - Drops/recipes wired to a boss or quest of the matching level band (`GRADE_SPECS[grade].minLevel`)
- [ ] **Cross-link in wiki Specs tab.** Each specialization page should list the sets that exist for it across all grades, so a player picking a spec sees the gear progression at a glance.

### 6. World map UX

Surfaced from playtesting — opening the map at the current zoom centers on the player but their surroundings collapse to a single dot.

✅ **Shipped 2026-05-23.** Default zoom is now \"~30 seconds of run-speed\" (1200 world units = 60s × 20u/s baseline runSpeed in each direction). Max zoom raised so the player can frame ~2 m around themselves; min zoom still shows the whole world. Labels use a non-scaling-text technique so they stay readable at every zoom. Overlapping labels collapse to a count badge (e.g. \"Riverhead District (4)\") so dense regions don't pile up into illegible text.

### 7. Cozy world art layer

Shipped iteratively across PRs #512-#537 (2026-05-23). World now reads as authored rather than prototype:

- **Foliage everywhere**: Quaternius CC0 GLB pines + rocks scattered globally via `InstancedGltf` (one InstancedMesh per geometry/material leaf), preserving the existing biome-aware density and vertex-color tints. Multiple pine variants split by index parity for variety.
- **Textured ground**: `WorldGround` default mode is now `'textured'` — grass texture everywhere, sand inside the cozy hero scene radius.
- **Wind sway**: tree canopies subtly sway via shader injection on the GLB material (per-instance phase from world position).
- **Cozy hero scene (Peaceful Meadows / starter spawn)**: anchored composition with low-poly water + foam crests + shore band + dock + rowboat + bonfire (flicker light + drifting smoke) + lanterns + distant mountain silhouettes + drifting cherry-blossom petals + water lilies + wandering fireflies + moonlit water sparkles.
- **Day / night**: night stars (Drei `<Stars>` with fragment-shader patched fade), distant bird flock at dawn/dusk, loot piles glow with a warm pointLight.
- **Architecture**: `WorldEnvironment` still owns the sky / sun / moon / clouds / day-night palette everywhere (the user explicitly preferred this over any flat cozy sky). `CozyWorldArt` only contributes anchored geometry under it.

Files: `apps/client/src/world-art/*`, `apps/client/src/{WorldEnvironment,WorldGround,WorldScene,NightStars,BirdFlock,SceneVfx}.tsx`. Asset payload ~16 MB (8.5 MB GLBs + 8 MB textures); budgets pinned in `quality/performance-budgets.json` and enforced by `tests/worldArtBudget.spec.ts`.

## Quality Gate

Before merge:

```bash
pnpm run check
```

For production deployment:

```bash
pnpm run deploy:production
pnpm run health:production
```

Content validation:

```bash
pnpm run content:audit         # refresh docs/UNLINKED.md
pnpm run content:audit:check   # CI gate — fails if stale
```
