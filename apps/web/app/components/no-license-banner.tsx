'use client';

import { useSearchParams } from 'next/navigation';

export function NoLicenseBanner() {
  const params = useSearchParams();
  if (params.get('reason') !== 'no_license') return null;

  return (
    <div className="notice-banner" role="alert">
      No active license found for that account. Purchase a license below to get access.
    </div>
  );
}
