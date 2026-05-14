# Persistence Contract

The server persists stable player/account state to Postgres through Kysely. Runtime-only presentation and combat state stays in memory and is rebuilt from authoritative defaults after reconnect.

## Persisted Player Columns

`server/persistence.ts` owns the current allow-list:

- `position_x`, `position_y`, `position_z`
- `health`, `is_alive`
- `level`, `experience`, `class_name`
- `inventory`, `skills`, `skill_shortcuts`, `available_skill_points`
- `last_updated`

Session login upserts only `name`, `socket_id`, and `last_login`.

## Not Persisted

Do not persist transient state such as rotation, mana, cooldown timers, status effects, active cast progress, selected target, movement velocity/history, prediction history, derived max stats, or inventory capacity. Those fields are runtime state or derived from persisted level/content.

When adding a new persisted field, update:

- `PERSISTED_PLAYER_COLUMNS` and `buildStablePlayerPersistenceData` in `server/persistence.ts`
- the Postgres migration
- hydration in `server/players/playerSession.ts`
- `tests/persistence.spec.ts`
- `scripts/check-restored-postgres-compatibility.sql`, so restored backups are checked against the runtime schema
