# Architecture Debt Ledger

This file tracks externally-sourced audits + outstanding architecture-shaped debt that doesn't belong on the active roadmap. New audits get appended; entries flip to "shipped" with their PR list when they land.

## 2026-05-22 — Codex audit ("archwork")

Source: external read-only architecture audit captured at `/tmp/archwork.md` on 2026-05-22 (out-of-git scratch file). Pasted in verbatim per owner request so the feedback travels with the audit log.

### Status table (all 8 items shipped 2026-05-22)

Numbering matches the audit's own section ordering below (Enemy lifecycle = #1, CI discipline = #8). The user's working order on 2026-05-22 was different (CI first); see commit history for the chronological landing sequence.

| # | Item | Status | PRs |
|---|---|---|---|
| 1 | Enemy death/respawn lifecycle | ✅ Shipped | #446 (resetEnemyForRespawn), #450 (StatusEffect.sourceCasterId), #451 (DoT kill credit), #452 (unified killPlayer) |
| 2 | Mini-boss typed mechanic union | ✅ Shipped (first slice) | #465 (MiniBossMechanic union; Magmaheart donut). Follow-ups: cone/summonPack/blink for Vorthax/Grakk/Mistwalker. |
| 3 | CommandRejected typed contract | ✅ Shipped | #453 (registry), #455 (reason unions), #456 (typed helper), #457 (legacy rename), #460 (table-driven routing) |
| 4 | Client command sending helper | ✅ Shipped | #461 (sendRejectable + sendFireAndForget + quest verbs gain clientSeq) |
| 5 | Router modularization | ✅ Shipped | #464 (split clientMessageRouter into 9 per-domain modules under server/world/router/) |
| 6 | Fake consumables | ✅ Shipped | #466 (removed 5 placeholder items; loot drops → health_potion; vendor lines stripped) |
| 7 | Roadmap discipline (this split) | ✅ Shipped | this PR — ROADMAP.md / ROADMAP_HISTORY.md / ARCHITECTURE_DEBT.md three-file split |
| 8 | CI main heavy-check discipline | ✅ Shipped | #445 (concurrency split + deploy guard + trace upload), #447 (selectFirstEnemy skips mini-boss), #448 (Fireball combat-log fallback), #459 (Attack hit matcher), #463 (Cast failed fallback) |

### Archive — original audit text

#### Architecture Rework Feedback (2026-05-22 — Codex audit)

Source: external read-only architecture audit captured at
`/tmp/archwork.md` on 2026-05-22 (out-of-git scratch file). Pasted
in verbatim per owner request so the feedback travels with the
roadmap. Item #7 in this section recommends splitting the roadmap
across active / history / architecture-debt files; that
restructure is itself a tracked item below and has not been done
yet — read accordingly.

#### VibeAge Architecture Rework Notes

Source: Codex read-only architecture audit on 2026-05-22.

Repo state while writing: `main` at `28b1b6b` / PRs through `#436`. There were concurrent local edits in `apps/client/src/clientVisualState.ts` and `apps/client/src/gameReducer.ts`; this file is intentionally outside git at `/tmp/archwork.md`.

Use this as an execution checklist. Do one numbered item at a time. A PR that only flips roadmap text is not enough unless the "done means" section for that item is satisfied.

## 1. Rework Enemy Death And Respawn Lifecycle

Priority: P0. This is the most concrete correctness risk.

Current problem:

- `server/combat/targetDeath.ts` is documented and tested as the single death side-effect seam for enemy kills: death state, spatial removal, XP, starter progress, quest progress, and loot.
- Other code paths bypass that seam:
  - `server/combat/dotTicker.ts` directly sets `entity.isAlive = false` when a DoT kills.
  - `server/ai/enemyBehavior.ts` directly mutates player death fields when a normal enemy kills a player.
  - `server/ai/enemyStateMachine.ts` directly mutates player death fields when a boss signature kills a player.
- `server/enemies/enemyLifecycle.ts:respawnDeadEnemies` revives enemies but only resets a subset: `isAlive`, `health`, `position`, `targetId`, and `statusEffects`. It does not clear `deathTimeTs`, `aiState`, velocity, patrol/chase fields, or mini-boss enrage/phase/signature fields.

Why it matters:

- DoT kills can miss XP, loot, quest credit, starter progress, and spatial cleanup.
- Bosses can respawn carrying old combat state: enraged, phase-shifted, mid-signature, stale cooldowns, stale target/chase/patrol fields.
- Multiple death implementations make future mechanics unsafe; every new damage source must remember all side effects.

Sub-work:

1. Define one server-owned lifecycle API, probably near `server/combat/death.ts` or `server/entities/lifecycle.ts`.
   - `killEnemy({ enemy, killer, state, spatial, outbound, now, cause })`
   - `killPlayer({ player, killerEnemy, outbound, now, cause })`
   - Keep rewards and loot only in enemy kill with live player killer.
2. Add ownership for delayed damage.
   - Status effects need enough source metadata to credit DoT kills.
   - Today `StatusEffect` has `sourceSkill` only. Add `sourceCasterId` or a server-only owner field if kill credit matters.
3. Replace direct death mutations.
   - `impactResolver` should call the lifecycle API.
   - `dotTicker` should call it when a DoT kills.
   - `enemyBehavior` and boss signature impact should call the player-death branch.
4. Rework enemy respawn into an explicit full reset.
   - Clear `deathTimeTs`.
   - Set `aiState = 'idle'`, `targetId = null`, velocity zero.
   - Clear `chaseStartedAt`, `aggroSuppressedUntilTs`, `patrolTarget`, `patrolWaitUntilTs`.
   - Clear mini-boss `combatStartedTs`, `enraged`, `phaseShifted`, `signatureCastingUntilTs`, `signatureCastTargetX/Z`, `signatureCastRadius`, `nextSignatureReadyTs`.
   - Restore `attackDamage` and `movementSpeed` from base values.
5. Tests to add:
   - DoT enemy kill awards XP/quest/loot once.
   - DoT enemy kill removes spatial membership.
   - Enemy respawn clears `deathTimeTs`.
   - Mini-boss respawn resets enrage, phase, signature, movement speed, attack damage.
   - Player death from normal attack and boss signature goes through one helper and emits the same update shape.

Done means:

- There is one death API for state mutation and side effects.
- A repo search for `isAlive = false` only finds the lifecycle helper and intentional test setup.
- A mini-boss killed mid-enrage or mid-signature respawns cleanly.

## 2. Rework Mini-Boss Mechanics So Content And Engine Match

Priority: P0/P1. Current data promises richer fights than the engine executes.

Current problem:

- `packages/content/miniBosses.ts` describes distinct mechanics:
  - Grakk: calls nearby allies.
  - Greyfang: hamstring / movement cut.
  - Hammerback: stagger / knockback.
  - Mistwalker: phase / reposition.
  - Vereth: drain + heal allies.
  - Vorthax: cone + burning field.
  - Prism Warden: reflect.
  - Magmaheart: ring pulse.
  - Skadrun: blizzard slow.
  - Vinebrook: root.
- The engine currently interprets all of them as the same telegraphed circular AOE damage with different numbers.

Why it matters:

- Wiki text, itemization, quests, and player expectations drift from actual gameplay.
- Tests can pass while the product is fake: they assert the generic ring, not the authored mechanic.
- Adding rich modules too early could hide the drift under ad hoc custom code.

Sub-work:

1. Add a typed mechanic union to content, for example:
   - `aoeDamage`
   - `coneDamage`
   - `dotField`
   - `slowArea`
   - `rootArea`
   - `knockbackArea`
   - `summonOrCallPack`
   - `lifeDrain`
   - `reflectNextSpell`
   - `blinkBehindTarget`
2. Keep numeric tuning in content.
   - Wind-up, cooldown, radius/angle, duration, damage multiplier, status effect type/value, target rules.
3. Build a small mechanic interpreter in the AI/combat layer.
   - The state machine schedules and telegraphs.
   - The mechanic interpreter resolves impact.
   - Do not add one-off branches inside the state machine per boss.
4. Update Wiki Bosses to render mechanic data, not just prose.
5. Convert existing bosses gradually.
   - First convert Grakk into an actual pack call or explicitly rewrite the lore to "AOE howl".
   - Then convert one status mechanic (slow/root) and one shape mechanic (cone/ring) before touching all bosses.
6. Tests to add:
   - Each mechanic kind has at least one engine test.
   - Every `MINI_BOSSES` entry has a mechanic kind supported by the interpreter.
   - Wiki rendering cannot access missing mechanic fields.

Done means:

- Reading a boss's content tells you what the engine actually does.
- Generic AOE remains one mechanic kind, not the hidden implementation for every boss.
- Rich modules are not needed until a mechanic cannot be represented by the typed union.

## 3. Tighten CommandRejected Into A Typed Contract

Priority: P1. The migration worked behaviorally, but the architecture is too permissive.

Current problem:

- `CommandRejected` uses `commandType: string` and `reason: string`.
- A protocol test explicitly asserts arbitrary reason strings are accepted.
- Server helpers take loose strings, and client routing/copy is based on scattered string checks.
- Legacy names still exist in code and tests: `CastFailReason`, `emitCastFail`, `LearnSkillFailedReason`, `sendLearnSkillFailed`, `applyCastFailFromCommandRejected`, `applyEquipFailedFromCommandRejected`.

Why it matters:

- A typo in a rejection reason becomes a runtime UX fallback, not a compile error.
- Server and client can drift silently.
- Metrics labels become unbounded strings.
- Future agents may "fix" a local failure by adding another string instead of updating the contract.

Sub-work:

1. Add `packages/protocol/commandRejections.ts`.
   - Export `REJECTABLE_COMMANDS`.
   - Export per-command reason unions.
   - Export target metadata rules, e.g. `LearnSkill` requires `targetId = skillId`.
2. Make `CommandRejected.commandType` a union of rejectable command types.
3. Make `reason` typed by `commandType`.
   - If Zod cannot express the full relationship ergonomically, use a discriminated union generated from the registry.
4. Type `sendCommandRejected`.
   - `sendCommandRejected<'LearnSkill'>(..., 'wrongClass', ..., skillId)`
   - Reject invalid reason/target combos at compile time.
5. Replace legacy helper names.
   - Rename cast helper to `sendCastRejected`.
   - Rename learn helper to `sendLearnSkillRejected`.
   - Rename client visual helpers away from `CastFail` / `EquipFailed`.
6. Make client routing table-driven.
   - Map command type to UI sink: combat log, skill chip, chat inline error, etc.
7. Tests to add:
   - Protocol rejects unknown command types.
   - Protocol rejects unknown reason for a known command.
   - Every rejectable command has a client route or explicit silent policy.
   - Metrics labels come only from the registry.

Done means:

- Adding a new rejectable command requires updating one registry.
- Server emit, protocol schema, client UI, and tests derive from that registry.
- Legacy `*Fail*` names are gone except in migration history docs.

## 4. Centralize Client Command Sending And clientSeq Stamping

Priority: P1. This is a drift-prevention refactor.

Current problem:

- `apps/client/src/clientActions.ts` manually calls `nextClientSeq()` at each send site.
- Some user actions carry `clientSeq`; some do not; the distinction is implicit.
- Direct `room.send(SESSION_EVENTS.message, {...})` is repeated across the file.

Why it matters:

- New user-visible commands can forget `clientSeq`, causing rejected actions to lose request correlation.
- The action layer becomes noisy and easy to patch incorrectly.
- Tests have to count individual send sites rather than verify one sending policy.

Sub-work:

1. Add a small command sender module, e.g. `apps/client/src/sendGameCommand.ts`.
2. Define command categories:
   - `fireAndForget`: movement, high-frequency or intentionally silent commands.
   - `rejectable`: inventory, vendor, skill, chat, quest, GM, class/race, equip.
3. The rejectable sender stamps `clientSeq` automatically.
4. The sender should own `SESSION_EVENTS.message`.
5. It should safely no-op when `room` is missing.
6. Consider a dev/test assertion that rejectable command objects cannot include an existing `clientSeq`.
7. Replace direct sends incrementally.
   - First inventory/vendor/skill/chat.
   - Then quest.
   - Leave movement last because it has `clientTs` and high-frequency behavior.
8. Tests to add:
   - Every rejectable command increments sequence exactly once.
   - Fire-and-forget commands do not stamp `clientSeq`.
   - Chat trimming still happens before send.
   - Movement still stamps `clientTs`.

Done means:

- New rejectable commands cannot be sent without the wrapper.
- `nextClientSeq()` is imported only by the sender and tests.
- `clientActions.ts` reads as gameplay intent, not protocol plumbing.

## 5. Shrink clientMessageRouter Into Real Command Modules

Priority: P1. This is the place sloppy fixes will accumulate.

Current problem:

- `server/world/clientMessageRouter.ts` is 676 lines.
- It handles dispatch, rate limits, metrics, player lookup, socket ownership, rejection messages, and command-specific policy.
- Several handlers repeat the same `findPlayerIdBySocket` / `state.players[playerId]` / reject pattern.
- It is transport glue, but it already contains gameplay-adjacent decisions.

Why it matters:

- AGENTS.md says to keep gameplay out of transport glue.
- Large routers invite tactical patches.
- Cross-cutting policies like ownership, rate limits, and rejection behavior are harder to prove.

Sub-work:

1. Create a `CommandContext`.
   - `socket`, `state`, `direct`, `outbound`, `spatial`, `now`.
2. Add shared wrappers:
   - `withPlayer(ctx, commandType, clientSeq, handler)`
   - `withOwnedPlayerId(ctx, msg.id, commandType, clientSeq, handler)` for commands carrying player ids.
3. Move command families to modules:
   - `server/commands/chatCommand.ts`
   - `server/commands/questCommands.ts`
   - `server/commands/vendorCommands.ts`
   - `server/commands/identityCommands.ts`
   - `server/commands/inventoryCommands.ts` or keep current inventory modules but route through wrappers.
4. Move rate-limit feedback policy out of the router into protocol/command metadata.
5. Leave router as a dispatch table:
   - parse/receive message
   - build context
   - apply rate limit
   - call handler
6. Preserve `createWorldCombatBridge`, or move it to a combat/world bridge module if the router no longer owns combat.
7. Tests to add:
   - Unknown socket rejection behavior is consistent across command families.
   - Invalid ownership counters still fire for id-carrying commands.
   - Rate-limited commands with feedback emit `CommandRejected`.
   - Movement/cast/loot high-frequency drops stay silent where intended.

Done means:

- Router is small enough to audit in one screen.
- No new gameplay rules land in `server/world/clientMessageRouter.ts`.
- Command modules own their own domain decisions.

## 6. Fix Fake Consumables And Item Runtime Semantics

Priority: P1/P2. This is product honesty plus content hygiene.

Current problem:

- Several items read as potions/elixirs but are typed as `material` because their effects are not implemented:
  - `elixir_of_strength`
  - `fire_resistance_potion`
  - `ice_resistance_potion`
  - `ethereal_elixir`
  - `temporal_draught`
- Some are sold by vendors or dropped by loot tables.
- `docs/UNLINKED.md` lists them as real items with sources but no use.
- `isUsableConsumable` only recognizes health/mana restore.

Why it matters:

- The world sells or drops items that sound usable but cannot be used.
- Wiki/catalog can make fake promises.
- Future agents may keep adding item flavor without engine semantics.

Sub-work:

1. Decide policy per item:
   - Implement now.
   - Remove from vendors/loot until supported.
   - Rename/retype as true crafting material.
2. Add item effect specs if implementing:
   - `restoreHealth`
   - `restoreMana`
   - `applyStatusEffect`
   - `teleportToVillage`
   - `grantXp`
   - `cooldown`
3. Reuse status-effect infrastructure where possible.
   - Strength elixir could apply `bless`/damage contribution.
   - Resistance potions need elemental mitigation support first; do not fake immunity.
   - Temporal draught needs haste/runSpeed/castSpeed policy.
4. Update item use runtime to interpret item effects, not just `healAmount`/`manaAmount`.
5. Update client item tooltip and Use affordance to reflect real usability.
6. Update vendors/loot tables after semantics are real.
7. Tests to add:
   - Each sold consumable can be used or is intentionally non-usable with honest copy.
   - `content:audit:check` has no flavor consumable leftovers unless explicitly whitelisted with expiry.
   - Item use emits `ItemUsed`, `PlayerUpdated`, and `EffectSnapshot` as appropriate.

Done means:

- No vendor sells "effect not yet implemented" items.
- `docs/UNLINKED.md` no longer lists those five items, or it explains a deliberate deferred material role.
- Item runtime has a typed effect model.

## 7. Rework Roadmap So Agents Stop Reopening Solved Work

Priority: P1. This is process architecture, not just docs.

Current problem:

- `ROADMAP.md` contains active sections, historical appendices, pasted old plans, and stale immediate actions in one file.
- Some sections say `CommandRejected`, owner DTOs, inventory projection, overflow, histograms, and combat-log work are incomplete; nearby sections say they are closed.
- The bottom `Immediate Next Action` still points at tasks that have already shipped or changed shape.

Why it matters:

- Agents use the roadmap as task authority.
- Stale docs cause docs-only PRs, duplicate work, and weak "flip checkbox" changes.
- It makes architecture review harder because old facts are mixed with current state.

Sub-work:

1. Split the roadmap into layers:
   - `ROADMAP.md`: short active status only.
   - `docs/ROADMAP_HISTORY.md`: old sections, preserved but non-authoritative.
   - `docs/ARCHITECTURE_DEBT.md`: current rework queue with source refs.
2. Add a header rule:
   - "Only the Active Queue section is executable. Historical sections are evidence, not queue."
3. Delete or rewrite the bottom `Immediate Next Action`.
4. Add a "last audited against commit" line.
5. For every checkbox, require one of:
   - source file/test reference,
   - explicit deferred decision owner,
   - deletion as stale.
6. Consider a script to detect stale phrases:
   - "CastFail remains"
   - "syncLegacyInventory"
   - "OwnerPlayerSnapshot not finished"
   - "backup CI not scheduled" if now present
7. PR discipline:
   - Roadmap flip PRs should be paired with source/test proof.
   - Docs-only flips are okay only when they correct stale tracking and cite the shipped PR/test.

Done means:

- A new agent can read the first 200 lines and know the current queue.
- Historical text cannot be mistaken for active tasks.
- "Immediate Next Action" does not contradict current source.

## 8. Fix CI / Merge Discipline For main

Priority: P1. Main deploys to production, so this is architectural safety.

Current problem:

- `.github/workflows/ci.yml` has branch-level concurrency with `cancel-in-progress: true`.
- Rapid merges to `main` repeatedly cancel post-merge heavy checks.
- PR checks are fast; heavy checks run only after merge, but those heavy runs can be cancelled by the next merge.

Why it matters:

- `main` can receive many commits without a completed heavy check.
- Since `main` deploys to the VPS, this weakens the "main is deployable" assumption.
- A broken Docker build, browser smoke, dead-code gate, or baseline check may be hidden until merges stop.

Sub-work:

1. Change concurrency policy.
   - For PR refs: cancel in progress is fine.
   - For `main`: do not cancel post-merge heavy checks, or use a separate group that queues.
2. Split workflows if needed:
   - `pr-fast.yml`: cancelable.
   - `main-heavy.yml`: non-cancelable on push to main.
3. Add deploy guard.
   - `pnpm run deploy:production` or the deploy script should verify latest `main` heavy CI succeeded for the deployed SHA, or require local `pnpm run check`.
4. Add branch/agent discipline:
   - Do not merge a train of docs/test PRs faster than main checks can establish a clean latest SHA.
   - If using auto-merge, require latest PR fast checks and avoid merging while main heavy is already failing.
5. Preserve velocity:
   - Heavy checks do not need to block every PR if that is too slow.
   - But the latest main SHA must become green before deploy.
6. Tests/checks to add:
   - Existing `ciCheckParity.spec.ts` should keep checking `pnpm run check` parity.
   - Add a lightweight script that reports latest main CI status before deploy.

Done means:

- A newer main push does not erase evidence from the previous heavy check without leaving at least one completed latest-main run.
- Deploy process can answer: "Which SHA was checked, and did it pass?"
- Agents stop treating cancelled main runs as harmless background noise.

## Suggested Execution Order

1. Enemy death/respawn lifecycle.
2. CommandRejected typed contract.
3. Client command sending helper.
4. Router modularization.
5. Mini-boss mechanics.
6. Fake consumables/item effects.
7. Roadmap split/stale cleanup.
8. CI main heavy-check discipline.

Reasoning: first fix correctness bugs and contract drift, then reduce places where future patches accumulate, then align content/product semantics, then clean process documents and CI.
