import type { SpecGearSetSpec } from './specGear.js';

/**
 * Roadmap §5 bullet 2, second pass — the (spec × grade) cells the
 * first pass named as still open: mage at C and B, paladin at C,
 * rogue at B, warrior at B.
 *
 * Same contract as `specGear.ts` (read its header first): one grade
 * per set, `intendedSpecs` declared as data, every piece on a
 * distinct slot so both bonus tiers are reachable, and every piece
 * sourced where the band can already equip it.
 *
 * These live in their own file only because `specGear.ts` would
 * cross the 700-line maintainability cap with five more sets in it;
 * the builder, the item shape and the drop wiring are all still
 * `specGear.ts`'s.
 *
 * Why three pieces here where the D/C sets have four: the B-grade
 * sets drop off ordinary frontier mobs rather than a named boss —
 * there is no boss in the Lv 28–40 bands — so a three-piece set at
 * a low per-piece chance is a chase that finishes in a session's
 * worth of hunting instead of a wall.
 *
 * No A/S sets: `GRADE_SPECS` puts A at Lv 52 and the world's
 * highest band tops out at Lv 40, so an A set would be gear no
 * player could wear. §5 calls that worse than no set.
 */

const ROBE = { armorType: 'robe' } as const;
const HEAVY = { armorType: 'heavy' } as const;
const LIGHT = { armorType: 'light' } as const;

export const FRONTIER_GEAR_SPECS: readonly SpecGearSetSpec[] = [
  {
    setId: 'drownedstar_regalia',
    name: 'Drownedstar Regalia',
    grade: 'c',
    minLevel: 22,
    lootTableId: 'boss_loot_cthulun',
    dropChance: 0.12,
    intendedSpecs: ['arcanist', 'pyromancer'],
    pieces: [
      {
        id: 'drownedstar_crown',
        name: 'Drownedstar Crown',
        description: 'Coral and pearl, salvaged from a king who kept wearing it long after drowning.',
        equip: { bodyPart: 'head', allowedSlots: ['HEAD'], ...ROBE },
        stats: { mAtk: 26, mDef: 34, mp: 50, critRate: 3 },
      },
      {
        id: 'drownedstar_handwraps',
        name: 'Drownedstar Handwraps',
        description: 'Abyssal silk that stays dry. The barnacle-stars along the seams open when you cast.',
        equip: { bodyPart: 'gloves', allowedSlots: ['GLOVES'], ...ROBE },
        stats: { mAtk: 24, mDef: 24, mp: 32, critRate: 4 },
      },
      {
        id: 'drownedstar_shroud',
        name: 'Drownedstar Shroud',
        description: 'Deep-water weave with drifting plankton lights. It trails as if still underwater.',
        equip: { bodyPart: 'cloak', allowedSlots: ['CLOAK'], ...ROBE },
        stats: { mAtk: 18, mDef: 32, mp: 44 },
      },
    ],
    bonuses: [
      { requiredCount: 2, statModifiers: { mAtk: 18, mp: 40 } },
      { requiredCount: 3, statModifiers: { mAtk: 44, critRate: 6, mp: 90 } },
    ],
  },
  {
    setId: 'hourwarden_plate',
    name: 'Hourwarden Plate',
    grade: 'c',
    minLevel: 24,
    lootTableId: 'boss_loot_aethariel',
    dropChance: 0.12,
    intendedSpecs: ['phoenix_knight', 'evas_templar'],
    pieces: [
      {
        id: 'hourwarden_helm',
        name: 'Hourwarden Helm',
        description: 'Sand falls behind the visor slit, always at the same rate, whatever Aethariel does to the hour.',
        equip: { bodyPart: 'head', allowedSlots: ['HEAD'], ...HEAVY },
        stats: { pDef: 42, mDef: 30, hp: 55 },
      },
      {
        id: 'hourwarden_gauntlets',
        name: 'Hourwarden Gauntlets',
        description: 'Clockwork knuckles that tick a half-beat ahead of the wearer. Unnerving; useful.',
        equip: { bodyPart: 'gloves', allowedSlots: ['GLOVES'], ...HEAVY },
        stats: { pDef: 34, mDef: 22, hp: 40 },
      },
      {
        id: 'hourwarden_bulwark',
        name: 'Hourwarden Bulwark',
        description: 'A clock face beaten into gold-rimmed plate. Its hands have not moved since the Warden fell.',
        equip: { bodyPart: 'shield', allowedSlots: ['OFF_HAND'], handUsage: 'shield' },
        stats: { pDef: 48, mDef: 36, hp: 70 },
      },
    ],
    bonuses: [
      { requiredCount: 2, statModifiers: { pDef: 26, hp: 60 } },
      { requiredCount: 3, statModifiers: { pDef: 60, mDef: 40, hp: 170 } },
    ],
  },
  {
    setId: 'chronoglass_weave',
    name: 'Chronoglass Weave',
    grade: 'b',
    minLevel: 36,
    lootTableId: 'time_wraith_loot',
    dropChance: 0.06,
    intendedSpecs: ['arcanist', 'pyromancer'],
    pieces: [
      {
        id: 'chronoglass_circlet',
        name: 'Chronoglass Circlet',
        description: 'One grain of sand hangs inside the glass, falling slower than the desert around it.',
        equip: { bodyPart: 'head', allowedSlots: ['HEAD'], ...ROBE },
        stats: { mAtk: 46, mDef: 40, mp: 80, critRate: 4 },
      },
      {
        id: 'chronoglass_wraps',
        name: 'Chronoglass Wraps',
        description: 'Glass filaments run through the silk and light violet a moment before the spell does.',
        equip: { bodyPart: 'gloves', allowedSlots: ['GLOVES'], ...ROBE },
        stats: { mAtk: 42, mDef: 28, mp: 55, critRate: 5 },
      },
      {
        id: 'chronoglass_mantle',
        name: 'Chronoglass Mantle',
        description: 'Spun time-glass, near weightless, refracting an aurora that is not in this sky.',
        equip: { bodyPart: 'cloak', allowedSlots: ['CLOAK'], ...ROBE },
        stats: { mAtk: 34, mDef: 44, mp: 70 },
      },
    ],
    bonuses: [
      { requiredCount: 2, statModifiers: { mAtk: 30, mp: 70 } },
      { requiredCount: 3, statModifiers: { mAtk: 75, critRate: 8, mp: 150 } },
    ],
  },
  {
    setId: 'mirrorstep_leathers',
    name: 'Mirrorstep Leathers',
    grade: 'b',
    minLevel: 36,
    lootTableId: 'chrono_stalker_loot',
    dropChance: 0.06,
    intendedSpecs: ['treasure_hunter', 'plains_walker'],
    pieces: [
      {
        id: 'mirrorstep_hood',
        name: 'Mirrorstep Hood',
        description: 'Mirrored scales sewn into the lining. From the front you are mostly whatever is behind you.',
        equip: { bodyPart: 'head', allowedSlots: ['HEAD'], ...LIGHT },
        stats: { pAtk: 34, pDef: 34, critRate: 6, attackSpeed: 6 },
      },
      {
        id: 'mirrorstep_gloves',
        name: 'Mirrorstep Gloves',
        description: 'Glass plating over the knuckles. Chrono-stalkers flinch at their own reflection.',
        equip: { bodyPart: 'gloves', allowedSlots: ['GLOVES'], ...LIGHT },
        stats: { pAtk: 30, pDef: 26, critRate: 7, attackSpeed: 10 },
      },
      {
        id: 'mirrorstep_boots',
        name: 'Mirrorstep Boots',
        description: 'Glassy soles that leave an after-image a step behind you. It takes the first hit sometimes.',
        equip: { bodyPart: 'boots', allowedSlots: ['BOOTS'], ...LIGHT },
        stats: { pAtk: 18, pDef: 28, attackSpeed: 6, moveSpeed: 0.3 },
      },
    ],
    bonuses: [
      { requiredCount: 2, statModifiers: { critRate: 6, attackSpeed: 8 } },
      { requiredCount: 3, statModifiers: { pAtk: 55, critRate: 12, attackSpeed: 18, moveSpeed: 0.2 } },
    ],
  },
  {
    setId: 'ruinbreaker_harness',
    name: 'Ruinbreaker Harness',
    grade: 'b',
    minLevel: 36,
    lootTableId: 'glass_harrier_loot',
    dropChance: 0.06,
    intendedSpecs: ['berserker', 'slayer'],
    pieces: [
      {
        id: 'ruinbreaker_helm',
        name: 'Ruinbreaker Helm',
        description: 'Horned iron, scarred white by desert glass. The visor cracked and was never replaced.',
        equip: { bodyPart: 'head', allowedSlots: ['HEAD'], ...HEAVY },
        stats: { pAtk: 40, pDef: 48, hp: 80 },
      },
      {
        id: 'ruinbreaker_grips',
        name: 'Ruinbreaker Grips',
        description: 'Studded iron over scorched leather. Built to keep hold of a weapon that is on fire.',
        equip: { bodyPart: 'gloves', allowedSlots: ['GLOVES'], ...HEAVY },
        stats: { pAtk: 46, pDef: 34, attackSpeed: 8 },
      },
      {
        id: 'ruinbreaker_sabatons',
        name: 'Ruinbreaker Sabatons',
        description: 'Glass shards set into the soles for grip on the Chronoglass flats. They sound like breaking.',
        equip: { bodyPart: 'boots', allowedSlots: ['BOOTS'], ...HEAVY },
        stats: { pAtk: 26, pDef: 40, hp: 60, moveSpeed: 0.1 },
      },
    ],
    bonuses: [
      { requiredCount: 2, statModifiers: { pAtk: 34, hp: 70 } },
      { requiredCount: 3, statModifiers: { pAtk: 80, pDef: 50, hp: 190, attackSpeed: 10 } },
    ],
  },
];
