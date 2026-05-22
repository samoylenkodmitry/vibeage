# VibeAge

A browser-first multiplayer 3D action RPG prototype: pick a race, pick a class, level up, specialize, fight mobs and bosses, drag through dungeons, drop loot for your party, and read the in-game wiki to plan your build.

Inspired by Lineage II's class progression and Diablo-style click-to-move + skill bar UX, runs on plain WebGL in the browser, server-authoritative state.

```
World ─────────── 34 hand-tuned zones + procedural biomes
Races ──────────── 5    (human, elf, dark elf, orc, dwarf)
Classes ──────────  7   (mage, warrior, healer, ranger, knight, paladin, rogue)
Specializations ── 14   (2 per class, unlocked at L20)
Active skills ─── 23 (cast-to-fire, in skill bar)
Class passives ── 21 always-on stat modifiers learned per class
Spec passives ── 14 specs × 2 tiers (spec @L20, proficiency @L40)
Mobs ──────────── 37 templates across 34 zones
Mini-bosses ───── 14 with telegraphed signature abilities
Items ──────────── 55 weapons / armor / consumables / materials
Wiki ──────────── 15 tabs, all content-driven
```

## Races

Pick one at character creation. Race owns base attributes and growth-per-level — class never multiplies them. Each race opens a different shortlist of classes.

| Race | Strengths | Eligible classes |
|------|-----------|------------------|
| **Human** | Balanced — no clear specialty, no real weakness | knight, paladin, mage |
| **Elf** | DEX + WIT; fragile body | ranger, healer |
| **Dark Elf** | INT + DEX; INT-heavy caster melee | rogue, mage |
| **Orc** | STR + CON; poor at magic | warrior |
| **Dwarf** | CON + MEN; modest DEX | warrior, healer |

(see `packages/content/races.ts` for the exact stat tables.)

## Classes

Each class has a skill tree mixing **actives** (cast-to-fire) with **passives** (always-on stat modifiers). You learn skills by spending skill points awarded on level-up.

| Class | Style | Signature actives | Passive direction |
|-------|-------|-------------------|-------------------|
| **Mage** | Ranged elemental burst | fireball, iceBolt, waterSplash, smite, dispel, petrify | Arcane Focus / Arcane Potency |
| **Warrior** | Melee bruiser | slash, bash, powerStrike, taunt, shieldWall | Battle Hardened / Toughness / Brutality |
| **Healer** | Backline support | holyLight, bless, dispel, divineShield, smite | Serenity / Warding |
| **Ranger** | Mid-range archer | arrowShot, volley, rapidFire, poisonBlade, evade | Woodland Step / Keen Eye / Swift Step |
| **Knight** | Frontline tank | slash, taunt, bash, shieldWall, divineShield | Iron Discipline / Armor Training / Iron Grip |
| **Paladin** | Holy hybrid | slash, smite, bless, holyLight, divineShield | Oath of Light / Holy Aegis / Radiant Focus |
| **Rogue** | Sneak striker | evade, backstab, poisonBlade, vanish | Shadow Strike / Shadow Grace / Lethal Focus |

(`packages/content/classes.ts` is the source of truth for the skill trees and level gates.)

## Specializations

At **level 20** you pick a **specialization** that re-flavours your class with a permanent passive modifier. At **level 40** the spec's **proficiency** tier kicks in with a second, stronger modifier. Picking is currently permanent (respec policy still open).

| Class | Specs (L20 → L40) |
|-------|-------------------|
| Mage | Arcanist (raw damage), Pyromancer (fire flavour) |
| Warrior | Berserker (low-HP DPS), Slayer (execute below 30%) |
| Healer | Cardinal (party HP-regen aura), Theurge (party damage aura + buff duration) |
| Ranger | Hawkeye (crit), Phantom Ranger (poison DoT + evasion) |
| Knight | Templar Knight (taunt range + Last Stand mitigation), Dark Avenger (Sanguine Blade lifesteal) |
| Paladin | Phoenix Knight (holy element + Resurrection save), Eva's Templar (Aegis + buff duration) |
| Rogue | Treasure Hunter (Lucky Find loot rate + evasion), Plains Walker (Shadow Step + Toxin) |

Each spec passive maps to a concrete runtime modifier on `SpecializationPassiveModifiers` — there are no "(planned)" descriptions in content; every spec passive line has a runtime that consumes it. See `packages/content/specializations.ts:130-200`.

## Mechanics

### Combat

- **Live-evaluated spec passives** — modifiers (damage element, cooldowns, lifesteal, party auras, loot rates, resurrection saves) are read at action time. Walking out of an aura's radius turns it off the next tick; you don't have to wait for a stat recompute.
- **Status effects** carry an explicit **stacking policy** per effect type:
  - `replace` (damage / heal / dispel / knockback)
  - `refresh` (stun / slow / freeze / shield / bless / evasion / invisible / taunt)
  - `stack` (DoTs — `dot`, `burn`, `poison` — up to 3)
  - `reject` (reserved for future "no re-apply while active" rules)
- **Damage pipeline** runs through a single resolver: shield absorption first, then mitigation (Last Stand below half HP), then Resurrection save (Phoenix Knight), then lifesteal credit, then aggro update.
- **Element weakness** — skills tagged `damageElement: 'water' | 'fire' | …` are amplified by matching `*Weakness` debuffs on the target.

### Enemy AI

- States: `idle → patrolling → chasing → attacking → returning`.
- **Pack aggro / disengage**: configurable per-species radius (`packAggroRadius`). When one mob aggros, packmates with the same `packId` within radius join the chase. When the source mob disengages (leash trip, anti-kite, target invisible, target killed), the pack heads home together.
- **Anti-kite**: after 8 s of chasing without landing a hit, the mob gives up and returns to spawn; same-tick re-aggro is suppressed for 2 s so the player can't immediately re-pull.
- **Mini-bosses** carry telegraphed signature abilities with `windUpMs`, `radius`, and `damageMul` — the same record drives both the in-game ring telegraph and the wiki entry.

### Movement + Anti-cheat

- Click-to-move with intent messages (`MoveIntent`). Server validates the path; the client smoothes via local prediction + rubber-band correction.
- Per-tick position snapshots at 10 Hz (`PosSnap`), per-entity, not batched.
- Stale movement intents are rejected (`packages/sim/movementSeq.ts`).

### Inventory + Loot

- Aggregate inventory model (`characterInventory`) with instance IDs — every item exists once and lives in one location (bag slot or equipment slot).
- Gold is a separate counter, not bag clutter. Vendors trade against it.
- Loot drops at the mob's death point and survives as a ground pile until pickup. Stacked drops show "Item +N more" as a hover label.
- **Drop**: Shift+click an inventory slot to drop the whole stack at your feet. (PR #259)

### Identity + Auth

- Account → many characters (`accounts` ⟶ `players.account_id`).
- Password auth with HMAC-signed bearer tokens (`server/auth/sessionTokens.ts`). 4-segment shape: `accountId.iat.expiry.sig`. Logout bumps `accounts.tokens_valid_after` to invalidate prior tokens.
- Audit events for login / register / character select / suspicious ownership written to `server_events`.

## The Wiki

Press the wiki hotkey in-game to open the **single-source-of-truth wiki**. 15 tabs, all derived from `packages/content/*` — no parallel content registry to drift out of date.

| Tab | What it shows |
|-----|---------------|
| **Skills** | Every active/passive with cost, cast time, cooldown, damage, range, and the `damageElement` flavour |
| **Items** | Weapons, armor, consumables, materials with stats and sold-by / dropped-by / quest-reward / crafted-from |
| **Tree** | Per-class skill progression graph with level gates |
| **Classes** | Class profile + skill tree links |
| **Specs** | Specialization passives at L20 + proficiency at L40, with the modifier they apply |
| **Races** | Base attrs + per-level growth + allowed classes |
| **Effects** | Every status-effect type (damage, dot, burn, stun, etc.) with its stacking policy |
| **Quests** | NPC givers, objectives, rewards |
| **Stats** | Every derived combat stat (pAtk, mAtk, evasion, crit, etc.) with description + tooltip |
| **Mobs** | Per-mob HP/damage/level + zone pins (click a coord chip to drop a map marker) |
| **Bosses** | Mini-boss stats + signature ability mechanics |
| **Recipes** | Crafting inputs / outputs |
| **Sets** | Equipment set bonuses |
| **NPCs** | Quest givers + vendors with zone hints |
| **Vendors** | Vendor stock + buy rates |

A **hanging-content guard** (`tests/contentGraph.spec.ts`) fails CI when an item isn't sold/dropped/crafted/quest-rewarded, when an enemy isn't in any zone spawn, or when a spec references a content id that doesn't exist.

## Project Status

Pre-alpha. Iteration cadence is "merge to main and deploy"; see [ROADMAP.md](ROADMAP.md) for the current active focus, [docs/ARCHITECTURE_DEBT.md](docs/ARCHITECTURE_DEBT.md) for outstanding architecture audits, and [docs/ROADMAP_HISTORY.md](docs/ROADMAP_HISTORY.md) for the long-form rewrite plan that captures the broader arc.

## Development

```bash
pnpm install
cp .env.example .env

# Vite frontend only
pnpm run dev

# game server only
pnpm run dev:server

# frontend + game server
pnpm run dev:all

# local Postgres + frontend + game server
pnpm run dev:db
```

## Checks

```bash
pnpm run check                # full local gate (typecheck + lint + tests + maintainability)
pnpm run build                # vite frontend
pnpm run build:server         # node game server
pnpm test                     # vitest
pnpm run lint                 # eslint --max-warnings=0
```

See [docs/QUALITY_GATES.md](docs/QUALITY_GATES.md) for the full local + CI gate.
See [docs/PERSISTENCE.md](docs/PERSISTENCE.md) for the Postgres/Kysely persistence contract.
See [docs/COLYSEUS_017.md](docs/COLYSEUS_017.md) for the Colyseus runtime package window.
See [AGENTS.md](AGENTS.md) for rules around automated coding agents.

Local secrets and environment-specific values belong in `.env`. Only `.env.example` and `server/.env.example` should be tracked.

## Branch Policy

`main` is the canonical working branch. The previous GitHub `main` is archived as `old_version`; the former `server` branch was moved to `main`. Deployment is VPS-only; the game server and static frontend both ship from the VPS.

## Architecture (at a glance)

```
apps/client/       Vite + React + Three.js (WebGL) browser client
server/            Node + Colyseus authoritative room
packages/protocol/ Zod schemas — single source of truth for the wire
packages/content/  All game data (classes, races, skills, items, mobs, zones)
packages/sim/      Pure simulation primitives (combat math, RNG, inventory)
```

- **Wire**: every client + server message is a Zod `.strict()` schema in `packages/protocol/`; the discriminated union is exhaustively type-checked (`tests/protocolTypeDrift.spec.ts`) so a new message type can't be added without updating both sides.
- **Protocol version**: clients send `clientProtocolVersion`; the server stamps `serverProtocolVersion` on join responses so out-of-date clients can render a useful "refresh the page" prompt instead of failing silently.
- **Privacy**: `PUBLIC_PLAYER_FIELDS` allow-list DTO governs what other players see in the `gameState` / `playerJoined` / `playerUpdated` paths. New `PlayerState` fields default to private.
- **Loop**: server runs a fixed 30 Hz simulation, broadcasts 10 Hz position snapshots, fans out per-event messages (combat log, cast snapshot, loot spawn) immediately.

For the message catalogue and per-message shape, read `packages/protocol/clientMessages.ts` and `serverMessages.ts` — they're the contract.

## VPS Deployment

```bash
RUN_LOCAL_CHECKS=0 scripts/deploy-from-local.sh
```

Builds locally, SSHes to the Hetzner VPS, rebuilds via docker-compose, validates `/healthz` + `/runtimez`. `RUN_LOCAL_CHECKS=0` bypasses a local-only Playwright flake. See [DEPLOYMENT.md](DEPLOYMENT.md) for the full procedure.
