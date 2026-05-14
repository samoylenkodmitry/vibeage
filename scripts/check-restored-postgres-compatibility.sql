\set ON_ERROR_STOP on

DO $$
DECLARE
  missing_tables text;
BEGIN
  SELECT string_agg(required.table_name, ', ' ORDER BY required.table_name)
  INTO missing_tables
  FROM (
    VALUES
      ('game_stats'),
      ('players'),
      ('server_events')
  ) AS required(table_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.tables actual
    WHERE actual.table_schema = 'public'
      AND actual.table_name = required.table_name
  );

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'missing required restored table(s): %', missing_tables;
  END IF;
END $$;

DO $$
DECLARE
  incompatible_columns text;
BEGIN
  SELECT string_agg(
    format('%s.%s expected %s got %s', required.table_name, required.column_name, required.udt_name, coalesce(actual.udt_name, 'missing')),
    ', '
    ORDER BY required.table_name, required.column_name
  )
  INTO incompatible_columns
  FROM (
    VALUES
      ('game_stats', 'category', 'text'),
      ('game_stats', 'created_at', 'timestamptz'),
      ('game_stats', 'id', 'int4'),
      ('game_stats', 'name', 'text'),
      ('game_stats', 'value', 'numeric'),
      ('players', 'available_skill_points', 'int4'),
      ('players', 'class_name', 'text'),
      ('players', 'experience', 'int4'),
      ('players', 'health', 'int4'),
      ('players', 'id', 'uuid'),
      ('players', 'inventory', 'jsonb'),
      ('players', 'is_alive', 'bool'),
      ('players', 'last_login', 'timestamptz'),
      ('players', 'last_updated', 'int8'),
      ('players', 'level', 'int4'),
      ('players', 'name', 'text'),
      ('players', 'position_x', 'float4'),
      ('players', 'position_y', 'float4'),
      ('players', 'position_z', 'float4'),
      ('players', 'skill_shortcuts', 'jsonb'),
      ('players', 'skills', 'jsonb'),
      ('players', 'socket_id', 'text'),
      ('players', 'starter_progress', 'jsonb'),
      ('players', 'updated_at', 'timestamptz'),
      ('server_events', 'created_at', 'timestamptz'),
      ('server_events', 'description', 'text'),
      ('server_events', 'event_data', 'jsonb'),
      ('server_events', 'event_type', 'text'),
      ('server_events', 'id', 'int4'),
      ('server_events', 'player_id', 'uuid'),
      ('server_events', 'timestamp', 'int8')
  ) AS required(table_name, column_name, udt_name)
  LEFT JOIN information_schema.columns actual
    ON actual.table_schema = 'public'
    AND actual.table_name = required.table_name
    AND actual.column_name = required.column_name
  WHERE actual.udt_name IS DISTINCT FROM required.udt_name;

  IF incompatible_columns IS NOT NULL THEN
    RAISE EXCEPTION 'restored schema is incompatible: %', incompatible_columns;
  END IF;
END $$;

SELECT 'restore_compatibility=ok' AS status;
