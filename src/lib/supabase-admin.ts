import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function cleanEnv(raw: string | undefined): string {
  let val = (raw || '').trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1).trim();
  }
  return val;
}

const supabaseUrl = cleanEnv(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
const serviceRoleKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

export const isSupabaseAdminConfigured = Boolean(
  supabaseUrl && supabaseUrl.startsWith('http') && serviceRoleKey,
);

export const supabaseAdmin: SupabaseClient | null = isSupabaseAdminConfigured
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;
