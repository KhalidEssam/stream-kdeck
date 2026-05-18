import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from './env';

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(
      getEnv('SUPABASE_URL'),
      getEnv('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  }

  return adminClient;
}
