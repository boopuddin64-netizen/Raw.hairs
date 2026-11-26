import { defineConfig, type Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';
import { parsePostgresConnectionConfig } from './index.ts';

dotenv.config();

const supabaseDbUrl = (process.env.SUPABASE_DB_URL || '').trim();

let dbCredentials: Extract<Config, { dialect: 'postgresql' }>['dbCredentials'];

if (supabaseDbUrl) {
  const parsed = parsePostgresConnectionConfig(supabaseDbUrl);
  if ('host' in parsed && parsed.host) {
    dbCredentials = {
      host: parsed.host,
      port: parsed.port,
      user: parsed.user,
      password: parsed.password,
      database: parsed.database,
      ssl: { rejectUnauthorized: false },
    };
  } else {
    dbCredentials = { url: parsed.connectionString || supabaseDbUrl };
  }
} else {
  const sqlHost = process.env.SQL_HOST;
  const sqlDbName = process.env.SQL_DB_NAME;
  const user = process.env.SQL_ADMIN_USER;
  const password = process.env.SQL_ADMIN_PASSWORD;

  if (!sqlHost || !sqlDbName || !user || !password) {
    throw new Error(
      'Set SUPABASE_DB_URL or Cloud SQL env vars (SQL_HOST, SQL_DB_NAME, SQL_ADMIN_USER, SQL_ADMIN_PASSWORD).',
    );
  }

  dbCredentials = {
    host: sqlHost,
    user,
    password,
    database: sqlDbName,
    ssl: false,
  };
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials,
  verbose: true,
});
