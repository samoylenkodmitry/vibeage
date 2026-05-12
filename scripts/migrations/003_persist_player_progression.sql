-- Migration 003: Persist player skill progression and hotbar shortcuts
-- Date: 2026-05-12

ALTER TABLE players
ADD COLUMN IF NOT EXISTS skill_shortcuts jsonb not null default '["fireball", null, null, null, null, null, null, null, null]'::jsonb,
ADD COLUMN IF NOT EXISTS available_skill_points int not null default 1;

ALTER TABLE players
ALTER COLUMN skills SET DEFAULT '["fireball"]'::jsonb;

UPDATE players
SET skills = '["fireball"]'::jsonb
WHERE skills IS NULL OR skills = '[]'::jsonb;

UPDATE players
SET skill_shortcuts = '["fireball", null, null, null, null, null, null, null, null]'::jsonb
WHERE skill_shortcuts IS NULL OR skill_shortcuts = '[]'::jsonb;

INSERT INTO server_events (event_type, description)
VALUES ('migration', 'Applied migration 003: Persist player skill progression and hotbar shortcuts');
