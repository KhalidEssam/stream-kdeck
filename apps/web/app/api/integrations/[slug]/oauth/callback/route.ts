import { NextRequest, NextResponse } from 'next/server';
import { getSiteUrl } from '@/lib/env';
import { getPluginBySlug } from '@/lib/integrations/catalog';
import { decryptSecret } from '@/lib/integrations/oauth/crypto';
import { consumeOAuthState } from '@/lib/integrations/oauth/state';
import {
  OAuthProviderConfig,
  getProvider,
  getProviderClientId,
  getProviderClientSecret,
} from '@/lib/integrations/oauth/providers';
import {
  OAuthTokenResponse,
  setCloudConnectionStatus,
  upsertCloudTokens,
} from '@/lib/integrations/oauth/tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const siteUrl = getSiteUrl();

  try {
    const { slug } = await context.params;
    const code = request.nextUrl.searchParams.get('code');
    const rawState = request.nextUrl.searchParams.get('state');
    const providerError = request.nextUrl.searchParams.get('error');

    if (providerError) {
      return redirectWithStatus(siteUrl, undefined, 'error', providerError);
    }
    if (!code || !rawState) {
      return redirectWithStatus(siteUrl, undefined, 'error', 'missing_code_or_state');
    }

    const state = await consumeOAuthState(rawState);
    const plugin = await getPluginBySlug(slug);
    if (!plugin || plugin.id !== state.pluginId || plugin.slug !== state.provider) {
      return redirectWithStatus(siteUrl, state.returnUrl, 'error', 'plugin_mismatch');
    }

    const provider = getProvider(state.provider);
    const tokenResponse = await exchangeCodeForToken({
      provider,
      code,
      redirectUri: state.redirectUri,
      codeVerifierCiphertext: state.codeVerifierCiphertext,
    });
    const account = await readProviderAccount(provider, tokenResponse.access_token);

    await upsertCloudTokens({
      userId: state.userId,
      pluginId: state.pluginId,
      provider: provider.slug,
      tokenResponse,
      fallbackScopes: state.requestedScopes,
      providerAccountId: account.id,
      providerAccountName: account.name,
    });

    await setCloudConnectionStatus({
      userId: state.userId,
      pluginId: state.pluginId,
      status: 'connected',
      displayName: account.name,
      metadata: {
        provider: provider.slug,
        providerAccountId: account.id,
        providerAccountName: account.name,
        scopes: state.requestedScopes,
      },
    });

    return redirectWithStatus(siteUrl, state.returnUrl, 'connected', provider.slug);
  } catch (err) {
    console.error('[web] OAuth callback failed', err);
    return redirectWithStatus(siteUrl, undefined, 'error', err instanceof Error ? err.message : 'oauth_callback_failed');
  }
}

async function exchangeCodeForToken(input: {
  provider: OAuthProviderConfig;
  code: string;
  redirectUri: string;
  codeVerifierCiphertext?: string;
}): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: getProviderClientId(input.provider),
  });

  if (input.provider.clientSecretEnv) {
    body.set('client_secret', getProviderClientSecret(input.provider));
  }

  if (input.codeVerifierCiphertext) {
    body.set('code_verifier', decryptSecret(input.codeVerifierCiphertext));
  }

  const response = await fetch(input.provider.tokenUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const json = (await response.json().catch(() => ({}))) as OAuthTokenResponse & { error?: string; error_description?: string };
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description ?? json.error ?? `Provider token exchange failed (${response.status})`);
  }

  return json;
}

async function readProviderAccount(
  provider: OAuthProviderConfig,
  accessToken: unknown,
): Promise<{ id?: string; name?: string }> {
  if (!provider.profileRequest || typeof accessToken !== 'string') return {};

  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  if (provider.slug === 'twitch') {
    headers['Client-ID'] = getProviderClientId(provider);
  }

  const response = await fetch(provider.profileRequest.url, {
    method: provider.profileRequest.method,
    headers,
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) return {};

  return extractAccount(provider.slug, json);
}

function extractAccount(provider: string, json: Record<string, unknown>): { id?: string; name?: string } {
  if (provider === 'twitch') {
    const first = Array.isArray(json.data) ? json.data[0] : undefined;
    if (isRecord(first)) {
      return {
        id: stringValue(first.id),
        name: stringValue(first.display_name) ?? stringValue(first.login),
      };
    }
  }

  if (provider === 'spotify' || provider === 'github') {
    return {
      id: json.id == null ? undefined : String(json.id),
      name: stringValue(json.display_name) ?? stringValue(json.login) ?? stringValue(json.email),
    };
  }

  if (provider === 'slack') {
    return {
      id: stringValue(json.user_id) ?? stringValue(json.team_id),
      name: stringValue(json.user) ?? stringValue(json.team),
    };
  }

  return {};
}

function redirectWithStatus(
  siteUrl: string,
  returnUrl: string | undefined,
  status: 'connected' | 'error',
  detail: string,
): NextResponse {
  const target = safeReturnUrl(siteUrl, returnUrl);
  target.searchParams.set('integration_status', status);
  target.searchParams.set(status === 'connected' ? 'provider' : 'reason', detail);
  return NextResponse.redirect(target);
}

function safeReturnUrl(siteUrl: string, returnUrl: string | undefined): URL {
  if (returnUrl?.startsWith('kdeck://')) return new URL(returnUrl);
  if (returnUrl?.startsWith('/')) return new URL(returnUrl, siteUrl);

  if (returnUrl) {
    try {
      const candidate = new URL(returnUrl);
      if (candidate.origin === siteUrl) return candidate;
    } catch {}
  }

  return new URL('/dashboard', siteUrl);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}
