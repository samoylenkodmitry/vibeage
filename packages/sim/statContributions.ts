/**
 * PR NN — Stat unification: every input to a player's stats is a
 * Contribution. Race base attributes, level growth, class passives,
 * equipment, status effects (buffs/debuffs), and specialization
 * passives are all built into one list. `computeAllStats` walks it
 * through a 4-phase pipeline and returns the totals plus the
 * per-stat breakdown the HUD popup renders.
 *
 * Engine and HUD both call this — no separate stat formula lives
 * anywhere else in the codebase.
 */
import type { CharacterClass } from '../content/classes.js';
import { PASSIVE_SKILL_CONTRIBUTIONS } from '../content/classPassives.js';
import type { SkillId } from '../content/skills.js';
import { activeSetBonuses } from '../content/equipmentSets.js';
import { type EquipSlot, EQUIP_SLOTS } from '../content/equipmentTypes.js';
import { ITEMS, type Item } from '../content/items.js';
import { DEFAULT_RACE, RACE_PROFILES, type CharacterRace } from '../content/races.js';
import { getSpecializationById, PROFICIENCY_LEVEL, SPECIALIZATION_UNLOCK_LEVEL } from '../content/specializations.js';
import type { CharacterInventory } from './characterInventory.js';
import type { StatusEffect } from '../protocol/messages.js';

// ---------------------------------------------------------------- types

/** Stats the engine reads. Keep in sync with packages/content/stats.ts. */
export type StatId =
  | 'str' | 'dex' | 'con' | 'int' | 'wit' | 'men'
  | 'pAtk' | 'mAtk' | 'pDef' | 'mDef'
  | 'maxHealth' | 'maxMana'
  | 'hpRegen' | 'mpRegen'
  | 'accuracy' | 'evasion'
  | 'attackSpeed' | 'castSpeed' | 'runSpeed'
  | 'dmgMult' | 'critChance' | 'critMult';

/**
 * 4-phase pipeline:
 *   final = ((base + Σ addPre) × Π mul) + Σ addPost
 *
 * `base` sets the starting value (default 0 if no `base` contribution
 * exists for the stat). Multiple `base` contributions sum — useful
 * for stats whose default starting value is constant + race-specific.
 */
export type ContributionOp = 'base' | 'addPre' | 'mul' | 'addPost';

export type ResolvedStats = Readonly<Partial<Record<StatId, number>>>;

export type Contribution = {
  /** Stable identifier (`race:orc`, `level:8`, `item:worn_sword:abc`, ...). */
  source: string;
  /** Player-facing label rendered in the breakdown popup. */
  label: string;
  stat: StatId;
  op: ContributionOp;
  /** Numeric contribution, or a function that derives it from already-resolved stats. */
  value: number | ((resolved: ResolvedStats) => number);
  /**
   * When provided and returns false, the contribution is excluded
   * from the sum but still emitted on `parts` so the popup can
   * show why a buff/passive isn't currently helping.
   */
  predicate?: (ctx: StatComputeContext) => boolean;
};

/**
 * What the breakdown popup actually renders: every contribution
 * paired with its *evaluated* numeric value (function-valued
 * contributions already resolved against the final attribute map
 * during `resolveStat`). Inactive predicate-failed contributions
 * emit `inactive: true` so the popup can grey them out.
 */
export type ResolvedContribution = {
  source: string;
  label: string;
  stat: StatId;
  op: ContributionOp;
  value: number;
  inactive?: boolean;
};

export type StatComputeContext = {
  level: number;
  race: CharacterRace;
  className: CharacterClass;
  health: number;
  maxHealth: number;
  /** Fraction 0..1. Cached so predicates can read it without dividing each time. */
  hpFraction: number;
  resolved: ResolvedStats;
};

export type StatBreakdownEntry = {
  total: number;
  parts: readonly ResolvedContribution[];
};

export type StatComputationResult = {
  totals: Record<StatId, number>;
  breakdown: Record<StatId, StatBreakdownEntry>;
};

// ---------------------------------------------------------------- player view

/**
 * The subset of PlayerState the stat compute needs. Kept narrow so
 * tests can pass a plain object and so client + server can share the
 * compute without dragging the full PlayerState type around.
 */
export type StatPlayerView = {
  level: number;
  race?: CharacterRace;
  className: CharacterClass;
  /**
   * PR PP — passive class skills (auto-granted + learnable) live
   * inside this list along with active skills. The Contribution
   * registry walks it to apply class HP/MP/damage/speed deltas.
   */
  unlockedSkills?: readonly SkillId[];
  specializationId?: string | null;
  /**
   * Server uses this — it carries instance ids that resolve to
   * templates inside `pushEquipmentContributions`.
   */
  characterInventory?: CharacterInventory | null;
  /**
   * Client uses this — `state.equipment` already keys equipped slot
   * → template id, so the popup re-derives the same contributions
   * the server produced for stat numbers without needing the full
   * CharacterInventory aggregate (owner-only on the wire).
   */
  equippedTemplates?: Partial<Record<EquipSlot, string>>;
  statusEffects?: ReadonlyArray<StatusEffect>;
  /** Optional — used for predicates like Rage's HP<30%. Defaults to full HP. */
  health?: number;
};

// ---------------------------------------------------------------- public api

/**
 * Walk every contributing source and return one flat list. Pure
 * function over the player view; no engine state mutation.
 */
export function buildContributions(player: StatPlayerView): Contribution[] {
  const race = player.race ?? DEFAULT_RACE;
  const className = player.className;
  const level = Math.max(1, Math.floor(player.level));
  const out: Contribution[] = [];
  pushRaceContributions(out, race);
  pushLevelContributions(out, race, level);
  pushPassiveSkillContributions(out, player.unlockedSkills);
  pushSpecializationContributions(out, player.specializationId, level);
  pushBaselineDerivedContributions(out);
  pushAttributeDerivedContributions(out, className);
  if (player.characterInventory) pushEquipmentContributions(out, player.characterInventory, className);
  else if (player.equippedTemplates) pushEquipmentContributionsFromTemplateMap(out, player.equippedTemplates, className);
  if (player.statusEffects) pushStatusEffectContributions(out, player.statusEffects);
  return out;
}

/**
 * Resolve every stat into `{total, parts}` from a contributions list.
 * Stats are processed in `STAT_ORDER` so derived stats can read
 * already-resolved attribute values via function-valued contributions.
 */
export function computeAllStats(
  contributions: readonly Contribution[],
  ctx: Omit<StatComputeContext, 'resolved' | 'hpFraction'> & { hpFraction?: number },
): StatComputationResult {
  const totals = {} as Record<StatId, number>;
  const breakdown = {} as Record<StatId, StatBreakdownEntry>;
  const fullCtx: StatComputeContext = {
    ...ctx,
    hpFraction: ctx.hpFraction ?? 1,
    resolved: totals,
  };
  for (const stat of STAT_ORDER) {
    const matched = contributions.filter((c) => c.stat === stat);
    const entry = resolveStat(stat, matched, fullCtx);
    totals[stat] = entry.total;
    breakdown[stat] = entry;
  }
  return { totals, breakdown };
}

/**
 * Convenience: derives the context from the player view and returns
 * the totals + breakdown in one call. Cached via the player's
 * `_statsCacheKey` (managed in playerStatsCache.ts) — engine uses
 * `getOrComputeStats`, the HUD popup calls this when no cache is
 * available on the client side.
 */
export function computeStatsForPlayer(player: StatPlayerView): StatComputationResult {
  const contributions = buildContributions(player);
  const maxHealth = 1; // placeholder; predicates that need HP fraction get refined below
  const ctx = {
    level: Math.max(1, Math.floor(player.level)),
    race: player.race ?? DEFAULT_RACE,
    className: player.className,
    health: player.health ?? maxHealth,
    maxHealth,
    hpFraction: 1,
  };
  return computeAllStats(contributions, ctx);
}

// ---------------------------------------------------------------- pipeline

/** Resolution order — attributes first, then derived stats that read them. */
const STAT_ORDER: readonly StatId[] = [
  'str', 'dex', 'con', 'int', 'wit', 'men',
  'dmgMult', 'critChance', 'critMult',
  'pAtk', 'mAtk', 'pDef', 'mDef',
  'maxHealth', 'maxMana',
  'hpRegen', 'mpRegen',
  'accuracy', 'evasion',
  'attackSpeed', 'castSpeed', 'runSpeed',
];

const STAT_CAPS: Partial<Record<StatId, (n: number) => number>> = {
  // PR QQ — cast speed convention flipped: higher = faster (so a
  // ×1.15 row reads as "+15% faster"). Floor at 1 so a cursed item
  // can't make casting slower than baseline.
  castSpeed: (n) => Math.max(1, Math.min(2.5, n)),
  runSpeed: (n) => Math.max(2, n),
  hpRegen: (n) => Math.max(1, n),
  mpRegen: (n) => Math.max(1, n),
};

function resolveStat(stat: StatId, parts: Contribution[], ctx: StatComputeContext): StatBreakdownEntry {
  let base = 0;
  let addPre = 0;
  let mul = 1;
  let addPost = 0;
  const resolved: ResolvedContribution[] = [];
  for (const c of parts) {
    const inactive = !!c.predicate && !c.predicate(ctx);
    const raw = typeof c.value === 'function' ? c.value(ctx.resolved) : c.value;
    const v = Number.isFinite(raw) ? raw : 0;
    // PR PP — emit the resolved numeric value on the breakdown row
    // so the popup never has to re-evaluate function contributions.
    resolved.push({ source: c.source, label: c.label, stat: c.stat, op: c.op, value: v, ...(inactive ? { inactive: true } : {}) });
    if (inactive) continue;
    switch (c.op) {
      case 'base': base += v; break;
      case 'addPre': addPre += v; break;
      case 'mul': mul *= v; break;
      case 'addPost': addPost += v; break;
    }
  }
  let total = (base + addPre) * mul + addPost;
  const cap = STAT_CAPS[stat];
  if (cap) total = cap(total);
  // Most stats are integers; the few that aren't (critChance, castSpeed,
  // dmgMult, critMult) need fractional precision.
  if (!FRACTIONAL_STATS.has(stat)) total = Math.round(total);
  else total = Math.round(total * 100) / 100;
  return { total, parts: resolved };
}

const FRACTIONAL_STATS: ReadonlySet<StatId> = new Set<StatId>([
  'dmgMult', 'critChance', 'critMult', 'castSpeed',
]);

// ---------------------------------------------------------------- registries

function pushRaceContributions(out: Contribution[], race: CharacterRace): void {
  // PR QQ — label every race row with the attribute it touches so
  // the breakdown popup reads "Dark Elf base STR | 13" rather than a
  // single ambiguous "Dark Elf race" row that looks like a class
  // multiplier. Race contributes only attributes — never a single
  // unattributed row.
  const profile = RACE_PROFILES[race] ?? RACE_PROFILES[DEFAULT_RACE];
  for (const [k, v] of Object.entries(profile.baseAttrs)) {
    out.push({
      source: `race:${race}:${k}`,
      label: `${profile.name} base ${k.toUpperCase()}`,
      stat: k as StatId,
      op: 'base',
      value: v,
    });
  }
}

function pushLevelContributions(out: Contribution[], race: CharacterRace, level: number): void {
  const profile = RACE_PROFILES[race] ?? RACE_PROFILES[DEFAULT_RACE];
  const delta = level - 1;
  const label = `Level ${level} (×${delta} growth)`;
  if (delta > 0) {
    for (const [k, v] of Object.entries(profile.growthPerLevel)) {
      out.push({ source: `level:${level}:growth`, label, stat: k as StatId, op: 'addPre', value: Math.floor(v * delta) });
    }
  }
  // Combat baselines that grow with level — preserve the existing
  // `BASE + level*K` math from derivePlayerStats.
  out.push({ source: `level:${level}:pAtk`, label: `Level ${level} (+${level * 2} P.Atk)`, stat: 'pAtk', op: 'addPre', value: level * 2 });
  out.push({ source: `level:${level}:mAtk`, label: `Level ${level} (+${level * 2} M.Atk)`, stat: 'mAtk', op: 'addPre', value: level * 2 });
  out.push({ source: `level:${level}:pDef`, label: `Level ${level} (+${level * 1.5} P.Def)`, stat: 'pDef', op: 'addPre', value: level * 1.5 });
  out.push({ source: `level:${level}:mDef`, label: `Level ${level} (+${level * 1.4} M.Def)`, stat: 'mDef', op: 'addPre', value: level * 1.4 });
  out.push({ source: `level:${level}:maxHealth`, label: `Level ${level} (+${level * 14} HP)`, stat: 'maxHealth', op: 'addPre', value: level * 14 });
  out.push({ source: `level:${level}:maxMana`, label: `Level ${level} (+${level * 6} MP)`, stat: 'maxMana', op: 'addPre', value: level * 6 });
  out.push({ source: `level:${level}:hpRegen`, label: `Level ${level} (+${level * 0.4} HP/s)`, stat: 'hpRegen', op: 'addPre', value: level * 0.4 });
  out.push({ source: `level:${level}:mpRegen`, label: `Level ${level} (+${level * 0.5} MP/s)`, stat: 'mpRegen', op: 'addPre', value: level * 0.5 });
  out.push({ source: `level:${level}:accuracy`, label: `Level ${level} accuracy`, stat: 'accuracy', op: 'addPre', value: level * 0.6 });
  out.push({ source: `level:${level}:evasion`, label: `Level ${level} evasion`, stat: 'evasion', op: 'addPre', value: level * 0.3 });
}

function pushBaselineDerivedContributions(out: Contribution[]): void {
  // The L2-style constants — these are the "starting value" of each
  // derived stat before attribute / equipment / buff scaling.
  out.push({ source: 'baseline:pAtk', label: 'Baseline P.Atk', stat: 'pAtk', op: 'base', value: 6 });
  out.push({ source: 'baseline:mAtk', label: 'Baseline M.Atk', stat: 'mAtk', op: 'base', value: 6 });
  out.push({ source: 'baseline:pDef', label: 'Baseline P.Def', stat: 'pDef', op: 'base', value: 6 });
  out.push({ source: 'baseline:mDef', label: 'Baseline M.Def', stat: 'mDef', op: 'base', value: 6 });
  out.push({ source: 'baseline:maxHealth', label: 'Baseline HP', stat: 'maxHealth', op: 'base', value: 100 });
  out.push({ source: 'baseline:maxMana', label: 'Baseline MP', stat: 'maxMana', op: 'base', value: 100 });
  out.push({ source: 'baseline:accuracy', label: 'Baseline accuracy', stat: 'accuracy', op: 'base', value: 90 });
  out.push({ source: 'baseline:evasion', label: 'Baseline evasion', stat: 'evasion', op: 'base', value: 5 });
  out.push({ source: 'baseline:attackSpeed', label: 'Baseline attack speed', stat: 'attackSpeed', op: 'base', value: 300 });
  out.push({ source: 'baseline:castSpeed', label: 'Baseline cast speed', stat: 'castSpeed', op: 'base', value: 1 });
  out.push({ source: 'baseline:runSpeed', label: 'Baseline run speed', stat: 'runSpeed', op: 'base', value: 7 });
  out.push({ source: 'baseline:dmgMult', label: 'Baseline damage', stat: 'dmgMult', op: 'base', value: 1 });
  out.push({ source: 'baseline:critMult', label: 'Baseline crit damage', stat: 'critMult', op: 'base', value: 1.6 });
}

const MAGIC_CLASSES: ReadonlySet<CharacterClass> = new Set<CharacterClass>(['mage', 'healer', 'paladin']);

function pushAttributeDerivedContributions(out: Contribution[], className: CharacterClass): void {
  // Attribute-driven flats. Values are functions over `resolved` so
  // each contribution reads its final attribute value (already
  // computed in this round because STAT_ORDER puts attrs first).
  out.push({
    source: 'attr:str:pAtk', label: 'STR scaling', stat: 'pAtk', op: 'addPre',
    value: (r) => (r.str ?? 0) * 1.4,
  });
  out.push({
    source: 'attr:int:mAtk', label: 'INT scaling', stat: 'mAtk', op: 'addPre',
    value: (r) => (r.int ?? 0) * 1.6,
  });
  out.push({
    source: 'attr:con:pDef', label: 'CON scaling', stat: 'pDef', op: 'addPre',
    value: (r) => (r.con ?? 0) * 1.1,
  });
  out.push({
    source: 'attr:men:mDef', label: 'MEN scaling', stat: 'mDef', op: 'addPre',
    value: (r) => (r.men ?? 0) * 1.1,
  });
  out.push({
    source: 'attr:con:hp', label: 'CON HP bonus', stat: 'maxHealth', op: 'addPost',
    value: (r) => ((r.con ?? 8) - 8) * 6,
  });
  out.push({
    source: 'attr:con:hpMul', label: 'CON HP multiplier', stat: 'maxHealth', op: 'mul',
    value: (r) => 1 + ((r.con ?? 8) - 8) * 0.05,
  });
  out.push({
    source: 'attr:men:mp', label: 'MEN MP bonus', stat: 'maxMana', op: 'addPost',
    value: (r) => ((r.men ?? 8) - 8) * 4,
  });
  out.push({
    source: 'attr:con:hpRegen', label: 'CON regen', stat: 'hpRegen', op: 'addPre',
    value: (r) => (r.con ?? 0) * 0.18,
  });
  out.push({
    source: 'attr:men:mpRegen', label: 'MEN regen', stat: 'mpRegen', op: 'addPre',
    value: (r) => (r.men ?? 0) * 0.22,
  });
  out.push({
    source: 'attr:dex:accuracy', label: 'DEX accuracy', stat: 'accuracy', op: 'addPre',
    value: (r) => (r.dex ?? 0) * 0.5,
  });
  out.push({
    source: 'attr:dex:evasion', label: 'DEX evasion', stat: 'evasion', op: 'addPre',
    value: (r) => (r.dex ?? 0) * 0.4,
  });
  out.push({
    source: 'attr:dex:attackSpeed', label: 'DEX attack speed', stat: 'attackSpeed', op: 'addPre',
    value: (r) => (r.dex ?? 0) * 4,
  });
  out.push({
    source: 'attr:wit:castSpeed', label: 'WIT cast speed', stat: 'castSpeed', op: 'addPre',
    // PR QQ — higher = faster cast. Was −0.005/WIT (debuff-looking
    // negative number); now +0.005/WIT so the row reads as a buff.
    value: (r) => (r.wit ?? 0) * 0.005,
  });
  out.push({
    source: 'attr:dex:runSpeed', label: 'DEX run speed', stat: 'runSpeed', op: 'addPre',
    value: (r) => (r.dex ?? 0) * 0.05,
  });
  // Crit % — DEX-driven.
  out.push({
    source: 'attr:dex:critChance', label: 'DEX crit', stat: 'critChance', op: 'addPre',
    value: (r) => ((r.dex ?? 8) - 8) * 0.005,
  });
  out.push({
    source: 'attr:wit:critMult', label: 'WIT crit damage', stat: 'critMult', op: 'addPre',
    value: (r) => ((r.wit ?? 8) - 8) * 0.01,
  });
  // dmgMult — primary attribute (STR for melee classes, INT for magic).
  const primaryAttr: StatId = MAGIC_CLASSES.has(className) ? 'int' : 'str';
  out.push({
    source: `attr:${primaryAttr}:dmgMult`, label: `${primaryAttr.toUpperCase()} damage scaling`, stat: 'dmgMult', op: 'addPre',
    value: (r) => ((r[primaryAttr] ?? 8) - 8) * 0.04,
  });
}

/**
 * PR PP — class differentiation now flows entirely through passive
 * *skills* (one auto-granted + a small tree of learnable ones). The
 * Contribution registry just walks `unlockedSkills`, looks each up
 * in PASSIVE_SKILL_CONTRIBUTIONS, and emits whatever rows that
 * passive declares. Source / label stay stable per-skill so the
 * popup reads "Skill: Battle Hardened" — not "Class: warrior".
 */
function pushPassiveSkillContributions(out: Contribution[], unlockedSkills: readonly SkillId[] | undefined): void {
  if (!unlockedSkills?.length) return;
  for (const skillId of unlockedSkills) {
    const rows = PASSIVE_SKILL_CONTRIBUTIONS[skillId];
    if (!rows?.length) continue;
    for (const row of rows) out.push(row);
  }
}

function pushSpecializationContributions(out: Contribution[], specId: string | null | undefined, level: number): void {
  if (!specId || level < SPECIALIZATION_UNLOCK_LEVEL) return;
  const spec = getSpecializationById(specId);
  if (!spec) return;
  const proficient = level >= PROFICIENCY_LEVEL;
  const label = `Specialization: ${spec.name}${proficient ? ' (Proficient)' : ''}`;
  // v1 placeholder: surface the choice in the breakdown without
  // adjusting numbers. When a passive layer wires stat-affecting
  // spec passives, those rows append here without touching consumers.
  out.push({ source: `spec:${spec.id}`, label, stat: 'dmgMult', op: 'mul', value: 1 });
}

function pushEquipmentContributionsFromTemplateMap(
  out: Contribution[],
  equipped: Partial<Record<EquipSlot, string>>,
  className: CharacterClass,
): void {
  const equippedTemplateIds: string[] = [];
  const setIds = new Set<string>();
  const isMagic = MAGIC_CLASSES.has(className);
  for (const slot of EQUIP_SLOTS) {
    const templateId = equipped[slot];
    if (!templateId) continue;
    const tpl = ITEMS[templateId];
    if (!tpl) continue;
    equippedTemplateIds.push(tpl.id);
    if (tpl.setId) setIds.add(tpl.setId);
    pushItemStats(out, tpl, slot, templateId, isMagic);
  }
  for (const setId of setIds) {
    for (const bonus of activeSetBonuses(setId, equippedTemplateIds)) {
      pushItemStatBlock(out, `set:${setId}:${bonus.requiredCount}`, `Set bonus (${bonus.requiredCount}-pc ${setId})`, bonus.statModifiers, isMagic);
    }
  }
}

function pushEquipmentContributions(out: Contribution[], inventory: CharacterInventory, className: CharacterClass): void {
  const equippedTemplateIds: string[] = [];
  const setIds = new Set<string>();
  const isMagic = MAGIC_CLASSES.has(className);
  const slotEntries = (Object.entries(inventory.equipment) as Array<[EquipSlot, string | undefined]>);
  for (const [slot, instanceId] of slotEntries) {
    if (!instanceId) continue;
    const instance = inventory.items[instanceId];
    if (!instance) continue;
    const tpl = ITEMS[instance.templateId];
    if (!tpl) continue;
    equippedTemplateIds.push(tpl.id);
    if (tpl.setId) setIds.add(tpl.setId);
    pushItemStats(out, tpl, slot, instanceId, isMagic);
  }
  for (const setId of setIds) {
    for (const bonus of activeSetBonuses(setId, equippedTemplateIds)) {
      pushItemStatBlock(out, `set:${setId}:${bonus.requiredCount}`, `Set bonus (${bonus.requiredCount}-pc ${setId})`, bonus.statModifiers, isMagic);
    }
  }
}

function pushItemStats(out: Contribution[], item: Item, slot: EquipSlot, instanceId: string, isMagic: boolean): void {
  if (!item.stats) return;
  pushItemStatBlock(out, `item:${item.id}:${instanceId}:${slot}`, `${item.name} (${slot})`, item.stats, isMagic);
}

function pushItemStatBlock(out: Contribution[], source: string, label: string, stats: NonNullable<Item['stats']>, isMagic: boolean): void {
  // Equipment + set-bonus flats land in `addPost` so they aren't
  // multiplied by class dmgMult — matches the existing balance.
  for (const [k, v] of Object.entries(stats)) {
    if (typeof v !== 'number' || v === 0) continue;
    out.push({ source, label, stat: k as StatId, op: 'addPost', value: v });
  }
  // PR NN — equipment-to-dmgMult contribution (mirrors the old
  // `equipmentDmg = (mAtk|pAtk) * 0.01` line). Melee classes scale
  // dmgMult by pAtk, magic classes by mAtk.
  const primaryAtk = isMagic ? stats.mAtk : stats.pAtk;
  if (typeof primaryAtk === 'number' && primaryAtk > 0) {
    out.push({
      source: `${source}:dmgMult`,
      label: `${label} → damage scaling`,
      stat: 'dmgMult',
      op: 'addPre',
      value: primaryAtk * 0.01,
    });
  }
}

type StatusEffectContributionSpec = {
  stat: StatId;
  op: ContributionOp;
  valueFrom: (effect: StatusEffect) => number;
  labelFrom?: (effect: StatusEffect) => string;
};

const STATUS_EFFECT_STAT_CONTRIBUTIONS: Record<string, StatusEffectContributionSpec> = {
  bless: {
    stat: 'dmgMult', op: 'mul',
    valueFrom: (e) => 1 + (e.value ?? 0) / 100,
    labelFrom: (e) => `Bless (+${e.value ?? 0}% dmg)`,
  },
  slow: {
    stat: 'runSpeed', op: 'mul',
    valueFrom: (e) => 1 - (e.value ?? 0) / 100,
    labelFrom: (e) => `Slow (-${e.value ?? 0}% speed)`,
  },
  shield: {
    stat: 'maxHealth', op: 'addPost',
    valueFrom: (e) => e.value ?? 0,
    labelFrom: (e) => `Shield (+${e.value ?? 0} HP absorb)`,
  },
  evasion: {
    stat: 'evasion', op: 'addPre',
    valueFrom: (e) => e.value ?? 0,
    labelFrom: (e) => `Evasion buff (+${e.value ?? 0})`,
  },
};

function pushStatusEffectContributions(out: Contribution[], effects: ReadonlyArray<StatusEffect>): void {
  for (const effect of effects) {
    const spec = STATUS_EFFECT_STAT_CONTRIBUTIONS[effect.type];
    if (!spec) continue;
    out.push({
      source: `effect:${effect.type}:${effect.id}`,
      label: spec.labelFrom ? spec.labelFrom(effect) : `Effect: ${effect.type}`,
      stat: spec.stat,
      op: spec.op,
      value: spec.valueFrom(effect),
    });
  }
}

// Reserved hook for future use; keeps the type referenced.
export const _SLOT_HOOK: readonly EquipSlot[] = EQUIP_SLOTS;
