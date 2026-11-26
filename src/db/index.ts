import 'dotenv/config';
import dns from 'node:dns';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

dns.setDefaultResultOrder('ipv4first');

declare global {
  var _postgresPool: Pool | undefined;
}

function cleanSecretValue(raw: string | undefined): string {
  let val = (raw || '').trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1).trim();
  }
  return val;
}

export function parsePostgresConnectionConfig(rawInput: string) {
  let cleaned = cleanSecretValue(rawInput);
  if (cleaned.startsWith('SUPABASE_DB_URL=')) {
    cleaned = cleanSecretValue(cleaned.slice('SUPABASE_DB_URL='.length));
  }

  const protoMatch = cleaned.match(/^postgres(?:ql)?:\/\/(.+)$/i);
  if (!protoMatch) {
    return { connectionString: cleaned, ssl: { rejectUnauthorized: false } as const };
  }

  const rest = protoMatch[1];
  const lastAt = rest.lastIndexOf('@');
  if (lastAt === -1) {
    return { connectionString: cleaned, ssl: { rejectUnauthorized: false } as const };
  }

  const credsPart = rest.slice(0, lastAt);
  const hostPart = rest.slice(lastAt + 1);

  const firstColon = credsPart.indexOf(':');
  const rawUser = firstColon === -1 ? credsPart : credsPart.slice(0, firstColon);
  const rawPass = firstColon === -1 ? '' : credsPart.slice(firstColon + 1);

  const safeDecode = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };

  const user = safeDecode(rawUser);
  const password = safeDecode(rawPass);

  const slashIdx = hostPart.indexOf('/');
  const hostPort = slashIdx === -1 ? hostPart : hostPart.slice(0, slashIdx);
  const pathAndQuery = slashIdx === -1 ? '' : hostPart.slice(slashIdx + 1);
  const queryIdx = pathAndQuery.indexOf('?');
  const database = (queryIdx === -1 ? pathAndQuery : pathAndQuery.slice(0, queryIdx)) || 'postgres';

  const colonIdx = hostPort.lastIndexOf(':');
  const host = colonIdx === -1 ? hostPort : hostPort.slice(0, colonIdx);
  const port = colonIdx === -1 ? 5432 : Number(hostPort.slice(colonIdx + 1)) || 5432;

  if (password.includes('[YOUR-PASSWORD]') || (password.startsWith('[') && password.endsWith(']'))) {
    console.warn(
      `[DB Config Warning] SUPABASE_DB_URL password for user "${user}" at ${host}:${port} contains square brackets ([...]). Remove brackets and use your exact Supabase Database Password.`,
    );
  }

  return {
    host,
    port,
    user,
    password,
    database,
    ssl: { rejectUnauthorized: false } as const,
  };
}

function createCloudSqlPool(): Pool {
  const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME,
    max: 10,
    connectionTimeoutMillis: 15000,
  });
  pool.on('error', (err) => {
    console.error('Unexpected error on idle Cloud SQL pool client:', err);
  });
  return pool;
}

export const isSupabaseDbConfigured = () => Boolean(cleanSecretValue(process.env.SUPABASE_DB_URL));

export const createPool = () => {
  if (!global._postgresPool) {
    const supabaseDbUrl = cleanSecretValue(process.env.SUPABASE_DB_URL);
    if (supabaseDbUrl) {
      const parsed = parsePostgresConnectionConfig(supabaseDbUrl);
      global._postgresPool = new Pool({
        ...parsed,
        max: 10,
        connectionTimeoutMillis: 10000,
      });
      global._postgresPool.on('error', (err) => {
        console.error('Unexpected error on idle Supabase SQL pool client:', err);
      });
    } else {
      global._postgresPool = createCloudSqlPool();
    }
  }
  return global._postgresPool;
};

let activePool = createPool();
export let db: NodePgDatabase<typeof schema> = drizzle(activePool, { schema });
export let activeDbBackend: 'supabase' | 'cloudsql' = isSupabaseDbConfigured() ? 'supabase' : 'cloudsql';

export async function verifyAndFallbackDb(): Promise<void> {
  if (!isSupabaseDbConfigured()) {
    activeDbBackend = 'cloudsql';
    return;
  }

  try {
    await activePool.query('SELECT 1');
    activeDbBackend = 'supabase';
    console.log('[DB] Connected to Supabase PostgreSQL.');
  } catch (err) {
    const e = err as { code?: string; message?: string };
    const reason = `${e?.code || 'ERR'}: ${e?.message || 'connection failed'}`;
    if (process.env.SQL_HOST && process.env.SQL_USER && process.env.SQL_DB_NAME) {
      console.warn(
        `[DB Fallback] Could not connect to SUPABASE_DB_URL (${reason}). Update SUPABASE_DB_URL to the IPv4 Session Pooler URI (aws-0-*.pooler.supabase.com:5432). Falling back to Cloud SQL so the app remains online.`,
      );
      const oldPool = activePool;
      activePool = createCloudSqlPool();
      global._postgresPool = activePool;
      db = drizzle(activePool, { schema });
      activeDbBackend = 'cloudsql';
      void oldPool.end().catch(() => {});
    } else {
      throw err;
    }
  }
}
