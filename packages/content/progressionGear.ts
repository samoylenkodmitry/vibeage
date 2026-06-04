import type { EquipmentSet } from './equipmentSets.js';
import type { Item } from './items.js';

/**
 * Deterministic mid/high progression gear that is not tied to named-boss
 * recipes. Quest rewards and the frontier quartermaster both source these
 * pieces, giving the journey simulator visible gear beats between the
 * early boss sets and late boss crafting.
 */
export const PROGRESSION_GEAR_ITEMS: Record<string, Item> = {
  firebreak_sash: {
    id: 'firebreak_sash',
    name: 'Firebreak Sash',
    description: 'Ash-woven belt with copper plates that stay cool during firebreak patrols.',
    icon: 'firebreak_sash.svg',
    stackable: false,
    type: 'armor',
    kind: 'armor',
    grade: 'c',
    weight: 650,
    setId: 'roadwarden_kit',
    equip: { bodyPart: 'belt', allowedSlots: ['BELT'], armorType: 'medium', requirements: { minLevel: 31 } },
    stats: { pDef: 24, mDef: 18, hp: 42 },
  },
  starward_visor: {
    id: 'starward_visor',
    name: 'Starward Visor',
    description: 'A narrow helm-lens that turns starlight into practical battlefield sightlines.',
    icon: 'starward_visor.svg',
    stackable: false,
    type: 'armor',
    kind: 'armor',
    grade: 'c',
    weight: 1050,
    setId: 'roadwarden_kit',
    equip: { bodyPart: 'head', allowedSlots: ['HEAD'], armorType: 'medium', requirements: { minLevel: 34 } },
    stats: { pDef: 30, mDef: 24, mp: 35, critRate: 4 },
  },
  moonfall_cloak: {
    id: 'moonfall_cloak',
    name: 'Moonfall Cloak',
    description: 'A travel cloak lined with pale glass-thread for long roads under cold stars.',
    icon: 'moonfall_cloak.svg',
    stackable: false,
    type: 'armor',
    kind: 'armor',
    grade: 'c',
    weight: 900,
    setId: 'roadwarden_kit',
    equip: { bodyPart: 'cloak', allowedSlots: ['CLOAK'], armorType: 'medium', requirements: { minLevel: 34 } },
    stats: { pDef: 20, mDef: 28, moveSpeed: 0.2 },
  },
  marshward_boots: {
    id: 'marshward_boots',
    name: 'Marshward Boots',
    description: 'Heavy, sealed boots that hold their footing on black water and buried stone.',
    icon: 'marshward_boots.svg',
    stackable: false,
    type: 'armor',
    kind: 'armor',
    grade: 'b',
    weight: 1900,
    setId: 'horizon_watch',
    equip: { bodyPart: 'boots', allowedSlots: ['BOOTS'], armorType: 'heavy', requirements: { minLevel: 37 } },
    stats: { pDef: 46, mDef: 34, hp: 65, moveSpeed: 0.1 },
  },
  riftcall_gloves: {
    id: 'riftcall_gloves',
    name: 'Riftcall Gloves',
    description: 'Glass-knuckled gloves used by scouts who must touch unstable portals and keep their hands.',
    icon: 'riftcall_gloves.svg',
    stackable: false,
    type: 'armor',
    kind: 'armor',
    grade: 'b',
    weight: 1150,
    setId: 'horizon_watch',
    equip: { bodyPart: 'gloves', allowedSlots: ['GLOVES'], armorType: 'heavy', requirements: { minLevel: 37 } },
    stats: { pDef: 36, mDef: 42, attackSpeed: 8 },
  },
  zero_hour_loop: {
    id: 'zero_hour_loop',
    name: 'Zero-Hour Loop',
    description: 'A ring of chronoglass that ticks only when its wearer commits to a strike.',
    icon: 'zero_hour_loop.svg',
    stackable: false,
    type: 'armor',
    kind: 'jewelry',
    grade: 'b',
    weight: 180,
    setId: 'horizon_watch',
    equip: { bodyPart: 'ring', allowedSlots: ['RING_LEFT', 'RING_RIGHT'], requirements: { minLevel: 40 } },
    stats: { mAtk: 34, mp: 48, attackSpeed: 10 },
  },
};

export const PROGRESSION_GEAR_SETS: Record<string, EquipmentSet> = {
  roadwarden_kit: {
    setId: 'roadwarden_kit',
    name: 'Roadwarden Kit',
    requiredPieces: ['firebreak_sash', 'starward_visor', 'moonfall_cloak'],
    bonuses: [
      { requiredCount: 2, statModifiers: { pDef: 16, mDef: 12, hp: 30 } },
      { requiredCount: 3, statModifiers: { pDef: 34, mDef: 34, hp: 75, moveSpeed: 0.2 } },
    ],
  },
  horizon_watch: {
    setId: 'horizon_watch',
    name: 'Horizon Watch',
    requiredPieces: ['marshward_boots', 'riftcall_gloves', 'zero_hour_loop'],
    bonuses: [
      { requiredCount: 2, statModifiers: { pDef: 26, mDef: 26, hp: 45 } },
      { requiredCount: 3, statModifiers: { pDef: 54, mDef: 54, hp: 110, attackSpeed: 12 } },
    ],
  },
};
