import { NextRequest } from 'next/server';
import { apiAuthErrorResponse, requireApiOwner } from '@/lib/auth/guards';
import {
  getPlatformConfigRows,
  isPlatformConfigKey,
  parseConfigInt,
  PlatformConfigKey,
} from '@/lib/platform-config';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireApiOwner();
    return Response.json({ rows: await getPlatformConfigRows() });
  } catch (err) {
    return apiAuthErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireApiOwner();
    const body = (await request.json()) as { values?: unknown };
    if (!isRecord(body.values)) {
      return Response.json({ error: 'INVALID_VALUES' }, { status: 400 });
    }

    const rows: Array<{ key: PlatformConfigKey; value: string }> = [];
    for (const [key, value] of Object.entries(body.values)) {
      if (!isPlatformConfigKey(key)) {
        return Response.json({ error: 'INVALID_CONFIG_KEY', key }, { status: 400 });
      }
      const stringValue = typeof value === 'string' ? value.trim() : String(value ?? '');
      parseConfigInt(key, stringValue, { allowZero: key === 'free_tier_credits' });
      rows.push({ key, value: stringValue });
    }

    if (rows.length) {
      const { error } = await getSupabaseAdmin()
        .from('platform_config')
        .upsert(rows, { onConflict: 'key' });
      if (error) throw error;
    }

    return Response.json({ rows: await getPlatformConfigRows() });
  } catch (err) {
    return apiAuthErrorResponse(err);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
