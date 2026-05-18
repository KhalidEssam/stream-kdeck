import { requireOwner } from '@/lib/auth/session';
import { getPlatformConfigRows } from '@/lib/platform-config';
import { PlatformConfigForm } from '../admin-actions';

export default async function PlatformPage() {
  await requireOwner();
  const rows = await getPlatformConfigRows();

  return (
    <section className="panel workspace-panel">
      <h2>Platform config</h2>
      <p className="fine-print">
        Pricing and credit values apply to new checkout and future subscription resets.
      </p>
      <PlatformConfigForm rows={rows} />
    </section>
  );
}
