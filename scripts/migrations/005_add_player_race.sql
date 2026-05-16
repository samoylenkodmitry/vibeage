-- Migration 005: Persist player race for the L2 character system

ALTER TABLE players
ADD COLUMN IF NOT EXISTS race text not null default 'human';

UPDATE players
SET race = 'human'
WHERE race IS NULL OR race = '';

INSERT INTO server_events (event_type, description)
VALUES ('migration', 'Applied migration 005: Persist player race');
