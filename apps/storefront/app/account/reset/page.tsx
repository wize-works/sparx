import { Suspense } from 'react';

import { ResetForm } from '@/components/reset-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Set a new password', robots: { index: false, follow: false } };

export default function ResetPage() {
  return (
    <div className="sf-container">
      <div className="sf-container--prose" style={{ paddingBlock: '2.5rem' }}>
        <h1 className="sf-h2" style={{ marginBottom: '1.5rem' }}>
          Set a new password
        </h1>
        <Suspense fallback={<div className="sf-skeleton" style={{ height: 240 }} />}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
