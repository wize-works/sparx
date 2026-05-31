'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@sparx/auth/client';
import { Button } from '@sparx/ui';

// Lightweight sign-out for the onboarding header — a merchant may want to bail
// out and come back later. Mirrors the dashboard shell's sign-out (Better Auth
// client + redirect to /sign-in); progress is already persisted server-side, so
// resuming drops them back on the saved step.
export function SignOutLink() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function onClick() {
    startTransition(async () => {
      try {
        await authClient.signOut();
      } finally {
        router.push('/sign-in');
        router.refresh();
      }
    });
  }

  return (
    <Button color="primary" variant="link" size="sm" onClick={onClick} disabled={pending}>
      Save &amp; exit
    </Button>
  );
}
