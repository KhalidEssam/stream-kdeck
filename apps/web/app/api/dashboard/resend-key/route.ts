import { apiAuthErrorResponse, requireApiSession } from '@/lib/auth/guards';
import { getCustomerDashboard } from '@/lib/dashboard-data';
import { sendLicenseEmail } from '@/lib/mail';
import { getPlanConfig } from '@/lib/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const session = await requireApiSession();
    const dashboard = await getCustomerDashboard(session.user.sub, session.user.email);
    if (dashboard.licenseKey && dashboard.email && dashboard.license) {
      const plan = await getPlanConfig(dashboard.license.planId);
      await sendLicenseEmail({
        to: dashboard.email,
        licenseKey: dashboard.licenseKey,
        planName: plan.name,
      });
    }

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Error) console.error('[web] Resend license key failed', err);
    return apiAuthErrorResponse(err);
  }
}
