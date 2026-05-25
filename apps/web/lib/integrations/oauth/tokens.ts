import { getSupabaseAdmin } from '../../supabase-admin';
import { decryptSecret, encryptSecret } from './crypto';

export interface OAuthTokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  scope?: string;
  scopes?: string[];
  [key: string]: unknown;
}

export interface CloudTokenRow {
  userId: string;
  pluginId: string;
  provider: string;
  providerAccountId?: string;
  providerAccountName?: string;
  tokenType?: string;
  scopes: string[];
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

interface RawTokenRow {
  user_id: string;
  plugin_id: string;
  provider: string;
  provider_account_id: string | null;
  provider_account_name: string | null;
  token_type: string | null;
  scopes: string[] | null;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string | null;
  expires_at: string | null;
}

export async function upsertCloudTokens(input: {
  userId: string;
  pluginId: string;
  provider: string;
  tokenResponse: OAuthTokenResponse;
  fallbackScopes: string[];
  providerAccountId?: string;
  providerAccountName?: string;
}): Promise<void> {
  const accessToken = stringValue(input.tokenResponse.access_token);
  if (!accessToken) throw new Error('Provider token response did not include an access token');

  const refreshToken = stringValue(input.tokenResponse.refresh_token);
  const expiresIn = numberValue(input.tokenResponse.expires_in);
  const refreshExpiresIn = numberValue(input.tokenResponse.refresh_expires_in);
  const scopes = scopesFromTokenResponse(input.tokenResponse, input.fallbackScopes);
  const now = Date.now();

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('user_cloud_connection_tokens').upsert(
    {
      user_id: input.userId,
      plugin_id: input.pluginId,
      provider: input.provider,
      provider_account_id: input.providerAccountId ?? null,
      provider_account_name: input.providerAccountName ?? null,
      token_type: stringValue(input.tokenResponse.token_type) ?? 'Bearer',
      scopes,
      access_token_ciphertext: encryptSecret(accessToken),
      refresh_token_ciphertext: refreshToken ? encryptSecret(refreshToken) : null,
      expires_at: expiresIn ? new Date(now + expiresIn * 1000).toISOString() : null,
      refresh_token_expires_at: refreshExpiresIn ? new Date(now + refreshExpiresIn * 1000).toISOString() : null,
      refresh_lock_until: null,
      last_refreshed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,plugin_id' },
  );

  if (error) throw error;
}

export async function getCloudToken(userId: string, pluginId: string): Promise<CloudTokenRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_cloud_connection_tokens')
    .select(
      'user_id, plugin_id, provider, provider_account_id, provider_account_name, token_type, scopes, access_token_ciphertext, refresh_token_ciphertext, expires_at',
    )
    .eq('user_id', userId)
    .eq('plugin_id', pluginId)
    .maybeSingle();

  if (error || !data) return null;
  return mapTokenRow(data as RawTokenRow);
}

export async function deleteCloudToken(userId: string, pluginId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('user_cloud_connection_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('plugin_id', pluginId);

  if (error) throw error;
}

export async function setCloudConnectionStatus(input: {
  userId: string;
  pluginId: string;
  status: 'not_configured' | 'connected' | 'error' | 'expired';
  displayName?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('user_cloud_connections').upsert(
    {
      user_id: input.userId,
      plugin_id: input.pluginId,
      status: input.status,
      display_name: input.displayName ?? null,
      metadata: input.metadata ?? {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,plugin_id' },
  );

  if (error) throw error;
}

export async function getCloudConnectionStatus(userId: string, pluginId: string): Promise<{
  status: 'not_configured' | 'connected' | 'error' | 'expired';
  displayName?: string;
  metadata: Record<string, unknown>;
  scopes: string[];
  expiresAt?: string;
}> {
  const supabase = getSupabaseAdmin();
  const [{ data: connection }, token] = await Promise.all([
    supabase
      .from('user_cloud_connections')
      .select('status, display_name, metadata')
      .eq('user_id', userId)
      .eq('plugin_id', pluginId)
      .maybeSingle(),
    getCloudToken(userId, pluginId),
  ]);

  const row = connection as { status?: string; display_name?: string | null; metadata?: Record<string, unknown> | null } | null;
  return {
    status: isConnectionStatus(row?.status) ? row.status : 'not_configured',
    displayName: row?.display_name ?? token?.providerAccountName,
    metadata: row?.metadata ?? {},
    scopes: token?.scopes ?? [],
    expiresAt: token?.expiresAt?.toISOString(),
  };
}

function mapTokenRow(raw: RawTokenRow): CloudTokenRow {
  return {
    userId: raw.user_id,
    pluginId: raw.plugin_id,
    provider: raw.provider,
    providerAccountId: raw.provider_account_id ?? undefined,
    providerAccountName: raw.provider_account_name ?? undefined,
    tokenType: raw.token_type ?? undefined,
    scopes: raw.scopes ?? [],
    accessToken: decryptSecret(raw.access_token_ciphertext),
    refreshToken: raw.refresh_token_ciphertext ? decryptSecret(raw.refresh_token_ciphertext) : undefined,
    expiresAt: raw.expires_at ? new Date(raw.expires_at) : undefined,
  };
}

export function scopesFromTokenResponse(response: OAuthTokenResponse, fallback: string[]): string[] {
  if (Array.isArray(response.scopes)) return response.scopes.filter((scope): scope is string => typeof scope === 'string');
  if (typeof response.scope === 'string') return response.scope.split(/[,\s]+/).filter(Boolean);
  return fallback;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function isConnectionStatus(value: unknown): value is 'not_configured' | 'connected' | 'error' | 'expired' {
  return value === 'not_configured' || value === 'connected' || value === 'error' || value === 'expired';
}
