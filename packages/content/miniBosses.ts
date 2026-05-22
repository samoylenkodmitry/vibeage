import { BOSS_GEAR_RECIPE_BY_BOSS } from './bossGear.js';
import type { Item } from './items.js';
import type { LootTable } from './lootTables.js';

/**
 * Single source of truth for mini-boss flavor + drops. Keyed by a
 * stable `id` (slug); zones reference these via the same id on
 * `ZoneMiniBoss.id`, so the Wiki "Bosses" tab + the zone definition
 * can never drift.
 *
 * Each entry carries lore, the signature ability description (text-
 * only for now — engine impl lands in a follow-up), and a per-boss
 * loot table id. The trophy items + loot tables themselves are
 * defined alongside in `BOSS_TROPHY_ITEMS` and `BOSS_LOOT_TABLES`
 * and merged into the global ITEMS / LOOT_TABLES at the seams.
 */
/**
 * Archwork #6 — typed mini-boss mechanic union. Every boss declares
 * which mechanic kind its signature uses; the server engine dispatches
 * impact resolution per kind. Damage = enemy.attackDamage * damageMul
 * so phase / enrage (PR N) still stack on the signature.
 *
 * Today: 'circle' (the original PR Q one-size-fits-all behaviour) and
 * 'donut' (Magmaheart's "jump in or stand far to skip" — safe spot
 * at center). Future kinds: 'cone' (Vorthax), 'summonPack' (Grakk),
 * 'blink' (Mistwalker), etc. Adding a kind requires updating
 * `tickBossSignature` + `resolveBossSignatureImpact` + the wire
 * schema; the exhaustive switch enforces this at compile time.
 */
interface CommonMechanicTiming {
  readonly windUpMs: number;
  readonly cooldownMs: number;
  readonly damageMul: number;
}

export type MiniBossMechanic =
  | (CommonMechanicTiming & { readonly kind: 'circle'; readonly radiusUnits: number })
  | (CommonMechanicTiming & { readonly kind: 'donut'; readonly outerRadius: number; readonly innerRadius: number })
  | (CommonMechanicTiming & {
      readonly kind: 'cone';
      /** Cone length — players further than this from the cast origin are out of range. */
      readonly lengthUnits: number;
      /** Half-angle of the cone in degrees. Total cone arc is 2× this value. */
      readonly halfAngleDeg: number;
    });

/** Outer radius of the mechanic's danger footprint — the radius the
 *  client uses to size the threat decal. */
export function mechanicOuterRadius(m: MiniBossMechanic): number {
  switch (m.kind) {
    case 'circle': return m.radiusUnits;
    case 'donut': return m.outerRadius;
    case 'cone': return m.lengthUnits;
  }
}

/** Inner safe-spot radius. Players inside this distance from the
 *  cast point are spared on impact. Zero for shapes without a safe
 *  spot (every player inside outerRadius takes damage). */
export function mechanicInnerRadius(m: MiniBossMechanic): number {
  switch (m.kind) {
    case 'circle': return 0;
    case 'donut': return m.innerRadius;
    case 'cone': return 0;
  }
}

export interface MiniBossSpec {
  id: string;
  name: string;
  mobType: string;
  zoneHint: string;
  lore: string;
  signatureAbility: {
    name: string;
    description: string;
    mechanic: MiniBossMechanic;
  };
  trophyItemId: string;
  lootTableId: string;
}

/**
 * PR N — uniform enrage / phase-shift tuning applied to every
 * mini-boss spawn. Lived in server/enemies/enemyLifecycle.ts; moved
 * here so the wiki can render the same numbers the engine applies
 * (avoid duplicating constants across server + client).
 */
export const DEFAULT_BOSS_CONFIG = {
  enrageAfterMs: 20_000,
  enragedDamageMul: 1.5,
  phaseTwoHpFraction: 0.5,
  phaseTwoSpeedMul: 1.25,
  phaseTwoDamageMul: 1.25,
} as const;

const DEFAULT_CIRCLE_TIMING: CommonMechanicTiming & { radiusUnits: number } = {
  windUpMs: 2000,
  cooldownMs: 12_000,
  radiusUnits: 8,
  damageMul: 2.0,
};
function circle(
  overrides: Partial<CommonMechanicTiming & { radiusUnits: number }> = {},
): MiniBossMechanic {
  return { kind: 'circle', ...DEFAULT_CIRCLE_TIMING, ...overrides };
}
function donut(
  overrides: Partial<CommonMechanicTiming & { outerRadius: number; innerRadius: number }>,
): MiniBossMechanic {
  return {
    kind: 'donut',
    windUpMs: DEFAULT_CIRCLE_TIMING.windUpMs,
    cooldownMs: DEFAULT_CIRCLE_TIMING.cooldownMs,
    damageMul: DEFAULT_CIRCLE_TIMING.damageMul,
    outerRadius: 10,
    innerRadius: 3,
    ...overrides,
  };
}
function cone(
  overrides: Partial<CommonMechanicTiming & { lengthUnits: number; halfAngleDeg: number }>,
): MiniBossMechanic {
  return {
    kind: 'cone',
    windUpMs: DEFAULT_CIRCLE_TIMING.windUpMs,
    cooldownMs: DEFAULT_CIRCLE_TIMING.cooldownMs,
    damageMul: DEFAULT_CIRCLE_TIMING.damageMul,
    lengthUnits: 14,
    halfAngleDeg: 30,
    ...overrides,
  };
}

export const MINI_BOSSES: Record<string, MiniBossSpec> = {
  grakk: {
    id: 'grakk',
    name: 'Grakk the Goblin Chief',
    mobType: 'goblin',
    zoneHint: 'Wildgrass Meadow',
    lore: 'A scarred goblin warlord who claims the meadow ridge as his throne. His shrieks rally any goblin within earshot.',
    signatureAbility: {
      name: 'Warband Howl',
      description: 'Calls every goblin in the zone to converge on the threat. Killing Grakk first thins the pack fast.',
      mechanic: circle({ windUpMs: 1500, cooldownMs: 9_000, radiusUnits: 6, damageMul: 1.4 }),
    },
    trophyItemId: 'grakk_warband_horn',
    lootTableId: 'boss_loot_grakk',
  },
  old_greyfang: {
    id: 'old_greyfang',
    name: 'Old Greyfang',
    mobType: 'wolf',
    zoneHint: 'Pinewood Hunting Grounds',
    lore: 'The pack-elder of the pinewood, grey-muzzled and slower than the youngbloods — until the kill bite. Carries scars from a hundred winters.',
    signatureAbility: {
      name: 'Hamstring Lunge',
      description: 'A sudden burst of speed that cuts the target’s movement on hit. Easier to dodge if you keep moving.',
      mechanic: circle({ windUpMs: 1200, cooldownMs: 8_000, radiusUnits: 5, damageMul: 1.5 }),
    },
    trophyItemId: 'greyfang_pelt',
    lootTableId: 'boss_loot_old_greyfang',
  },
  hammerback: {
    id: 'hammerback',
    name: 'Hammerback the Hill Troll',
    mobType: 'troll',
    zoneHint: 'Bouldered Hills',
    lore: 'A troll who tore a granite slab from the cliffside and never put it down. The slab is the hammer; the troll is the haft.',
    signatureAbility: {
      name: 'Stone Slam',
      description: 'A wide ground-pound that staggers and knocks back. Telegraphed by Hammerback raising the slab two-handed overhead.',
      mechanic: circle({ windUpMs: 2000, cooldownMs: 10_000, radiusUnits: 7, damageMul: 2.6 }),
    },
    trophyItemId: 'hammerback_slab_chip',
    lootTableId: 'boss_loot_hammerback',
  },
  mistwalker: {
    id: 'mistwalker',
    name: 'The Mistwalker',
    mobType: 'skeleton',
    zoneHint: 'Fogbound Barrows',
    lore: 'A nameless skeleton wreathed in fog so thick it muffles its own footsteps. Cannot be heard coming.',
    signatureAbility: {
      name: 'Veil Step',
      description: 'Phases briefly out of sight and reappears behind the target. Watch the fog’s direction — it leans toward where the Mistwalker will emerge.',
      mechanic: circle({ windUpMs: 1400, cooldownMs: 8_500, radiusUnits: 4, damageMul: 2.2 }),
    },
    trophyItemId: 'mistwalker_shroud',
    lootTableId: 'boss_loot_mistwalker',
  },
  vereth_bone_lord: {
    id: 'vereth_bone_lord',
    name: 'Vereth the Bone Lord',
    mobType: 'necromancer',
    zoneHint: 'Cursed Ruins',
    lore: 'A necromancer who shed his name to bind himself to the marrow of his slain. The ruins hum with the half-dead he keeps on the leash.',
    signatureAbility: {
      name: 'Marrow Tithe',
      description: 'Drains a portion of the target’s HP and routes it into nearby allied skeletons. Burn the skeletons before they hit max stack.',
      mechanic: circle({ windUpMs: 2200, cooldownMs: 11_000, radiusUnits: 9, damageMul: 1.8 }),
    },
    trophyItemId: 'vereth_phylactery',
    lootTableId: 'boss_loot_vereth_bone_lord',
  },
  vorthax_ember_wyrm: {
    id: 'vorthax_ember_wyrm',
    name: 'Vorthax the Ember Wyrm',
    mobType: 'dragon',
    zoneHint: 'Dragon Peaks',
    lore: 'A wyrm whose embers never cooled. Sleeps coiled around the caldera and rises when the wind turns north.',
    signatureAbility: {
      name: 'Cinder Breath',
      description: 'A cone of burning embers fired forward from Vorthax\'s maw. Reposition perpendicular to the cone to clear it.',
      // Archwork #6 follow-up — cone mechanic. The lore was always
      // "a cone of burning embers"; the engine now honours the
      // shape via angular impact resolution.
      mechanic: cone({ windUpMs: 2500, cooldownMs: 14_000, lengthUnits: 14, halfAngleDeg: 30, damageMul: 2.4 }),
    },
    trophyItemId: 'vorthax_ember_scale',
    lootTableId: 'boss_loot_vorthax_ember_wyrm',
  },
  nyaraal: {
    id: 'nyaraal',
    name: 'Nyaraal of the Hollow Path',
    mobType: 'voidwalker',
    zoneHint: 'Shadow Valley',
    lore: 'A voidwalker who walked into the Hollow Path and walked back out, but only mostly. What returned answers to a different name on different days.',
    signatureAbility: {
      name: 'Hollow Echo',
      description: 'Splits into two shadow-copies for a few seconds. The copies hit for half but spread your focus; the original always casts last.',
      mechanic: circle({ windUpMs: 1800, cooldownMs: 10_000, radiusUnits: 7, damageMul: 1.9 }),
    },
    trophyItemId: 'nyaraal_hollow_shard',
    lootTableId: 'boss_loot_nyaraal',
  },
  prism_warden: {
    id: 'prism_warden',
    name: 'The Prism Warden',
    mobType: 'crystal_guardian',
    zoneHint: 'Crystal Caverns',
    lore: 'A construct grown rather than built. Its facets refract every spell back at the caster — but never the same way twice.',
    signatureAbility: {
      name: 'Refraction Bloom',
      description: 'Reflects the next incoming spell back at the caster as a delayed shard. Time your big nukes for after the bloom resolves.',
      mechanic: circle({ windUpMs: 2400, cooldownMs: 13_000, radiusUnits: 9, damageMul: 2.1 }),
    },
    trophyItemId: 'prism_warden_facet',
    lootTableId: 'boss_loot_prism_warden',
  },
  magmaheart: {
    id: 'magmaheart',
    name: 'Magmaheart, Forge Avatar',
    mobType: 'lava_golem',
    zoneHint: 'Sunspire Steppe',
    lore: 'A forge spirit that outgrew its forge. Its molten core is the only forge in the steppe that still answers prayers from smiths.',
    signatureAbility: {
      name: 'Forge Pulse',
      description: 'A rhythmic shockwave from the molten core. The pulse hits in a ring; jump in or stand far to skip it.',
      // Archwork #6 — first non-circle mechanic. The lore literally
      // describes a donut (safe spot at the centre); engine + client
      // now honour that. Outer radius matches the old circle (10);
      // inner safe radius is 3.5 — tight enough to feel risky.
      mechanic: donut({ windUpMs: 1700, cooldownMs: 7_500, outerRadius: 10, innerRadius: 3.5, damageMul: 2.2 }),
    },
    trophyItemId: 'magmaheart_core',
    lootTableId: 'boss_loot_magmaheart',
  },
  skadrun: {
    id: 'skadrun',
    name: 'Skadrun, Tundra King',
    mobType: 'ice_giant',
    zoneHint: 'Moonfall Highland',
    lore: 'An ice giant who calls the highland his throne and the blizzards his crown. Speaks rarely; when he does, the wind carries it for miles.',
    signatureAbility: {
      name: 'Blizzard Crown',
      description: 'Summons a localized blizzard that slows everyone in melee range. Skadrun ignores his own slow; you don’t.',
      mechanic: circle({ windUpMs: 1600, cooldownMs: 9_000, radiusUnits: 6, damageMul: 2.4 }),
    },
    trophyItemId: 'skadrun_crown_shard',
    lootTableId: 'boss_loot_skadrun',
  },
  elder_vinebrook: {
    id: 'elder_vinebrook',
    name: 'Elder Vinebrook',
    mobType: 'ancient_treant',
    zoneHint: 'Silverwood Forest',
    lore: 'A treant so old its roots reach into the riverbed. The vines around the silverwood answer to it whether it asks or not.',
    signatureAbility: {
      name: 'Rootbind',
      description: 'Vines erupt under the target and root them in place. Break free by burning a movement skill or by killing the vine sprouts.',
      mechanic: circle({ windUpMs: 2200, cooldownMs: 11_000, radiusUnits: 8, damageMul: 1.8 }),
    },
    trophyItemId: 'vinebrook_heartwood',
    lootTableId: 'boss_loot_elder_vinebrook',
  },
  cthulun: {
    id: 'cthulun',
    name: 'Cthulun, the Drowned King',
    mobType: 'deep_leviathan',
    zoneHint: 'Abyssal Wetland',
    lore: 'A leviathan from waters deeper than the wetland should hold. The crown of barnacles on its brow is older than the kingdom that named it.',
    signatureAbility: {
      name: 'Drowning Grasp',
      description: 'Long-reach tentacle that pulls the target into melee and silences them. Pre-cast escape skills before pulling aggro.',
      mechanic: circle({ windUpMs: 1900, cooldownMs: 10_000, radiusUnits: 10, damageMul: 2.6 }),
    },
    trophyItemId: 'cthulun_barnacle_crown',
    lootTableId: 'boss_loot_cthulun',
  },
  auriel: {
    id: 'auriel',
    name: 'Auriel of the First Dawn',
    mobType: 'radiant_seraph',
    zoneHint: 'Dawnreach Sanctum',
    lore: 'A seraph who was present at the first sunrise and never stopped being lit by it. Anything she touches casts a long shadow.',
    signatureAbility: {
      name: 'Solar Verdict',
      description: 'Marks the target with a slow descending sunbeam. Move out of the marked tile before the beam lands or eat a heavy hit.',
      mechanic: circle({ windUpMs: 2800, cooldownMs: 12_000, radiusUnits: 5, damageMul: 3.0 }),
    },
    trophyItemId: 'auriel_dawnfeather',
    lootTableId: 'boss_loot_auriel',
  },
  aethariel: {
    id: 'aethariel',
    name: 'Aethariel, Warden of Hours',
    mobType: 'temporal_overlord',
    zoneHint: 'Chronoglass Desert',
    lore: 'A jailer of moments. The hourglasses lining the desert are the hours he has taken from the dead.',
    signatureAbility: {
      name: 'Hourglass Reversal',
      description: 'Rewinds his own HP to where it was a few seconds earlier. The window to burst him down is between the rewind cooldowns.',
      mechanic: circle({ windUpMs: 2600, cooldownMs: 15_000, radiusUnits: 11, damageMul: 2.5 }),
    },
    trophyItemId: 'aethariel_hourglass_sand',
    lootTableId: 'boss_loot_aethariel',
  },
};

export function listMiniBosses(): MiniBossSpec[] {
  return Object.values(MINI_BOSSES);
}

export function getMiniBossById(id: string): MiniBossSpec | null {
  return MINI_BOSSES[id] ?? null;
}

export function getMiniBossByTrophyItem(itemId: string): MiniBossSpec | null {
  for (const boss of Object.values(MINI_BOSSES)) {
    if (boss.trophyItemId === itemId) return boss;
  }
  return null;
}

export function getMiniBossesByMobType(mobType: string): MiniBossSpec[] {
  return Object.values(MINI_BOSSES).filter((b) => b.mobType === mobType);
}

/**
 * Trophy materials — one per mini-boss. Spread into ITEMS at the
 * items.ts seam. Kept here so adding a new boss only touches one
 * file.
 */
export const BOSS_TROPHY_ITEMS: Record<string, Item> = {
  grakk_warband_horn: trophy('grakk_warband_horn', 'Warband Horn', 'A carved tusk-horn Grakk used to rally his goblin warband. Still vibrates faintly.'),
  greyfang_pelt: trophy('greyfang_pelt', 'Greyfang Pelt', 'A weathered wolf pelt from the alpha of the pinewood pack. Insulates against winter chills.'),
  hammerback_slab_chip: trophy('hammerback_slab_chip', 'Slab Chip', 'A fragment of the granite slab Hammerback wielded. Heavier than it looks.'),
  mistwalker_shroud: trophy('mistwalker_shroud', 'Fogbound Shroud', 'Tattered cloth that always feels damp. Muffles sound when worn.'),
  vereth_phylactery: trophy('vereth_phylactery', 'Cracked Phylactery', 'A small reliquary that once anchored Vereth’s necromantic bindings. Cold to the touch.'),
  vorthax_ember_scale: trophy('vorthax_ember_scale', 'Ember Scale', 'A dragon scale that holds heat indefinitely. Smiths covet it.'),
  nyaraal_hollow_shard: trophy('nyaraal_hollow_shard', 'Hollow Shard', 'A shard of the void Nyaraal stepped through. Casts no shadow in any light.'),
  prism_warden_facet: trophy('prism_warden_facet', 'Warden’s Facet', 'A crystal facet from the Prism Warden. Refracts light into colors that aren’t in the spectrum.'),
  magmaheart_core: trophy('magmaheart_core', 'Forge Core', 'The still-warm core of Magmaheart. Could rekindle any forge in the steppe.'),
  skadrun_crown_shard: trophy('skadrun_crown_shard', 'Crown Shard', 'An icy shard of Skadrun’s blizzard-crown. Never melts.'),
  vinebrook_heartwood: trophy('vinebrook_heartwood', 'Vinebrook Heartwood', 'A core of ancient treant wood. Sap still flows when split.'),
  cthulun_barnacle_crown: trophy('cthulun_barnacle_crown', 'Barnacle Crown', 'The crown of barnacles from Cthulun’s brow. Salt-stained and older than any kingdom.'),
  auriel_dawnfeather: trophy('auriel_dawnfeather', 'Dawnfeather', 'A single feather from Auriel’s wing. Glows faintly at sunrise even underground.'),
  aethariel_hourglass_sand: trophy('aethariel_hourglass_sand', 'Hourglass Sand', 'A pinch of sand from one of Aethariel’s hourglasses. Falls upward in the right light.'),
};

/**
 * Per-boss loot tables. Each guarantees the boss’s signature
 * trophy plus the shared "boss_loot" baseline drops (gold, potions,
 * a small chance of a weapon). Spread into LOOT_TABLES at the
 * lootTables.ts seam.
 */
export const BOSS_LOOT_TABLES: Record<string, LootTable> = Object.fromEntries(
  Object.values(MINI_BOSSES).map((boss) => {
    const recipeId = BOSS_GEAR_RECIPE_BY_BOSS[boss.id];
    return [
      boss.lootTableId,
      {
        id: boss.lootTableId,
        drops: [
          { itemId: 'gold_coin', quantity: { min: 15, max: 40 }, chance: 1.0 },
          { itemId: 'health_potion', quantity: { min: 2, max: 5 }, chance: 0.85 },
          { itemId: boss.trophyItemId, quantity: { min: 1, max: 1 }, chance: 1.0 },
          // PR U — rare recipe drop. The trophy is guaranteed; the
          // recipe is the chase reward that unlocks the boss's
          // signature gear when paired with common materials.
          ...(recipeId ? [{ itemId: recipeId, quantity: { min: 1, max: 1 }, chance: 0.15 }] : []),
        ],
      },
    ];
  }),
);

function trophy(id: string, name: string, description: string): Item {
  return {
    id,
    name,
    description,
    icon: `${id}.svg`,
    stackable: true,
    maxStack: 20,
    type: 'material',
  };
}
