-- Persist the new CharacterInventory aggregate (item instances + equipment
-- slots + occupancy maps). The legacy `inventory` jsonb only carries the
-- flat bag-slot view and drops equipped items on round-trip, so before
-- this column existed gear would silently disappear across server
-- restarts when worn.
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS character_inventory jsonb;

-- No backfill: existing rows have null until first persistence. The
-- hydrate path treats null as "use the legacy bag", which matches
-- pre-migration behaviour for any player that hasn't yet equipped
-- anything since the migration.
