import { NextRequest, NextResponse } from 'next/server';
import { executeCloudAction } from '@/lib/integrations/cloud/executor';
import { requireIntegrationApiSession, integrationApiErrorResponse } from '@/lib/integrations/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ExecuteBody {
  pluginId?: unknown;
  toolId?: unknown;
  actionId?: unknown;
  params?: unknown;
  confirmed?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireIntegrationApiSession(request);
    const body = (await request.json()) as ExecuteBody;
    const pluginId = typeof body.pluginId === 'string' ? body.pluginId : '';
    const toolId = typeof body.toolId === 'string' ? body.toolId : '';
    const actionId = typeof body.actionId === 'string' ? body.actionId : '';
    const params = isRecord(body.params) ? body.params : {};

    if (!pluginId || !toolId || !actionId) {
      return NextResponse.json({ success: false, error: 'Missing pluginId, toolId, or actionId' }, { status: 400 });
    }

    const result = await executeCloudAction({
      userId: session.userId,
      pluginId,
      toolId,
      actionId,
      params,
      confirmed: body.confirmed === true,
    });

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (err) {
    return integrationApiErrorResponse(err);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
