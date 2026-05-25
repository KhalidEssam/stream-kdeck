import { NextRequest, NextResponse } from 'next/server';
import { getSiteUrl } from '@/lib/env';
import { getPluginBySlug, isPluginInstalled } from '@/lib/integrations/catalog';
import { requireIntegrationApiSession, integrationApiErrorResponse } from '@/lib/integrations/session';
import { createPkcePair } from '@/lib/integrations/oauth/crypto';
import { createOAuthState } from '@/lib/integrations/oauth/state';
import {
  getProvider,
  getProviderClientId,
  serializeScopes,
} from '@/lib/integrations/oauth/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface StartBody {
  scopes?: unknown;
  returnUrl?: unknown;
  deviceId?: unknown;
}

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const session = await requireIntegrationApiSession(request);
    const plugin = await getPluginBySlug(slug);

    if (!plugin) {
      return NextResponse.json({ error: 'PLUGIN_NOT_FOUND' }, { status: 404 });
    }
    if (plugin.connectorType !== 'oauth2') {
      return NextResponse.json({ error: 'PLUGIN_IS_NOT_OAUTH' }, { status: 400 });
    }
    if (!(await isPluginInstalled(session.userId, plugin.id))) {
      return NextResponse.json({ error: 'PLUGIN_NOT_INSTALLED' }, { status: 409 });
    }

    const provider = getProvider(plugin.slug);
    const body = (await request.json().catch(() => ({}))) as StartBody;
    const scopes = parseScopes(body.scopes, provider.defaultScopes);
    const returnUrl = typeof body.returnUrl === 'string' ? body.returnUrl : undefined;
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId : undefined;
    const redirectUri = `${getSiteUrl()}/api/integrations/${encodeURIComponent(slug)}/oauth/callback`;
    const pkce = provider.usesPkce ? createPkcePair() : undefined;
    const state = await createOAuthState({
      userId: session.userId,
      pluginId: plugin.id,
      provider: provider.slug,
      requestedScopes: scopes,
      redirectUri,
      returnUrl,
      deviceId,
      codeVerifier: pkce?.verifier,
    });

    const authorizeUrl = new URL(provider.authUrl);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', getProviderClientId(provider));
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('scope', serializeScopes(provider, scopes));
    authorizeUrl.searchParams.set('state', state.rawState);

    if (pkce) {
      authorizeUrl.searchParams.set('code_challenge', pkce.challenge);
      authorizeUrl.searchParams.set('code_challenge_method', 'S256');
    }

    if (provider.slug === 'youtube') {
      authorizeUrl.searchParams.set('access_type', 'offline');
      authorizeUrl.searchParams.set('prompt', 'consent');
    }

    return NextResponse.json({
      authorizeUrl: authorizeUrl.toString(),
      expiresAt: state.expiresAt.toISOString(),
    });
  } catch (err) {
    if (err instanceof Error) {
      console.error('[web] OAuth start failed', err.message);
    }
    return integrationApiErrorResponse(err);
  }
}

function parseScopes(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const scopes = value.filter((scope): scope is string => typeof scope === 'string' && scope.trim().length > 0);
  return scopes.length ? scopes : fallback;
}
