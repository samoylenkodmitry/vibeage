-- Migration 001: Add missing columns for persistence system
-- Date: 2025-05-24

-- Add missing columns to players table
ALTER TABLE players 
ADD COLUMN IF NOT EXISTS experience int NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS health int NOT NULL DEFAULT 100,
ADD COLUMN IF NOT EXISTS is_alive boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS position_x real NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS position_y real NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS position_z real NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_updated bigint;

-- Add missing columns to server_events table
ALTER TABLE server_events 
ADD COLUMN IF NOT EXISTS player_id uuid,
ADD COLUMN IF NOT EXISTS event_data jsonb,
ADD COLUMN IF NOT EXISTS timestamp bigint;

-- Record this migration
INSERT INTO server_events (event_type, description) 
VALUES ('migration', 'Applied migration 001: Add persistence columns');
