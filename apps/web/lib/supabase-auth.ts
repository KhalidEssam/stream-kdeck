import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from './env';

let authClient: SupabaseClient | null = null;

export function getSupabaseAuth(): SupabaseClient {
  if (!authClient) {
    authClient = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_ANON_KEY'), {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return authClient;
}
