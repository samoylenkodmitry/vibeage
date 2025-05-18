-- Player table
create table if not exists players (
  id         uuid primary key default gen_random_uuid(),
  socket_id  text unique,
  name       text unique not null,
  level      int  not null default 1,
  xp         int  not null default 0,
  gold       int  not null default 0,
  inventory  jsonb not null default '[]'::jsonb,
  skills     jsonb not null default '[]'::jsonb,
  class_name text not null default 'mage',
  last_login timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists players_name_idx on players(name);

-- Game statistics for analytics
create table if not exists game_stats (
  id         serial primary key,
  category   text not null,
  name       text not null,
  value      numeric not null,
  created_at timestamptz not null default now()
);
create index if not exists game_stats_category_idx on game_stats(category);

-- Server status log
create table if not exists server_events (
  id          serial primary key,
  event_type  text not null,
  description text,
  created_at  timestamptz not null default now()
);

-- Insert server start record when initializing
insert into server_events (event_type, description) 
values ('server_start', 'Server initialized with Postgres persistence');
