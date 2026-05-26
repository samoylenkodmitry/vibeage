# Skill / Stat Engine Support Roadmap

Goal: every authored skill and stat does, in the engine, exactly what its
description says — "to full extent." This doc audits the current catalog
(`packages/content/skills.ts`, `specSkillsData.ts`, `classPassives.ts`,
`stats.ts`) against the engine and tracks closing each gap.

Status legend: ✅ done · 🟡 in progress · ⬜ planned · 🔎 needs design call

Recently closed (context for this push): accuracy & evasion now affect hit
chance (#682); shield/mitigation/evasion apply to mob & boss damage, not just
PvP (#681); shield is absorb-only + shown on the HP bar (#684).

---

## A. Dead derived stats — computed, shown, scaled by gear, but read by no combat code

| # | Stat | Claim (stats.ts) | Reality | Plan | Status |
|---|------|------------------|---------|------|--------|
| A1 | **pDef** | "Reduces incoming physical damage." | No damage path subtracts it. | Mitigation curve in the damage pipeline keyed on attacker `kind: 'physical'`. Data-driven constant in stats.ts; wiki shows the formula. | ⬜ |
| A2 | **mDef** | "Reduces incoming magical damage." | Same — never applied. | Same curve for `kind: 'magical'`. | ⬜ |
| A3 | **attackSpeed** | "Swings per minute multiplier… faster auto-attack cadence." | Only stored/displayed; no cooldown reads it. | Scale auto-attack (`autoRepeat`) cooldown by attackSpeed. Unblocks Rapid Fire (B6). | ⬜ |
| A4 | **castSpeed** | "Cast-rate multiplier (higher = faster)." | `skillSystem` sets `castTimeMs = skill.castMs` flat. | Divide effective cast time by castSpeed (floor 1.0, already capped 2.5). | ⬜ |

## B. Skill description ↔ behavior mismatches — skill does the wrong thing (or nothing) vs its text

| # | Skill | Says | Does | Plan | Status |
|---|-------|------|------|------|--------|
| B5 | **bless** | "Boost your damage **and hit chance**." | Only `dmgMult` (+25%). | Add an accuracy contribution from `bless` (now that accuracy is live, A-block of #682). | ⬜ |
| B6 | **rapidFire** | "Increase your **attack speed**." | Emits `bless` (a +40% *damage* buff). | New `attackSpeed` buff effect, wired to A3. | ⬜ |
| B7 | **wind_dash** | "Burst of **speed** that **breaks pursuit**." | Emits `evasion` (dodge). | `speed_boost` + `aggroReset`. | ⬜ |
| B8 | **treasure_sense** | "Reveals loot drops at a glance." | Emits `evasion 15` (unrelated). | Loot-highlight effect (client reveal) or repurpose. | 🔎 |
| B9 | **execute** | "Finishing blow against a **wounded** target." | Flat damage, no low-HP scaling. | Execute bonus: damage scales up as target HP% drops. | ⬜ |
| B10 | **lucky_strike** | "Chance to **crit big**." | Flat damage, no crit interaction. | Bonus crit chance / crit mult on this cast. | ⬜ |
| B11 | **soul_eater** | "**Drain life** from your target." | Flat damage, no lifesteal. | `lifesteal` on the cast (heal caster for a % of damage dealt). | ⬜ |
| B12 | **shadow_strike / shadow_arrow** | "Bypasses / ignores **defenses**." | Flat damage. | Armor-penetration flag that reduces target pDef/mDef in the A1/A2 curve. (Depends on A1/A2.) | ⬜ |
| B13 | **rebirth** | "nearly **invulnerable**." | `shield 800` only. | Acceptable as a big shield; consider a brief `invuln`. Low priority. | 🔎 |

## C. Area / aura targeting gaps

| # | Skill(s) | Issue | Plan | Status |
|---|----------|-------|------|--------|
| C14 | **sacred_pulse, mass_heal, sacred_aura, group_bless** | Beneficial auras run `getTargetsInArea`, which **excludes the caster and includes enemies** → they heal/buff nearby *enemies* and never the caster. | Beneficial area effects target self + allied players in radius, never enemies. | ⬜ |
| C15 | **inferno_aura, divine_taunt, meteor** | Harmful auras center on `cast.pos` and exclude the caster — fine *if* the client sends caster position; verify self-centered auras actually sweep nearby enemies. | Audit + test the self-cast aura center. | ⬜ |
| C16 | **silent_step** | "Repositioning" invisibility but no `aggroReset`, so current chasers keep chasing. | Decide whether it should drop threat (vanish does). | 🔎 |

## D. Effect-type coverage / minor

| # | Item | Note | Status |
|---|------|------|--------|
| D17 | `speed_boost` effect | Wired in `statContributions` (runSpeed mul) + enemy movement, but **no skill emits it**. wind_dash (B7) will be the first. | ⬜ |
| D18 | `iceBolt` poison `value: 0.5` | Tick does `Math.max(0, value)` = 0.5 flat dmg/tick (negligible). Comment claims "0.5% damage". Reconcile value vs intent. | ⬜ |
| D19 | New effect types needed | `lifesteal` (B11), `attackSpeed` buff (B6), execute-scaling (B9 — may be a skill flag, not an effect), armor-pen (B12 — skill flag). Add to `SkillEffectType` + `EFFECT_SPECS` + skillSpecAudit as each lands. | ⬜ |

---

## Execution order (highest impact first)

1. **A1+A2 pDef/mDef mitigation** — affects *all* combat; unblocks B12.
2. **A4 castSpeed**, **A3 attackSpeed** — unblocks B6.
3. **C14 beneficial-aura targeting** — current behavior actively wrong (healing enemies).
4. **B5 bless accuracy**, **B6 rapidFire**, **B7 wind_dash**, **D17 speed_boost**.
5. **B9 execute**, **B10 lucky_strike**, **B11 soul_eater**, **B12 armor-pen**.
6. **C15 aura audit**, **D18 iceBolt poison**, then design calls (B8, B13, C16).

Each item ships as its own PR with tests; this file is updated as items close.
All tuning numbers live in content data (per the project's data-driven rule),
not hardcoded in engine logic.
