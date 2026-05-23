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

`pnpm run content:audit` lists items with no loot / vendor / recipe / quest source. As of this writing, **7 items are hanging** (all on the legacy `OBTAINABILITY_WHITELIST`):

- [ ] `ancient_tome` — design a low-level "lost lore" quest reward chain
- [ ] `dungeon_key` — gate it behind a chest spawn or quest objective
- [ ] `experience_orb` — drop from a high-level boss or quest reward
- [ ] `mysterious_artifact` — quest reward (mid-tier hook)
- [ ] `sealed_letter` — quest hand-in chain
- [ ] `shadow_crown` — make it actual mini-boss loot (Nyaraal / The Mistwalker)
- [ ] `teleport_scroll` — vendor stock (Gludin general goods, after first kill)

For each: drop from `OBTAINABILITY_WHITELIST` once a real source ships. The wiki's Items tab already warns "⚠ No source yet — placeholder item" on each hanging item.

### 2. Equip feedback — clear "why not" line

✅ **Shipped 2026-05-23.** Locked items now ALWAYS dispatch `EquipItem` so the server's typed `CommandRejected` reaches the combat log: "Couldn't equip: you need a higher level for this item" / "your class can't use this item" / "your bag needs a free slot to hold the unequipped piece" / etc. The tooltip also shows a `Requires: Lv N · Class` line on every equippable item regardless of whether the player can equip now.

### 3. Wiki: hanging-item warning + source visibility

✅ **Shipped 2026-05-23.** Wiki Items tab renders all known sources (drop / vendor / quest-reward / recipe) per row. When an item has no source, a yellow `⚠ No source yet — placeholder item, not obtainable in-world` banner appears with a pointer to `docs/UNLINKED.md`.

### 4. Full-body armor equip clarity

✅ **Shipped 2026-05-23.** The two relevant rejections (`inventoryFullForUnequippedItems`, `twoHandBlocksOffhand`) now have user-readable copy in the combat log. Mechanic itself is correct — equipping a full-body when chest + legs are already worn needs at least one free bag slot (the unequipped piece has to land somewhere).

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
