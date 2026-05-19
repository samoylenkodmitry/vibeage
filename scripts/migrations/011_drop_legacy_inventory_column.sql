-- 011: drop the legacy `players.inventory` jsonb column.
--
-- `character_inventory` (migration 006) is the authoritative store
-- for every item instance, including bag contents + equipped slots.
-- The `inventory` column was a derived flat-bag projection kept
-- around as a wire-shape compat shim during the slice 3 migration.
-- Slice 4 (§45.7) cut every persistence path to the column; nothing
-- now writes or reads it. Drop it so the schema stops carrying a
-- ghost source of truth.
--
-- Pre-alpha drop authorised by user; any legacy row whose only
-- inventory data was in this column has already been migrated
-- forward on its most-recent hydrate (`hydratePlayerCharacterInventory`).

ALTER TABLE players DROP COLUMN IF EXISTS inventory;
