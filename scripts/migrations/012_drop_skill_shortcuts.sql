-- 012: drop the legacy `players.skill_shortcuts` jsonb column.
--
-- The action bar is now a purely client-side layout (localStorage),
-- unifying skills + items into one `actionBar` store. The server no
-- longer has any notion of per-slot skill shortcuts: the
-- `SetSkillShortcut` / `SkillShortcutUpdated` protocol, the
-- `player.skillShortcuts` state, and every read/write path were removed.
-- Nothing now writes or reads this column. Drop it so the schema stops
-- carrying a ghost source of truth.
--
-- Pre-alpha drop authorised by user.

ALTER TABLE players DROP COLUMN IF EXISTS skill_shortcuts;
