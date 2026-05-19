import { EQUIPMENT_STARTER_ITEMS } from './equipmentItems.js';
import { BOSS_GEAR_ITEMS } from './bossGear.js';
import { BOSS_TROPHY_ITEMS } from './miniBosses.js';
import type {
  EquipSpec,
  ItemFlag,
  ItemGrade,
  ItemKind,
  ItemStatBlock,
} from './equipmentTypes.js';

export type ItemId = string;

export interface Item {
  id: ItemId;
  name: string;
  description: string;
  icon: string;
  stackable: boolean;
  maxStack?: number;
  type: 'weapon' | 'armor' | 'consumable' | 'material' | 'currency' | 'recipe';
  // Additional properties for specific item types
  attackPower?: number;
  defenseValue?: number;
  healAmount?: number;
  manaAmount?: number;
  // L2-style equipment metadata. Optional during the migration; future slices
  // require these on every weapon/armor/jewelry template.
  kind?: ItemKind;
  grade?: ItemGrade;
  weight?: number;
  equip?: EquipSpec;
  stats?: ItemStatBlock;
  setId?: string;
  flags?: readonly ItemFlag[];
  /**
   * PR U — recipe payload. Set on items with `type: 'recipe'`. The
   * recipe item itself drops from bosses; players use it from the
   * bag to consume the listed inputs (plus the recipe) and produce
   * the output equipment. Wiki Recipes tab reads this directly so
   * the catalog and the engine share one record.
   */
  recipe?: RecipeSpec;
}

export interface RecipeIngredient {
  itemId: ItemId;
  quantity: number;
}

export interface RecipeSpec {
  inputs: ReadonlyArray<RecipeIngredient>;
  output: RecipeIngredient;
}

/** Resolve the item kind, falling back to the legacy `type` field. */
export function getItemKind(item: Item): ItemKind {
  if (item.kind) {
    return item.kind;
  }
  switch (item.type) {
    case 'weapon': return 'weapon';
    case 'armor': return 'armor';
    case 'consumable': return 'consumable';
    case 'material': return 'material';
    case 'currency': return 'currency';
    default: return 'etc';
  }
}

export function getItemGrade(item: Item): ItemGrade {
  return item.grade ?? 'none';
}

export function getItemWeight(item: Item): number {
  return item.weight ?? 0;
}

export function isUsableConsumable(item: Item | null | undefined): item is Item & { type: 'consumable' } {
  return item?.type === 'consumable' && Boolean((item.healAmount ?? 0) > 0 || (item.manaAmount ?? 0) > 0);
}

export const ITEMS: Record<ItemId, Item> = {
  'gold_coin': {
    id: 'gold_coin',
    name: 'Gold Coin',
    description: 'Standard currency used throughout the realm.',
    icon: 'gold_coin.svg',
    stackable: true,
    maxStack: 9999,
    type: 'currency',
  },
  'health_potion': {
    id: 'health_potion',
    name: 'Health Potion',
    description: 'Restores 50 health points when consumed.',
    icon: 'health_potion.svg',
    stackable: true,
    maxStack: 20,
    type: 'consumable',
    healAmount: 50,
  },
  'goblin_ear': {
    id: 'goblin_ear',
    name: 'Goblin Ear',
    description: 'A grotesque trophy from a fallen goblin. Some alchemists might find it useful.',
    icon: 'goblin_ear.svg',
    stackable: true,
    maxStack: 50,
    type: 'material',
  },
  'slime_jelly': {
    id: 'slime_jelly',
    name: 'Slime Jelly',
    description: 'A springy reagent from low-level meadow slimes.',
    icon: 'slime_jelly.svg',
    stackable: true,
    maxStack: 40,
    type: 'material',
  },
  'sprite_glow': {
    id: 'sprite_glow',
    name: 'Sprite Glow',
    description: 'A small mote of light left behind by meadow sprites.',
    icon: 'sprite_glow.svg',
    stackable: true,
    maxStack: 30,
    type: 'material',
  },
  'worn_sword': {
    id: 'worn_sword',
    name: 'Worn Sword',
    description: 'A basic sword showing signs of wear and tear. Still sharp enough to be useful.',
    icon: 'worn_sword.svg',
    stackable: false,
    type: 'weapon',
    attackPower: 5,
    kind: 'weapon',
    grade: 'none',
    weight: 1500,
    equip: { bodyPart: 'mainHand', allowedSlots: ['MAIN_HAND'], handUsage: 'oneHand', weaponType: 'sword' },
    stats: { pAtk: 5 },
  },
  // New material drops
  'wolf_pelt': {
    id: 'wolf_pelt',
    name: 'Wolf Pelt',
    description: 'A thick, warm pelt from a wild wolf. Useful for crafting armor.',
    icon: 'wolf_pelt.svg',
    stackable: true,
    maxStack: 20,
    type: 'material',
  },
  'troll_bone': {
    id: 'troll_bone',
    name: 'Troll Bone',
    description: 'A massive bone from a defeated troll. Incredibly durable.',
    icon: 'troll_bone.svg',
    stackable: true,
    maxStack: 10,
    type: 'material',
  },
  'orc_fang': {
    id: 'orc_fang',
    name: 'Orc Fang',
    description: 'A sharp fang from an orc warrior. Could be fashioned into a weapon.',
    icon: 'orc_fang.svg',
    stackable: true,
    maxStack: 30,
    type: 'material',
  },
  'dark_essence': {
    id: 'dark_essence',
    name: 'Dark Essence',
    description: 'A swirling mass of dark energy. Radiates malevolent power.',
    icon: 'dark_essence.svg',
    stackable: true,
    maxStack: 15,
    type: 'material',
  },
  'dragon_scale': {
    id: 'dragon_scale',
    name: 'Dragon Scale',
    description: 'A shimmering scale from a mighty dragon. Nearly indestructible.',
    icon: 'dragon_scale.svg',
    stackable: true,
    maxStack: 5,
    type: 'material',
  },
  'crystal_shard': {
    id: 'crystal_shard',
    name: 'Crystal Shard',
    description: 'A glowing crystal fragment infused with magical energy.',
    icon: 'crystal_shard.svg',
    stackable: true,
    maxStack: 50,
    type: 'material',
  },
  'ice_essence': {
    id: 'ice_essence',
    name: 'Ice Essence',
    description: 'Crystallized essence from the Frozen Tundra, cold to the touch.',
    icon: 'ice_essence.svg',
    stackable: true,
    maxStack: 30,
    type: 'material',
  },
  'volcanic_rock': {
    id: 'volcanic_rock',
    name: 'Volcanic Rock',
    description: 'A chunk of hardened lava from the Volcanic Wastes.',
    icon: 'volcanic_rock.svg',
    stackable: true,
    maxStack: 50,
    type: 'material',
  },
  'ethereal_petal': {
    id: 'ethereal_petal',
    name: 'Ethereal Petal',
    description: 'A delicate flower petal that seems to phase in and out of reality.',
    icon: 'ethereal_petal.svg',
    stackable: true,
    maxStack: 25,
    type: 'material',
  },
  'shadow_essence': {
    id: 'shadow_essence',
    name: 'Shadow Essence',
    description: 'Dark energy condensed into physical form, whispers when held.',
    icon: 'shadow_essence.svg',
    stackable: true,
    maxStack: 20,
    type: 'material',
  },
  'temporal_fragment': {
    id: 'temporal_fragment',
    name: 'Temporal Fragment',
    description: 'A piece of time itself, constantly shifting between past and future.',
    icon: 'temporal_fragment.svg',
    stackable: true,
    maxStack: 10,
    type: 'material',
  },
  'celestial_dust': {
    id: 'celestial_dust',
    name: 'Celestial Dust',
    description: 'Stardust from the floating islands, sparkles with divine light.',
    icon: 'celestial_dust.svg',
    stackable: true,
    maxStack: 30,
    type: 'material',
  },
  'platinum_coin': {
    id: 'platinum_coin',
    name: 'Platinum Coin',
    description: 'A rare high-value coin used by powerful traders.',
    icon: 'platinum_coin.svg',
    stackable: true,
    maxStack: 9999,
    type: 'currency',
  },
  'void_fragment': {
    id: 'void_fragment',
    name: 'Void Fragment',
    description: 'A splinter of condensed void energy.',
    icon: 'void_fragment.svg',
    stackable: true,
    maxStack: 30,
    type: 'material',
  },
  'fire_gem': {
    id: 'fire_gem',
    name: 'Fire Gem',
    description: 'A gem with a warm ember glow.',
    icon: 'fire_gem.svg',
    stackable: true,
    maxStack: 25,
    type: 'material',
  },
  'ice_crystal': {
    id: 'ice_crystal',
    name: 'Ice Crystal',
    description: 'A frost-charged crystal shard.',
    icon: 'ice_crystal.svg',
    stackable: true,
    maxStack: 25,
    type: 'material',
  },
  'ethereal_dust': {
    id: 'ethereal_dust',
    name: 'Ethereal Dust',
    description: 'Fine dust that flickers at the edge of sight.',
    icon: 'ethereal_dust.svg',
    stackable: true,
    maxStack: 40,
    type: 'material',
  },
  'star_essence': {
    id: 'star_essence',
    name: 'Star Essence',
    description: 'A bright mote of condensed starlight.',
    icon: 'star_essence.svg',
    stackable: true,
    maxStack: 30,
    type: 'material',
  },
  'temporal_shard': {
    id: 'temporal_shard',
    name: 'Temporal Shard',
    description: 'A sharp fragment that hums with unstable time magic.',
    icon: 'temporal_shard.svg',
    stackable: true,
    maxStack: 20,
    type: 'material',
  },
  'abyssal_pearl': {
    id: 'abyssal_pearl',
    name: 'Abyssal Pearl',
    description: 'A dark pearl from the deepest depths, emanates an otherworldly aura.',
    icon: 'abyssal_pearl.svg',
    stackable: true,
    maxStack: 15,
    type: 'material',
  },
  // New weapons
  'flame_blade': {
    id: 'flame_blade',
    name: 'Flame Blade',
    description: 'A sword wreathed in eternal flames. Burns enemies on contact.',
    icon: 'flame_blade.svg',
    stackable: false,
    type: 'weapon',
    attackPower: 18,
    kind: 'weapon',
    grade: 'c',
    weight: 1600,
    equip: { bodyPart: 'mainHand', allowedSlots: ['MAIN_HAND'], handUsage: 'oneHand', weaponType: 'sword' },
    stats: { pAtk: 18, mAtk: 4 },
  },
  'frost_hammer': {
    id: 'frost_hammer',
    name: 'Frost Hammer',
    description: 'A massive warhammer that freezes the air around it.',
    icon: 'frost_hammer.svg',
    stackable: false,
    type: 'weapon',
    attackPower: 22,
    kind: 'weapon',
    grade: 'c',
    weight: 3200,
    equip: { bodyPart: 'mainHand', allowedSlots: ['MAIN_HAND'], handUsage: 'twoHand', weaponType: 'mace' },
    stats: { pAtk: 22 },
  },
  'void_dagger': {
    id: 'void_dagger',
    name: 'Void Dagger',
    description: 'A dagger forged from pure darkness. Cuts through reality itself.',
    icon: 'void_dagger.svg',
    stackable: false,
    type: 'weapon',
    attackPower: 16,
    kind: 'weapon',
    grade: 'c',
    weight: 600,
    equip: { bodyPart: 'mainHand', allowedSlots: ['MAIN_HAND'], handUsage: 'oneHand', weaponType: 'dagger' },
    stats: { pAtk: 16, critRate: 5 },
  },
  'crystal_staff': {
    id: 'crystal_staff',
    name: 'Crystal Staff',
    description: 'A staff topped with a pure crystal orb. Amplifies magical energy.',
    icon: 'crystal_staff.svg',
    stackable: false,
    type: 'weapon',
    attackPower: 14,
    kind: 'weapon',
    grade: 'c',
    weight: 1800,
    equip: { bodyPart: 'mainHand', allowedSlots: ['MAIN_HAND'], handUsage: 'twoHand', weaponType: 'staff' },
    stats: { pAtk: 14, mAtk: 22 },
  },
  'celestial_sword': {
    id: 'celestial_sword',
    name: 'Celestial Sword',
    description: 'A blade blessed by the stars themselves. Glows with holy light.',
    icon: 'celestial_sword.svg',
    stackable: false,
    type: 'weapon',
    attackPower: 28,
    kind: 'weapon',
    grade: 'a',
    weight: 1700,
    equip: { bodyPart: 'mainHand', allowedSlots: ['MAIN_HAND'], handUsage: 'oneHand', weaponType: 'sword' },
    stats: { pAtk: 28, mAtk: 6 },
  },
  'flame_sword': {
    id: 'flame_sword',
    name: 'Flame Sword',
    description: 'A sword imbued with volcanic fire, deals additional fire damage.',
    icon: 'flame_sword.svg',
    stackable: false,
    type: 'weapon',
    attackPower: 45,
    kind: 'weapon',
    grade: 'a',
    weight: 1700,
    equip: { bodyPart: 'mainHand', allowedSlots: ['MAIN_HAND'], handUsage: 'oneHand', weaponType: 'sword' },
    stats: { pAtk: 45, mAtk: 10 },
  },
  'frost_blade': {
    id: 'frost_blade',
    name: 'Frost Blade',
    description: 'A crystalline blade that freezes enemies on contact.',
    icon: 'frost_blade.svg',
    stackable: false,
    type: 'weapon',
    attackPower: 42,
    kind: 'weapon',
    grade: 'a',
    weight: 1700,
    equip: { bodyPart: 'mainHand', allowedSlots: ['MAIN_HAND'], handUsage: 'oneHand', weaponType: 'sword' },
    stats: { pAtk: 42, mAtk: 8 },
  },
  'shadow_dagger': {
    id: 'shadow_dagger',
    name: 'Shadow Dagger',
    description: 'A dagger forged from pure darkness, strikes from the shadows.',
    icon: 'shadow_dagger.svg',
    stackable: false,
    type: 'weapon',
    attackPower: 38,
    kind: 'weapon',
    grade: 'a',
    weight: 600,
    equip: { bodyPart: 'mainHand', allowedSlots: ['MAIN_HAND'], handUsage: 'oneHand', weaponType: 'dagger' },
    stats: { pAtk: 38, critRate: 8 },
  },
  'celestial_staff': {
    id: 'celestial_staff',
    name: 'Celestial Staff',
    description: 'A staff channeling the power of the stars themselves.',
    icon: 'celestial_staff.svg',
    stackable: false,
    type: 'weapon',
    attackPower: 50,
    kind: 'weapon',
    grade: 'a',
    weight: 1900,
    equip: { bodyPart: 'mainHand', allowedSlots: ['MAIN_HAND'], handUsage: 'twoHand', weaponType: 'staff' },
    stats: { pAtk: 50, mAtk: 60 },
  },
  'temporal_orb': {
    id: 'temporal_orb',
    name: 'Temporal Orb',
    description: 'An orb that manipulates time, allowing for devastating attacks.',
    icon: 'temporal_orb.svg',
    stackable: false,
    type: 'weapon',
    attackPower: 55,
    kind: 'weapon',
    grade: 's',
    weight: 1400,
    equip: { bodyPart: 'mainHand', allowedSlots: ['MAIN_HAND'], handUsage: 'twoHand', weaponType: 'orb' },
    stats: { pAtk: 30, mAtk: 70 },
  },
  // New potions and consumables
  'mana_potion': {
    id: 'mana_potion',
    name: 'Mana Potion',
    description: 'Restores 100 mana points when consumed.',
    icon: 'mana_potion.svg',
    stackable: true,
    maxStack: 20,
    type: 'consumable',
    manaAmount: 100,
  },
  'greater_health_potion': {
    id: 'greater_health_potion',
    name: 'Greater Health Potion',
    description: 'Restores 150 health points when consumed.',
    icon: 'greater_health_potion.svg',
    stackable: true,
    maxStack: 15,
    type: 'consumable',
    healAmount: 150,
  },
  // PR Y — these buff/utility "consumables" don't have a runtime
  // effect yet (no buff or scroll system on the server). Marked as
  // 'material' so the bag UI doesn't surface a non-working "Use"
  // affordance. Flip back to 'consumable' once the buff engine ships.
  'elixir_of_strength': {
    id: 'elixir_of_strength',
    name: 'Elixir of Strength',
    description: 'Temporarily increases attack power for 5 minutes (effect not yet implemented).',
    icon: 'elixir_of_strength.svg',
    stackable: true,
    maxStack: 10,
    type: 'material',
  },
  'fire_resistance_potion': {
    id: 'fire_resistance_potion',
    name: 'Fire Resistance Potion',
    description: 'Provides temporary immunity to fire damage (effect not yet implemented).',
    icon: 'fire_resistance_potion.svg',
    stackable: true,
    maxStack: 10,
    type: 'material',
  },
  'ice_resistance_potion': {
    id: 'ice_resistance_potion',
    name: 'Ice Resistance Potion',
    description: 'Provides temporary immunity to cold damage (effect not yet implemented).',
    icon: 'ice_resistance_potion.svg',
    stackable: true,
    maxStack: 10,
    type: 'material',
  },
  'ethereal_elixir': {
    id: 'ethereal_elixir',
    name: 'Ethereal Elixir',
    description: 'A mystical elixir that phases the drinker partially out of reality (effect not yet implemented).',
    icon: 'ethereal_elixir.svg',
    stackable: true,
    maxStack: 5,
    type: 'material',
  },
  'temporal_draught': {
    id: 'temporal_draught',
    name: 'Temporal Draught',
    description: 'Slows down time around the drinker, increasing reaction speed (effect not yet implemented).',
    icon: 'temporal_draught.svg',
    stackable: true,
    maxStack: 5,
    type: 'material',
  },
  // Quest-specific items
  'ancient_tome': {
    id: 'ancient_tome',
    name: 'Ancient Tome',
    description: 'A weathered book containing forgotten knowledge and spells.',
    icon: 'ancient_tome.svg',
    stackable: false,
    type: 'material',
  },
  'sealed_letter': {
    id: 'sealed_letter',
    name: 'Sealed Letter',
    description: 'An important message with an unbroken wax seal.',
    icon: 'sealed_letter.svg',
    stackable: true,
    maxStack: 10,
    type: 'material',
  },
  'mysterious_artifact': {
    id: 'mysterious_artifact',
    name: 'Mysterious Artifact',
    description: 'An ancient relic of unknown origin and purpose.',
    icon: 'mysterious_artifact.svg',
    stackable: false,
    type: 'material',
  },

  'phoenix_feather': {
    id: 'phoenix_feather',
    name: 'Phoenix Feather',
    description: 'A feather that burns with eternal flame, extremely rare.',
    icon: 'phoenix_feather.svg',
    stackable: true,
    maxStack: 3,
    type: 'material',
  },
  // Dungeon-specific rare drops
  'shadow_crown': {
    id: 'shadow_crown',
    name: 'Crown of Shadows',
    description: 'A dark crown that grants dominion over shadow magic.',
    icon: 'shadow_crown.svg',
    stackable: false,
    type: 'armor',
    defenseValue: 45,
  },
  'flame_heart': {
    id: 'flame_heart',
    name: 'Heart of Flame',
    description: 'The burning core of a fire elemental, pulses with intense heat.',
    icon: 'flame_heart.svg',
    stackable: false,
    type: 'material',
  },
  'frost_diamond': {
    id: 'frost_diamond',
    name: 'Frost Diamond',
    description: 'A diamond that never melts, eternally frozen and beautiful.',
    icon: 'frost_diamond.svg',
    stackable: false,
    type: 'material',
  },
  'void_crystal': {
    id: 'void_crystal',
    name: 'Void Crystal',
    description: 'A crystal that seems to absorb light itself, containing dark power.',
    icon: 'void_crystal.svg',
    stackable: false,
    type: 'material',
  },
  // Currency and special items
  'silver_coin': {
    id: 'silver_coin',
    name: 'Silver Coin',
    description: 'A valuable silver coin used for larger transactions.',
    icon: 'silver_coin.svg',
    stackable: true,
    maxStack: 9999,
    type: 'currency',
  },
  'dungeon_key': {
    id: 'dungeon_key',
    name: 'Dungeon Key',
    description: 'A magical key that can unlock special dungeon doors.',
    icon: 'dungeon_key.svg',
    stackable: true,
    maxStack: 10,
    type: 'material',
  },
  'teleport_scroll': {
    id: 'teleport_scroll',
    name: 'Teleport Scroll',
    description: 'A scroll that instantly transports the user to a safe location (effect not yet implemented).',
    icon: 'teleport_scroll.svg',
    stackable: true,
    maxStack: 5,
    type: 'material',
  },
  'experience_orb': {
    id: 'experience_orb',
    name: 'Experience Orb',
    description: 'A crystallized orb containing pure experience energy (effect not yet implemented).',
    icon: 'experience_orb.svg',
    stackable: true,
    maxStack: 20,
    type: 'material',
  },
  ...EQUIPMENT_STARTER_ITEMS,
  ...BOSS_TROPHY_ITEMS,
  ...BOSS_GEAR_ITEMS,
};
