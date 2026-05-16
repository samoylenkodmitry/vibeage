# Inventory & Equipment System

Server-authoritative Lineage II-style inventory + equipment for Vibeage. This document is the source of truth for the model; the implementation lands in slices listed at the bottom and tracked in `ROADMAP.md`.

## Goals

- Bag inventory with stack rules + weight + slot limits.
- Paperdoll equipment slots (helm, chest, gloves, boots, legs, main-hand, off-hand, neck, two ear slots, two ring slots, belt, cloak, shirt) with room to add later (bracelets, talismans, hair, underwear).
- Stackable and non-stackable items.
- Item instances with their own enchant level, durability, augmentation, bound flag, etc.
- Equipment validation by class / race / level / grade / slot.
- Weapon and off-hand rules (one-hand vs two-hand, dual wield, bow, shield conflicts).
- Armor and jewelry **set bonuses**.
- Weight thresholds + inventory-slot caps.
- Atomic equip / unequip / move / split / merge / drop transactions.
- Persistence.
- Stable client UI sync via diffs, not full snapshots.
- Tests that catch dupes, invalid equips, race conditions, and broken stat recalc.

## Non-negotiables

- Server owns the inventory. The client only renders the projection it has been told about.
- Every inventory mutation is a transaction. Either all affected items move successfully or nothing changes.
- An item exists in **exactly one** `ItemLocation` at a time.
- Equipped items live in the same item table as bag items — `Equipped(slot)` is just a location.
- Recalculating character stats is **derived**, never incrementally mutated by random callsites.

## Core concepts

### Item template vs item instance

Two layers. The template is static game design data; the instance is the runtime-owned object that travels through the world.

`ItemTemplate` (existing `Item` evolves into this):

```ts
type ItemTemplate = {
  templateId: ItemTemplateId;
  name: string;
  description: string;
  icon: string;
  kind: ItemKind;
  grade: ItemGrade;
  weight: number;
  stackable: boolean;
  maxStack: number;
  equip?: EquipSpec;
  stats?: ItemStatBlock;
  setId?: EquipmentSetId;
  flags: ItemFlag[];
};

type ItemKind =
  | 'weapon' | 'shield' | 'armor' | 'jewelry'
  | 'consumable' | 'material' | 'quest' | 'etc' | 'currency';

type ItemGrade = 'none' | 'd' | 'c' | 'b' | 'a' | 's';
type ItemFlag = 'bound' | 'questItem' | 'uniqueEquipped' | 'destroyOnLogout';
```

`ItemInstance` (new, replaces today's `{ itemId, quantity }`):

```ts
type ItemInstance = {
  instanceId: ItemInstanceId;
  ownerId: CharacterId;
  templateId: ItemTemplateId;
  location: ItemLocation;
  count: number;            // always 1 for non-stackable
  enchantLevel: number;     // 0 for now
  durability?: number;
  augmentationId?: string;
  bound: boolean;
  createdAtTs: number;
};
```

Rule: every non-stackable item has a unique `instanceId`. Stackable items may live as one instance with `count > 1`.

### Slot enum

Stable enum keys, not UI order. MVP set:

```
HEAD, CHEST, LEGS, GLOVES, BOOTS,
MAIN_HAND, OFF_HAND,
NECK, EAR_LEFT, EAR_RIGHT, RING_LEFT, RING_RIGHT,
BELT, CLOAK, SHIRT
```

Later: BRACELET_LEFT, BRACELET_RIGHT, TALISMAN_1..6, HAIR, HAIR_ACCESSORY, UNDERWEAR.

Lineage II-like accessory structure: 1 necklace, 2 earrings, 2 rings.

### Equip spec

```ts
type EquipSpec = {
  bodyPart: BodyPart;       // tells the equip resolver which slot family
  allowedSlots: EquipSlot[];
  weaponType?: WeaponType;
  armorType?: ArmorType;
  handUsage?: HandUsage;
  requirements?: EquipRequirements;
};

type BodyPart =
  | 'head' | 'chest' | 'legs' | 'fullBody'
  | 'gloves' | 'boots'
  | 'mainHand' | 'offHand' | 'shield'
  | 'neck' | 'earring' | 'ring'
  | 'belt' | 'cloak' | 'shirt' | 'underwear';

type HandUsage = 'none' | 'oneHand' | 'twoHand' | 'dualWield' | 'bow' | 'fist' | 'shield';

type EquipRequirements = {
  minLevel?: number;
  classes?: CharacterClass[];
  grade?: ItemGrade;
};
```

The item declares `BodyPart.ring`. The equip resolver picks `RING_LEFT` or `RING_RIGHT`, not the item.

### Item location

Discriminated union. An item is in exactly one of these.

```ts
type ItemLocation =
  | { kind: 'inventory'; slotIndex?: number }
  | { kind: 'equipped'; slot: EquipSlot }
  | { kind: 'warehouse'; warehouseId: string; slotIndex?: number }
  | { kind: 'trade'; tradeId: string }
  | { kind: 'mail'; mailId: string }
  | { kind: 'ground'; worldId: string; position: Vec3 }
  | { kind: 'destroyed' };
```

### Character inventory aggregate

```ts
type CharacterInventory = {
  characterId: CharacterId;
  items: Record<ItemInstanceId, ItemInstance>;   // single source of truth
  equipment: Partial<Record<EquipSlot, ItemInstanceId>>;
  limits: InventoryLimits;
};

type InventoryLimits = {
  baseSlots: number;
  bonusSlots: number;
  maxWeight: number;
};
```

Hard invariants enforced by a validator that runs in tests and in dev builds:

- Every equipment-referenced instance lives in `items`.
- Every equipped instance has `location.kind === 'equipped'` and its `slot` matches.
- No two equipment slots reference the same instance (except multi-slot occupancy, see below).
- Stackable items cannot be equipped unless `ItemFlag.uniqueEquipped` permits.
- Non-stackable items must have `count === 1`.
- `Destroyed` instances must not appear in `equipment`.
- `ownerId === characterId`.

## Slot rules

### Multi-slot occupancy

Some items occupy more than one paperdoll slot. Use option B from the spec: record the primary slot and the full occupied set in a single `EquippedEntry`.

```ts
type EquippedEntry = {
  instanceId: ItemInstanceId;
  primarySlot: EquipSlot;
  occupiedSlots: EquipSlot[];
};
```

`occupiedSlotsFor(template)`:

| Body part / hand | Occupied slots                |
| ---------------- | ----------------------------- |
| `fullBody`       | `CHEST + LEGS`                |
| `twoHand` weapon | `MAIN_HAND + OFF_HAND`        |
| `bow`            | `MAIN_HAND + OFF_HAND`        |
| `dualWield`      | `MAIN_HAND + OFF_HAND`        |
| `oneHand` weapon | `MAIN_HAND`                   |
| `shield`         | `OFF_HAND`                    |
| normal armor / jewelry | single declared slot    |

### Ring / earring auto-pick

- If the user supplies a target slot, equip there if it is compatible.
- Otherwise pick the empty compatible slot.
- If both are full, replace the **left** slot by default (`RING_LEFT`, `EAR_LEFT`).
- An `uniqueEquipped` ring/jewel cannot be worn twice on the same character.

### Shield + bow conflict

Equipping a shield while a two-handed weapon (or a bow) is in the main hand **fails** with `TwoHandBlocksOffhand`. Players must explicitly drop the bow first; we never silently unequip a weapon.

## Inventory operations

All operations live on a single `CharacterInventory` service guarded by a per-character async lock.

| Op                             | Behaviour                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `addItem(template, count)`     | Stack into existing stacks first, then new stacks up to `maxStack` / slot cap / weight cap.        |
| `removeItem(template, count)`  | Drain inventory stacks before equipped items. Never auto-consume equipped gear unless allowed.     |
| `moveSlot(instanceId, idx)`    | UI-only reorder. Cannot move equipped or locked items. Merges into compatible stacks.              |
| `splitStack(instanceId, n)`    | Only stackable items. `0 < n < source.count`. Needs a free slot.                                   |
| `mergeStacks(srcId, dstId)`    | Same template, both stackable, respects `maxStack`, same item state if state affects stacking.     |
| `equip(instanceId, slot?)`     | Resolve target slot → compute replaced items → ensure they fit in inventory → atomic swap → diff.  |
| `unequip(slot)`                | Resolve primary item for the slot (handles multi-slot occupancy) → check free bag → atomic move.   |

Every op returns a discriminated result so failures surface as typed errors and the inventory snapshot stays unchanged.

```ts
type EquipError =
  | 'itemNotFound' | 'notOwned' | 'notEquippable' | 'invalidSlot'
  | 'levelTooLow' | 'wrongClass' | 'wrongRace' | 'gradeForbidden'
  | 'twoHandBlocksOffhand' | 'uniqueAlreadyEquipped'
  | 'itemLocked' | 'inventoryFullForUnequippedItems';
```

## Weight + slot caps

- Each item stack consumes one bag slot.
- Equipped items do **not** consume bag slots.
- Equipped items **do** count toward weight (this matches L2 expectations).
- Picking up loot fails if it would exceed the slot cap or the weight cap.

MVP thresholds: simple binary — under cap = OK, over cap = block. Later passes can add the L2 percentage penalty bands.

## Stats

Stats are **derived**. Pipeline:

```
base character stats
  + class/race/level stats
  + per-item stat blocks
  + enchant bonuses
  + augment bonuses
  + armor set bonuses
  + jewelry set bonuses
  + buffs / debuffs / shrines
  + weight penalties
= final stats
```

`recalculateStats(character, equipment)` produces the final block in one go. The server publishes the result to the client; the client never recomputes for damage decisions.

## Equipment sets

```ts
type EquipmentSet = {
  setId: EquipmentSetId;
  name: string;
  requiredPieces: ItemTemplateId[];     // must all be equipped for the full bonus
  optionalPieces?: ItemTemplateId[];    // unlock extra tier (often the shield)
  bonuses: SetBonus[];
};

type SetBonus = {
  requiredCount: number;                // 2 / 4 / full
  statModifiers: ItemStatBlock;
  skillsGranted?: SkillId[];
};
```

Support both styles: exact-piece sets (Blue Wolf armour) and threshold sets (2/4/6 piece bonuses).

## Persistence

- One table for items: `(instance_id, owner_character_id, template_id, location_kind, location_value, count, enchant_level, durability, augmentation_id, bound, created_at, updated_at)`.
- Derive `character_equipment` from `items.location_kind = 'equipped'`. Build the equipment map at load time.
- Add a uniqueness constraint to prevent two items claiming the same slot: `equipment_occupancy(character_id, slot, instance_id, primary_slot)` with `UNIQUE(character_id, slot)`.

## Network protocol

Client → server:

- `C_EquipItem(instanceId, requestedSlot?)`
- `C_UnequipItem(slot)`
- `C_MoveInventoryItem(instanceId, targetBagSlot)`
- `C_SplitStack(instanceId, amount)`
- `C_MergeStacks(sourceId, targetId)`
- `C_DestroyItem(instanceId, amount)`

Server → client (diffs only, never full snapshots):

- `S_InventoryDiff { added, removed, changed, moved }`
- `S_EquipmentDiff { equipped, unequipped }`
- `S_StatsUpdate`
- `S_EquipFailed(error)`

## Locking

Per-character `withInventoryLock` wraps all of: equip, unequip, trade, drop, pickup, mail, warehouse, craft, enchant, destroy, quest reward, shop buy/sell.

Per-item lock reasons:

```
TRADE, MAIL, ENCHANT, CRAFT, PRIVATE_STORE, QUEST_SCRIPT
```

A locked item cannot be moved, destroyed, equipped, traded, or stacked unless the lock owner allows it.

## Implementation slices

Each slice ships in its own PR, must pass `pnpm run check`, and must keep the existing `InventorySlot[]` wire format compatible until slice 4.

1. **Templates + slot enum** — extend `Item` with `equip`, `kind`, `grade`, `weight`; introduce `EquipSlot`, `BodyPart`, `HandUsage`, `EquipSpec`, `EquipRequirements`. Annotate existing items. Add unit tests for the template metadata.
2. **Item instances + locations** — define `ItemInstance` and `ItemLocation`; add a `CharacterInventory` aggregate with `items` + `equipment`; write the invariant validator; migrate `PlayerState` to hold the aggregate (back-compat layer that flattens to `InventorySlot[]` on the wire is fine).
3. **Inventory transactions** — atomic `addItem`, `removeItem`, `moveSlot`, `splitStack`, `mergeStacks` with weight + slot-count enforcement. Loot pickup uses the new pipeline.
4. **Equip / unequip pipeline** — `equip(instanceId, slot?)` / `unequip(slot)` with full validation, multi-slot occupancy, ring/earring auto-pick, atomic refund of replaced items, new protocol messages, server handlers.
5. **Derived stats + set bonuses + paperdoll HUD** — extend `derivePlayerStats` to consume the equipped item bonuses and set bonuses; ship the client paperdoll panel that lists the slots and lets the player click to unequip.

Future passes (not in the initial roll-out): full L2 grade penalties, warehouse, trade, mail, durability, augmentation, weight penalty bands, talisman/bracelet slots, item locks for trade/craft, anti-dupe lock service in front of every mutation.

## Test catalogue

Same as section 16 of the original plan. Every operation must run the invariant validator after committing; failed operations must leave the snapshot unchanged.
