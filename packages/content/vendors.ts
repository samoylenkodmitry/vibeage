import { ITEMS, type Item } from './items.js';

/**
 * PR GG — Vendor registry. A vendor is an NPC (lives in
 * packages/content/npcs.ts) plus a shop record here. Same record
 * drives the in-game vendor dialog AND the Wiki "Vendors" tab —
 * single source of truth.
 *
 * Sell-back: every item has a default vendor sell price derived
 * from its grade (see `defaultSellPrice`). A vendor can override
 * the rate (`buyRate`) — a trophy buyer pays more for trophies,
 * a general merchant pays less for junk.
 */
interface VendorStockEntry {
  itemId: string;
  price: number;
}

export interface VendorDef {
  id: string;
  /** Matches an entry in QUEST_NPCS — the dialog gets a "Browse" button. */
  npcId: string;
  name: string;
  title: string;
  description: string;
  /** Items the vendor sells, in display order. */
  stock: readonly VendorStockEntry[];
  /**
   * When present, the vendor only accepts items whose template id
   * matches one of these. Absent ⇒ accepts anything sellable.
   */
  buys?: readonly string[];
  /**
   * Multiplier on `defaultSellPrice`. A trophy buyer might use 1.5;
   * a general-goods stall might use 0.6. Default 1.0.
   */
  buyRate?: number;
}

export const VENDORS: Record<string, VendorDef> = {
  gludin_general_goods: {
    id: 'gludin_general_goods',
    npcId: 'general_goods_thala',
    name: 'Thala',
    title: 'Gludin General Goods',
    description: 'Keeps the city stocked with the small comforts no adventurer admits to needing: potions, scrolls, and the rope they pretended to bring.',
    stock: [
      { itemId: 'health_potion', price: 25 },
      { itemId: 'mana_potion', price: 35 },
      { itemId: 'greater_health_potion', price: 80 },
      // Archwork #7 — the four "(effect not yet implemented)" brews
      // (fire/ice resistance, ethereal elixir, temporal draught)
      // were removed. Re-add with real effects once the buff engine
      // exists.
    ],
    buyRate: 0.6,
  },
  gludin_tinker: {
    id: 'gludin_tinker',
    npcId: 'tinker_drev',
    name: 'Tinker Drev',
    title: 'Apprentice Smith',
    description: 'Sells the starter gear every fresh recruit is too proud to wear and every veteran wishes they had kept.',
    stock: [
      { itemId: 'worn_sword', price: 60 },
      // PR HH — leather + bone + bow + plate range Drev fronted on
      // commission. Cheap end of D-grade so a fresh character can
      // gear up after the first pouch of coin.
      { itemId: 'short_bow', price: 70 },
      { itemId: 'wooden_shield', price: 40 },
      { itemId: 'leather_helmet', price: 50 },
      { itemId: 'leather_tunic', price: 90 },
      { itemId: 'leather_pants', price: 70 },
      { itemId: 'leather_gloves', price: 40 },
      { itemId: 'leather_boots', price: 50 },
      { itemId: 'plate_cuirass', price: 200 },
      { itemId: 'bone_necklace', price: 60 },
      { itemId: 'bone_earring', price: 40 },
      { itemId: 'bone_ring', price: 35 },
      // §49/M1+ — meadow-trophy recipes (slime jelly, sprite glow,
      // phoenix feather) so the trophies players already collect
      // have a real player-made consumable path. Audit-driven; see
      // packages/content/meadowTrophies.ts.
      { itemId: 'recipe_slime_salve', price: 30 },
      { itemId: 'recipe_sprite_phial', price: 40 },
      { itemId: 'recipe_phoenix_draught', price: 120 },
    ],
    buyRate: 0.8,
  },
  gludin_trophy_buyer: {
    id: 'gludin_trophy_buyer',
    npcId: 'trophy_buyer_oren',
    name: 'Oren',
    title: 'Trophy Buyer',
    description: 'Quiet old man with a ledger of trophies and a strict policy: he never asks who you took them from. Pays well for proof of work.',
    stock: [],
    buyRate: 1.5,
  },
};

const GRADE_BASE_PRICE: Record<NonNullable<Item['grade']>, number> = {
  none: 5,
  d: 15,
  c: 30,
  b: 150,
  a: 500,
  s: 2000,
};

/**
 * Default per-unit gold price a vendor pays when buying this item
 * back. Derived from the item's grade so a new piece of gear is
 * automatically priced — no per-item override list to maintain.
 */
function defaultSellPrice(itemId: string): number {
  const item = ITEMS[itemId];
  if (!item) return 0;
  // Currency can't be sold back to a vendor — it's already gold.
  if (item.type === 'currency') return 0;
  const grade = (item.grade ?? 'none') as keyof typeof GRADE_BASE_PRICE;
  return GRADE_BASE_PRICE[grade] ?? GRADE_BASE_PRICE.none;
}

/**
 * Price this specific vendor pays for one unit of `itemId`. Returns
 * 0 when the vendor doesn't accept that item (caller treats 0 as
 * "not buying"). Splits the default price by the vendor's buyRate.
 */
export function vendorSellPriceFor(vendor: VendorDef, itemId: string): number {
  if (vendor.buys && !vendor.buys.includes(itemId)) return 0;
  const base = defaultSellPrice(itemId);
  if (base === 0) return 0;
  const rate = vendor.buyRate ?? 1;
  return Math.max(1, Math.round(base * rate));
}

export function getVendorByNpcId(npcId: string): VendorDef | null {
  for (const v of Object.values(VENDORS)) {
    if (v.npcId === npcId) return v;
  }
  return null;
}

