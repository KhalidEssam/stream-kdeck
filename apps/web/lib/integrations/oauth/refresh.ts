import { getSupabaseAdmin } from '../../supabase-admin';
import { OAuthProviderConfig, getProviderClientId, getProviderClientSecret } from './providers';
import {
  CloudTokenRow,
  OAuthTokenResponse,
  getCloudToken,
  setCloudConnectionStatus,
  upsertCloudTokens,
} from './tokens';

const REFRESH_SKEW_MS = 60_000;

export async function getFreshAccessToken(input: {
  userId: string;
  pluginId: string;
  provider: OAuthProviderConfig;
}): Promise<CloudTokenRow> {
  const token = await getCloudToken(input.userId, input.pluginId);
  if (!token) {
    throw new Error('Cloud account is not connected');
  }

  if (!needsRefresh(token)) {
    return token;
  }

  if (!token.refreshToken) {
    await setCloudConnectionStatus({ userId: input.userId, pluginId: input.pluginId, status: 'expired' });
    throw new Error('Cloud account needs to be reconnected');
  }

  const claimed = await claimRefreshLock(input.userId, input.pluginId);
  if (!claimed) {
    throw new Error('Cloud token refresh already in progress. Try again in a moment.');
  }

  try {
    const refreshed = await refreshProviderToken(input.provider, token.refreshToken);
    await upsertCloudTokens({
      userId: input.userId,
      pluginId: input.pluginId,
      provider: input.provider.slug,
      tokenResponse: {
        ...refreshed,
        refresh_token: refreshed.refresh_token ?? token.refreshToken,
      },
      fallbackScopes: token.scopes,
      providerAccountId: token.providerAccountId,
      providerAccountName: token.providerAccountName,
    });

    const fresh = await getCloudToken(input.userId, input.pluginId);
    if (!fresh) throw new Error('Token refresh did not persist');
    await setCloudConnectionStatus({ userId: input.userId, pluginId: input.pluginId, status: 'connected' });
    return fresh;
  } catch (err) {
    await setCloudConnectionStatus({ userId: input.userId, pluginId: input.pluginId, status: 'expired' });
    throw err;
  }
}

async function refreshProviderToken(config: OAuthProviderConfig, refreshToken: string): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: getProviderClientId(config),
  });

  if (config.clientSecretEnv) {
    body.set('client_secret', getProviderClientSecret(config));
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const json = (await response.json().catch(() => ({}))) as OAuthTokenResponse & { error?: string; error_description?: string };
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description ?? json.error ?? `Provider token refresh failed (${response.status})`);
  }

  return json;
}

function needsRefresh(token: CloudTokenRow): boolean {
  if (!token.expiresAt) return false;
  return token.expiresAt.getTime() - Date.now() <= REFRESH_SKEW_MS;
}

async function claimRefreshLock(userId: string, pluginId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('claim_token_refresh_lock', {
    p_user_id: userId,
    p_plugin_id: pluginId,
    p_lock_seconds: 30,
  });

  if (error) throw error;
  return data === true;
}
