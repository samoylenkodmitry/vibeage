-- Migration 004: Persist server-authoritative starter path progress

ALTER TABLE players
ADD COLUMN IF NOT EXISTS starter_progress jsonb not null default '{
  "defeatedEnemies": 0,
  "defeatedEnemyIds": [],
  "lootPickups": 0,
  "levelReached": 1,
  "learnedSkills": 1,
  "isComplete": false,
  "rewardGranted": false
}'::jsonb;

UPDATE players
SET starter_progress = jsonb_set(starter_progress, '{levelReached}', to_jsonb(GREATEST(level, 1)))
WHERE starter_progress->>'levelReached' IS NULL;

UPDATE players
SET starter_progress = jsonb_set(starter_progress, '{learnedSkills}', to_jsonb(jsonb_array_length(skills)))
WHERE starter_progress->>'learnedSkills' IS NULL
  AND jsonb_typeof(skills) = 'array';
