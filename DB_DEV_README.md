# Development with Database

## Running development environment with database

To run the development environment with PostgreSQL database:

```bash
pnpm run dev:db
```

This command will:
1. Start a PostgreSQL container using Docker Compose
2. Set up the database schema
3. Start the Next.js client and server in development mode
4. Automatically clean up when you exit

## Running production-like environment

To run the full stack in production mode:

```bash
docker compose up --build
```

This will build and start both the PostgreSQL database and the game server.

## Database Connection

When running in development mode, the server connects to:
- `postgres://postgres:postgres@localhost:5432/postgres`

When running in production/Docker mode, the server connects to:
- `postgres://postgres:postgres@db:5432/postgres`

## Accessing the database

You can access the PostgreSQL database directly using:

```bash
psql postgres://postgres:postgres@localhost:5432/postgres
```

To see player data:

```sql
SELECT * FROM players;
```
