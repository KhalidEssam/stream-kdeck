import { getSupabaseAdmin } from '../../supabase-admin';
import { encryptSecret, generateRawState, hashOAuthState } from './crypto';

const DEFAULT_STATE_TTL_MS = 10 * 60 * 1000;

export interface CreatedOAuthState {
  rawState: string;
  expiresAt: Date;
}

export interface ConsumedOAuthState {
  id: string;
  userId: string;
  pluginId: string;
  provider: string;
  requestedScopes: string[];
  codeVerifierCiphertext?: string;
  redirectUri: string;
  returnUrl?: string;
  deviceId?: string;
}

interface RawOAuthState {
  id: string;
  user_id: string;
  plugin_id: string;
  provider: string;
  requested_scopes: string[] | null;
  code_verifier_ciphertext: string | null;
  redirect_uri: string;
  return_url: string | null;
  device_id: string | null;
}

export async function createOAuthState(input: {
  userId: string;
  pluginId: string;
  provider: string;
  requestedScopes: string[];
  redirectUri: string;
  returnUrl?: string;
  deviceId?: string;
  codeVerifier?: string;
  ttlMs?: number;
}): Promise<CreatedOAuthState> {
  const rawState = generateRawState();
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? DEFAULT_STATE_TTL_MS));
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from('integration_oauth_states').insert({
    state_hash: hashOAuthState(rawState),
    user_id: input.userId,
    plugin_id: input.pluginId,
    provider: input.provider,
    requested_scopes: input.requestedScopes,
    code_verifier_ciphertext: input.codeVerifier ? encryptSecret(input.codeVerifier) : null,
    redirect_uri: input.redirectUri,
    return_url: input.returnUrl ?? null,
    device_id: input.deviceId ?? null,
    expires_at: expiresAt.toISOString(),
  });

  if (error) throw error;
  return { rawState, expiresAt };
}

export async function consumeOAuthState(rawState: string): Promise<ConsumedOAuthState> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('consume_integration_oauth_state', {
    p_state_hash: hashOAuthState(rawState),
  });

  if (error || !data) {
    throw new Error(error?.message ?? 'Invalid or expired OAuth state');
  }

  return mapOAuthState(data as RawOAuthState);
}

function mapOAuthState(raw: RawOAuthState): ConsumedOAuthState {
  return {
    id: raw.id,
    userId: raw.user_id,
    pluginId: raw.plugin_id,
    provider: raw.provider,
    requestedScopes: raw.requested_scopes ?? [],
    codeVerifierCiphertext: raw.code_verifier_ciphertext ?? undefined,
    redirectUri: raw.redirect_uri,
    returnUrl: raw.return_url ?? undefined,
    deviceId: raw.device_id ?? undefined,
  };
}
