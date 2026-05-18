import { getAdminStats } from '@/lib/admin-data';
import { apiAuthErrorResponse, requireApiStaff } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireApiStaff();
    return Response.json(await getAdminStats());
  } catch (err) {
    return apiAuthErrorResponse(err);
  }
}
