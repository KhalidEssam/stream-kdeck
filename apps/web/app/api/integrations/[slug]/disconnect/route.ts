import { NextRequest, NextResponse } from 'next/server';
import { getPluginBySlug, isPluginInstalled } from '@/lib/integrations/catalog';
import { requireIntegrationApiSession, integrationApiErrorResponse } from '@/lib/integrations/session';
import { getProvider, getProviderClientId } from '@/lib/integrations/oauth/providers';
import {
  deleteCloudToken,
  getCloudToken,
  setCloudConnectionStatus,
} from '@/lib/integrations/oauth/tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    if (!(await isPluginInstalled(session.userId, plugin.id))) {
      return NextResponse.json({ error: 'PLUGIN_NOT_INSTALLED' }, { status: 409 });
    }

    const token = await getCloudToken(session.userId, plugin.id);
    if (token) {
      await tryRevokeToken(plugin.slug, token.accessToken);
    }

    await deleteCloudToken(session.userId, plugin.id);
    await setCloudConnectionStatus({
      userId: session.userId,
      pluginId: plugin.id,
      status: 'not_configured',
      displayName: null,
      metadata: {},
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return integrationApiErrorResponse(err);
  }
}

async function tryRevokeToken(slug: string, accessToken: string): Promise<void> {
  try {
    const provider = getProvider(slug);
    if (!provider.revokeUrl) return;

    const body = new URLSearchParams({
      token: accessToken,
      client_id: getProviderClientId(provider),
    });

    await fetch(provider.revokeUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
  } catch (err) {
    console.warn('[web] Provider token revoke failed during disconnect', err);
  }
}
