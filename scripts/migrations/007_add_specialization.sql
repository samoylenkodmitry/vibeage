-- 007: persist player specialization + per-skill upgrade levels.
--
-- specialization_id: the SpecializationId picked at level 20 (NULL until
--                    the player picks). String column so adding a new
--                    spec id is a content-only change.
-- skill_levels:      JSON map<SkillId, number>. Default '{}'. The cast
--                    pipeline reads this and folds matching
--                    SkillUpgrade entries from packages/content/skills.ts
--                    into damage / cooldown / mana cost on every cast.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS specialization_id text;

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS skill_levels jsonb NOT NULL DEFAULT '{}'::jsonb;
