import 'dotenv/config';
import { Pool } from 'pg';

export const db = new Pool({
  connectionString: process.env.DATABASE_URL, // supplied by docker-compose
  max: 10,   // tweak if CPU bound
});

process.on('SIGTERM', () => db.end());
process.on('SIGINT',  () => db.end());
