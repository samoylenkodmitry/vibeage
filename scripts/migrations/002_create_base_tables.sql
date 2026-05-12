-- Migration 002: Create base tables (players, server_events, game_stats)
-- Date: 2025-05-25
-- This migration creates the base tables that should have been created by init.sql

-- Player table
CREATE TABLE IF NOT EXISTS players (
  id         uuid primary key default gen_random_uuid(),
  socket_id  text unique,
  name       text unique not null,
  level      int  not null default 1,
  xp         int  not null default 0,
  experience int  not null default 0,
  gold       int  not null default 0,
  health     int  not null default 100,
  is_alive   boolean not null default true,
  position_x real not null default 0,
  position_y real not null default 0,
  position_z real not null default 0,
  inventory  jsonb not null default '[]'::jsonb,
  skills     jsonb not null default '["fireball"]'::jsonb,
  skill_shortcuts jsonb not null default '["fireball", null, null, null, null, null, null, null, null]'::jsonb,
  available_skill_points int not null default 1,
  class_name text not null default 'mage',
  last_login timestamptz,
  last_updated bigint,
  updated_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS players_name_idx ON players(name);

-- Game statistics for analytics
CREATE TABLE IF NOT EXISTS game_stats (
  id         serial primary key,
  category   text not null,
  name       text not null,
  value      numeric not null,
  created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS game_stats_category_idx ON game_stats(category);

-- Server status log
CREATE TABLE IF NOT EXISTS server_events (
  id          serial primary key,
  event_type  text not null,
  player_id   uuid,
  event_data  jsonb,
  timestamp   bigint,
  description text,
  created_at  timestamptz not null default now()
);

-- Insert server start record
INSERT INTO server_events (event_type, description) 
VALUES ('migration', 'Applied migration 002: Created base tables (players, server_events, game_stats)');
