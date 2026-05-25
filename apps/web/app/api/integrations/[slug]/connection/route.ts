import { NextRequest, NextResponse } from 'next/server';
import { getPluginBySlug, isPluginInstalled } from '@/lib/integrations/catalog';
import { requireIntegrationApiSession, integrationApiErrorResponse } from '@/lib/integrations/session';
import { getCloudConnectionStatus } from '@/lib/integrations/oauth/tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
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

    const status = await getCloudConnectionStatus(session.userId, plugin.id);
    return NextResponse.json({
      pluginId: plugin.id,
      status: status.status,
      displayName: status.displayName,
      metadata: status.metadata,
      scopes: status.scopes,
      expiresAt: status.expiresAt,
    });
  } catch (err) {
    return integrationApiErrorResponse(err);
  }
}
