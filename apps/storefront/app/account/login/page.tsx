import { Suspense } from 'react';

import { AuthPanel } from '@/components/auth-panel';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sign in', robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <div className="sf-container">
      <Suspense fallback={<div className="sf-skeleton" style={{ height: 360, maxWidth: 560 }} />}>
        <AuthPanel initial="signin" />
      </Suspense>
    </div>
  );
}
