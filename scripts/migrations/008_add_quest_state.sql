-- 008: persist per-player quest state.
--
-- quest_state: jsonb of shape `{ active: { [questId]: {stageIndex,
--              progress, readyToClaim?} }, completed: [questId, ...] }`.
--              Engine reads QUESTS in packages/content/quests.ts to
--              interpret the values; the column is just an opaque
--              container. Default '{"active":{},"completed":[]}' so
--              pre-quest accounts hydrate cleanly.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS quest_state jsonb NOT NULL DEFAULT '{"active":{},"completed":[]}'::jsonb;
